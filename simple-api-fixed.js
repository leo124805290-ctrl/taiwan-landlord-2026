const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// ---------------------------------------------------------------------
// 環境設定
// ---------------------------------------------------------------------

const PORT = process.env.PORT || 3001;

if (!process.env.DATABASE_URL) {
  console.warn('[WARN] DATABASE_URL 未設定，後端將無法連線資料庫。');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://taiwan-landlord-vietnam-tenant-syst.vercel.app',
  'http://localhost:3000',
]);

function buildAllowedOrigins() {
  const allowed = new Set(DEFAULT_ALLOWED_ORIGINS);
  const raw = process.env.CORS_ORIGIN || '';
  for (const item of raw.split(',')) {
    const v = item.trim();
    if (v) allowed.add(v);
  }
  return allowed;
}

const allowedOrigins = buildAllowedOrigins();

app.use(cors({
  origin(origin, callback) {
    // curl / server-to-server 可能沒有 Origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());

// ---------------------------------------------------------------------
// 共用錯誤回應 helper
// ---------------------------------------------------------------------

function sendError(res, status, message, code) {
  res.status(status).json({
    success: false,
    error: message,
    code,
  });
}

// 取得設定值（以 key 查單一設定）
async function getSetting(client, key, defaultValue) {
  const result = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (result.rowCount === 0) {
    return defaultValue;
  }
  return result.rows[0].value || defaultValue;
}

// 冪等性保護：嘗試註冊 idempotency key，若已存在則視為重複操作
async function ensureIdempotency(client, key) {
  if (!key) return { ok: true, duplicate: false };
  const result = await client.query(
    'INSERT INTO idempotency_keys (key, response) VALUES ($1, NULL) ON CONFLICT (key) DO NOTHING RETURNING key',
    [key],
  );
  if (result.rowCount === 0) {
    return { ok: false, duplicate: true };
  }
  return { ok: true, duplicate: false };
}

// ---------------------------------------------------------------------
// 認證與權限中介層
// ---------------------------------------------------------------------

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return sendError(res, 401, 'Unauthorized', 'AUTH_UNAUTHORIZED');
    }

    const client = await pool.connect();
    try {
      const sessionResult = await client.query(
        `SELECT us.id, us.user_id, us.expires_at, u.username, u.display_name, u.role, u.language, u.is_active
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         WHERE us.token = $1`,
        [token],
      );

      if (sessionResult.rowCount === 0) {
        return sendError(res, 401, 'Token not found', 'AUTH_UNAUTHORIZED');
      }

      const session = sessionResult.rows[0];
      const now = new Date();
      if (session.expires_at <= now) {
        return sendError(res, 401, 'Token expired', 'AUTH_TOKEN_EXPIRED');
      }

      if (!session.is_active) {
        return sendError(res, 401, 'User inactive', 'AUTH_UNAUTHORIZED');
      }

      req.user = {
        id: session.user_id,
        username: session.username,
        display_name: session.display_name,
        role: session.role,
        language: session.language,
      };
      req.token = token;
      next();
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[authenticate] error:', err);
    return sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Unauthorized', 'AUTH_UNAUTHORIZED');
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, 'Forbidden', 'AUTH_UNAUTHORIZED');
    }
    next();
  };
}

// ---------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return sendError(res, 400, 'Username and password are required', 'VALIDATION_ERROR');
  }

  const client = await pool.connect();
  try {
    const userResult = await client.query(
      'SELECT id, username, password_hash, display_name, role, language, is_active FROM users WHERE username = $1',
      [username],
    );

    if (userResult.rowCount === 0) {
      return sendError(res, 401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return sendError(res, 401, 'User inactive', 'AUTH_UNAUTHORIZED');
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return sendError(res, 401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
    }

    const tokenBytes = crypto.randomBytes(32);
    const token = tokenBytes.toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await client.query(
      'INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt],
    );

    return res.json({
      success: true,
      data: {
        token,
      },
    });
  } catch (err) {
    console.error('[/api/auth/login] error:', err);
    return sendError(res, 500, 'Login failed', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM user_sessions WHERE token = $1', [req.token]);
    return res.json({ success: true, data: null });
  } catch (err) {
    console.error('[/api/auth/logout] error:', err);
    return sendError(res, 500, 'Logout failed', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const me = {
    id: req.user.id,
    username: req.user.username,
    display_name: req.user.display_name,
    role: req.user.role,
    language: req.user.language,
  };
  return res.json({
    success: true,
    data: me,
  });
});

// ---------------------------------------------------------------------
// 物業與房間 API
// ---------------------------------------------------------------------

// 取得所有物業
app.get('/api/properties', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, name, address, created_at FROM properties ORDER BY id ASC',
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/properties GET] error:', err);
    return sendError(res, 500, 'Failed to fetch properties', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 新增物業（非 readonly 皆可）
app.post(
  '/api/properties',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { name, address } = req.body || {};
    if (!name) {
      return sendError(res, 400, 'Property name is required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO properties (name, address) VALUES ($1, $2) RETURNING id, name, address, created_at',
        [name, address || null],
      );
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/properties POST] error:', err);
      return sendError(res, 500, 'Failed to create property', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 更新物業
app.put(
  '/api/properties/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const { name, address } = req.body || {};
    if (!name) {
      return sendError(res, 400, 'Property name is required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE properties SET name = $1, address = $2 WHERE id = $3 RETURNING id, name, address, created_at',
        [name, address || null, id],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Property not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/properties/:id PUT] error:', err);
      return sendError(res, 500, 'Failed to update property', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 刪除物業
app.delete(
  '/api/properties/:id',
  authenticate,
  requireRole(['superadmin']),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM properties WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendError(res, 404, 'Property not found', 'NOT_FOUND');
      }
      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('[/api/properties/:id DELETE] error:', err);
      return sendError(res, 500, 'Failed to delete property', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 取得房間列表（可依物業過濾）
app.get('/api/rooms', authenticate, async (req, res) => {
  const { property_id } = req.query || {};
  const params = [];
  let where = '';

  if (property_id) {
    params.push(property_id);
    where = 'WHERE property_id = $1';
  }

  const client = await pool.connect();
  try {
    // 每次查詢前清除逾時鎖定
    const timeoutMinutes = 5;
    await client.query(
      `UPDATE rooms
       SET locked_by = NULL, locked_at = NULL
       WHERE locked_at IS NOT NULL
         AND locked_at < NOW() - INTERVAL '${timeoutMinutes} minutes'`,
    );

    const result = await client.query(
      `SELECT id, property_id, floor, room_number, monthly_rent, deposit, status,
              tenant_name, check_in_date, check_out_date,
              current_meter, previous_meter,
              locked_by, locked_at, created_at
       FROM rooms
       ${where}
       ORDER BY id ASC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/rooms GET] error:', err);
    return sendError(res, 500, 'Failed to fetch rooms', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 新增房間
app.post(
  '/api/rooms',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      property_id,
      floor,
      room_number,
      monthly_rent,
      deposit,
    } = req.body || {};

    if (!property_id || !room_number) {
      return sendError(res, 400, 'property_id and room_number are required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO rooms (
           property_id, floor, room_number, monthly_rent, deposit
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, property_id, floor, room_number, monthly_rent, deposit,
                   status, tenant_name, check_in_date, check_out_date,
                   current_meter, previous_meter, locked_by, locked_at, created_at`,
        [
          property_id,
          floor || null,
          room_number,
          monthly_rent || null,
          deposit || null,
        ],
      );

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/rooms POST] error:', err);
      // 房號重複等情況可視需要解析錯誤訊息
      return sendError(res, 500, 'Failed to create room', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 更新房間資料
app.put(
  '/api/rooms/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const {
      floor,
      room_number,
      monthly_rent,
      deposit,
      status,
    } = req.body || {};

    if (!room_number) {
      return sendError(res, 400, 'room_number is required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE rooms
         SET floor = $1,
             room_number = $2,
             monthly_rent = $3,
             deposit = $4,
             status = COALESCE($5, status)
         WHERE id = $6
         RETURNING id, property_id, floor, room_number, monthly_rent, deposit,
                   status, tenant_name, check_in_date, check_out_date,
                   current_meter, previous_meter, locked_by, locked_at, created_at`,
        [
          floor || null,
          room_number,
          monthly_rent || null,
          deposit || null,
          status || null,
          id,
        ],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/rooms/:id PUT] error:', err);
      return sendError(res, 500, 'Failed to update room', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 刪除房間
app.delete(
  '/api/rooms/:id',
  authenticate,
  requireRole(['superadmin']),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM rooms WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }
      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('[/api/rooms/:id DELETE] error:', err);
      return sendError(res, 500, 'Failed to delete room', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 房間鎖定
app.post(
  '/api/rooms/:id/lock',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const username = req.user.username;
    const timeoutMinutes = 5;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const roomResult = await client.query(
        `SELECT id, locked_by, locked_at
         FROM rooms
         WHERE id = $1
         FOR UPDATE`,
        [id],
      );

      if (roomResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }

      const room = roomResult.rows[0];
      let canLock = false;

      if (!room.locked_by || !room.locked_at) {
        canLock = true;
      } else {
        const lockedAt = room.locked_at;
        const now = new Date();
        const expireAt = new Date(lockedAt.getTime() + timeoutMinutes * 60 * 1000);
        if (expireAt <= now) {
          canLock = true;
        }
      }

      if (!canLock && room.locked_by !== username) {
        await client.query('ROLLBACK');
        return sendError(
          res,
          409,
          `Room is locked by ${room.locked_by}`,
          'ROOM_LOCKED',
        );
      }

      await client.query(
        'UPDATE rooms SET locked_by = $1, locked_at = NOW() WHERE id = $2',
        [username, id],
      );

      await client.query('COMMIT');
      return res.json({ success: true, data: null });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[/api/rooms/:id/lock POST] error:', err);
      return sendError(res, 500, 'Failed to lock room', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 房間解鎖
app.post(
  '/api/rooms/:id/unlock',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE rooms SET locked_by = NULL, locked_at = NULL WHERE id = $1',
        [id],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('[/api/rooms/:id/unlock POST] error:', err);
      return sendError(res, 500, 'Failed to unlock room', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// ---------------------------------------------------------------------
// 收款 / 支出 / 維修 / 歷史 / 設定 / 報表 / 同步
// ---------------------------------------------------------------------

// 收款列表
app.get('/api/payments', authenticate, async (req, res) => {
  const {
    property_id,
    room_id,
    type,
    date_from,
    date_to,
  } = req.query || {};

  const client = await pool.connect();
  try {
    const conditions = ['is_deleted = false'];
    const params = [];

    if (property_id) {
      params.push(property_id);
      conditions.push(`property_id = $${params.length}`);
    }
    if (room_id) {
      params.push(room_id);
      conditions.push(`room_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`paid_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`paid_date <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT id, room_id, property_id, type, amount, paid_date, note, created_by, created_at
       FROM payments
       ${where}
       ORDER BY paid_date DESC, id DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/payments GET] error:', err);
    return sendError(res, 500, 'Failed to fetch payments', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 新增收款
app.post(
  '/api/payments',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      room_id,
      property_id,
      type,
      amount,
      paid_date,
      note,
    } = req.body || {};

    if (!property_id || !type || typeof amount !== 'number') {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO payments (
           room_id, property_id, type, amount, paid_date, note, created_by, is_deleted
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
         RETURNING id, room_id, property_id, type, amount, paid_date, note, created_by, created_at`,
        [
          room_id || null,
          property_id,
          type,
          amount,
          paid_date || new Date(),
          note || null,
          req.user.username,
        ],
      );

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/payments POST] error:', err);
      return sendError(res, 500, 'Failed to create payment', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 軟刪除收款
app.delete(
  '/api/payments/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE payments SET is_deleted = true WHERE id = $1 AND is_deleted = false',
        [id],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Payment not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('[/api/payments/:id DELETE] error:', err);
      return sendError(res, 500, 'Failed to delete payment', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 支出列表
app.get('/api/costs', authenticate, async (req, res) => {
  const {
    property_id,
    room_id,
    category,
    date_from,
    date_to,
    is_initial,
  } = req.query || {};

  const client = await pool.connect();
  try {
    const conditions = ['is_deleted = false'];
    const params = [];

    if (property_id) {
      params.push(property_id);
      conditions.push(`property_id = $${params.length}`);
    }
    if (room_id) {
      params.push(room_id);
      conditions.push(`room_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (typeof is_initial !== 'undefined') {
      const flag = String(is_initial) === 'true';
      params.push(flag);
      conditions.push(`is_initial = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`cost_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`cost_date <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT id, property_id, room_id, category, is_initial,
              amount, cost_date, note, created_by, created_at
       FROM costs
       ${where}
       ORDER BY cost_date DESC, id DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/costs GET] error:', err);
    return sendError(res, 500, 'Failed to fetch costs', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 新增支出
app.post(
  '/api/costs',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      property_id,
      room_id,
      category,
      is_initial,
      amount,
      cost_date,
      note,
    } = req.body || {};

    if (!property_id || !category || typeof amount !== 'number') {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO costs (
           property_id, room_id, category, is_initial,
           amount, cost_date, note, created_by, is_deleted
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         RETURNING id, property_id, room_id, category, is_initial,
                   amount, cost_date, note, created_by, created_at`,
        [
          property_id,
          room_id || null,
          category,
          !!is_initial,
          amount,
          cost_date || new Date(),
          note || null,
          req.user.username,
        ],
      );

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/costs POST] error:', err);
      return sendError(res, 500, 'Failed to create cost', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 更新支出
app.put(
  '/api/costs/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const {
      category,
      is_initial,
      amount,
      cost_date,
      note,
    } = req.body || {};

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE costs
         SET category = COALESCE($1, category),
             is_initial = COALESCE($2, is_initial),
             amount = COALESCE($3, amount),
             cost_date = COALESCE($4, cost_date),
             note = COALESCE($5, note)
         WHERE id = $6 AND is_deleted = false
         RETURNING id, property_id, room_id, category, is_initial,
                   amount, cost_date, note, created_by, created_at`,
        [
          category || null,
          typeof is_initial === 'boolean' ? is_initial : null,
          typeof amount === 'number' ? amount : null,
          cost_date || null,
          note || null,
          id,
        ],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Cost not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/costs/:id PUT] error:', err);
      return sendError(res, 500, 'Failed to update cost', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 軟刪除支出
app.delete(
  '/api/costs/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE costs SET is_deleted = true WHERE id = $1 AND is_deleted = false',
        [id],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Cost not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('[/api/costs/:id DELETE] error:', err);
      return sendError(res, 500, 'Failed to delete cost', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 維修列表
app.get('/api/maintenance', authenticate, async (req, res) => {
  const { property_id, room_id, status } = req.query || {};
  const client = await pool.connect();
  try {
    const conditions = [];
    const params = [];

    if (property_id) {
      params.push(property_id);
      conditions.push(`property_id = $${params.length}`);
    }
    if (room_id) {
      params.push(room_id);
      conditions.push(`room_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT id, room_id, property_id, title, description,
              status, estimated_cost, actual_cost,
              completed_at, created_by, created_at
       FROM maintenance
       ${where}
       ORDER BY created_at DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/maintenance GET] error:', err);
    return sendError(res, 500, 'Failed to fetch maintenance', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 新增維修
app.post(
  '/api/maintenance',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      room_id,
      property_id,
      title,
      description,
      status,
      estimated_cost,
      actual_cost,
      completed_at,
    } = req.body || {};

    if (!property_id || !title) {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO maintenance (
           room_id, property_id, title, description, status,
           estimated_cost, actual_cost, completed_at, created_by
         ) VALUES ($1, $2, $3, $4, COALESCE($5, 'pending'),
                   $6, $7, $8, $9)
         RETURNING id, room_id, property_id, title, description, status,
                   estimated_cost, actual_cost, completed_at, created_by, created_at`,
        [
          room_id || null,
          property_id,
          title,
          description || null,
          status || null,
          typeof estimated_cost === 'number' ? estimated_cost : null,
          typeof actual_cost === 'number' ? actual_cost : null,
          completed_at || null,
          req.user.username,
        ],
      );

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/maintenance POST] error:', err);
      return sendError(res, 500, 'Failed to create maintenance', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 更新維修
app.put(
  '/api/maintenance/:id',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      estimated_cost,
      actual_cost,
      completed_at,
    } = req.body || {};

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE maintenance
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             status = COALESCE($3, status),
             estimated_cost = COALESCE($4, estimated_cost),
             actual_cost = COALESCE($5, actual_cost),
             completed_at = COALESCE($6, completed_at)
         WHERE id = $7
         RETURNING id, room_id, property_id, title, description, status,
                   estimated_cost, actual_cost, completed_at, created_by, created_at`,
        [
          title || null,
          description || null,
          status || null,
          typeof estimated_cost === 'number' ? estimated_cost : null,
          typeof actual_cost === 'number' ? actual_cost : null,
          completed_at || null,
          id,
        ],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Maintenance not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/maintenance/:id PUT] error:', err);
      return sendError(res, 500, 'Failed to update maintenance', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 歷史紀錄列表
app.get('/api/history', authenticate, async (req, res) => {
  const {
    property_id,
    room_id,
    action,
    date_from,
    date_to,
  } = req.query || {};

  const client = await pool.connect();
  try {
    const conditions = [];
    const params = [];

    if (property_id) {
      params.push(property_id);
      conditions.push(`property_id = $${params.length}`);
    }
    if (room_id) {
      params.push(room_id);
      conditions.push(`room_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT id, room_id, property_id, action, description,
              amount, performed_by, created_at
       FROM history
       ${where}
       ORDER BY created_at DESC, id DESC`,
      params,
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/history GET] error:', err);
    return sendError(res, 500, 'Failed to fetch history', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 回補歷史紀錄
app.post(
  '/api/history/backfill',
  authenticate,
  requireRole(['superadmin']),
  async (req, res) => {
    const {
      room_id,
      property_id,
      action,
      description,
      amount,
      created_at,
    } = req.body || {};

    if (!property_id || !action) {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO history (
           room_id, property_id, action, description,
           amount, performed_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
         RETURNING id, room_id, property_id, action, description,
                   amount, performed_by, created_at`,
        [
          room_id || null,
          property_id,
          action,
          description || null,
          typeof amount === 'number' ? amount : null,
          req.user.username,
          created_at || null,
        ],
      );

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/history/backfill POST] error:', err);
      return sendError(res, 500, 'Failed to backfill history', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 系統設定
app.get('/api/settings', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT key, value, label, updated_at FROM settings ORDER BY key ASC',
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[/api/settings GET] error:', err);
    return sendError(res, 500, 'Failed to fetch settings', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

app.put(
  '/api/settings/:key',
  authenticate,
  requireRole(['superadmin']),
  async (req, res) => {
    const { key } = req.params;
    const { value } = req.body || {};

    if (typeof value === 'undefined') {
      return sendError(res, 400, 'value is required', 'VALIDATION_ERROR');
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE settings
         SET value = $1, updated_at = NOW()
         WHERE key = $2
         RETURNING key, value, label, updated_at`,
        [String(value), key],
      );

      if (result.rowCount === 0) {
        return sendError(res, 404, 'Setting not found', 'NOT_FOUND');
      }

      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[/api/settings/:key PUT] error:', err);
      return sendError(res, 500, 'Failed to update setting', 'INTERNAL_ERROR');
    } finally {
      client.release();
    }
  },
);

// 報表：損益總表
app.get('/api/reports/summary', authenticate, async (req, res) => {
  const { property_id, year, month } = req.query || {};
  const client = await pool.connect();
  try {
    const params = [];
    const incomeConditions = ["is_deleted = false"];
    const costConditions = ["is_deleted = false"];
    const maintenanceConditions = [];

    if (property_id) {
      params.push(property_id);
      incomeConditions.push(`property_id = $${params.length}`);
      costConditions.push(`property_id = $${params.length}`);
      maintenanceConditions.push(`property_id = $${params.length}`);
    }

    if (year && month) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      params.push(ym);
      incomeConditions.push(`to_char(paid_date, 'YYYY-MM') = $${params.length}`);
      costConditions.push(`to_char(cost_date, 'YYYY-MM') = $${params.length}`);
      maintenanceConditions.push(`to_char(created_at, 'YYYY-MM') = $${params.length}`);
    }

    const incomeWhere = `WHERE ${incomeConditions.join(' AND ')} AND type IN ('rent','deposit','electric','water','laundry','booking','deposit_return')`;
    const costWhere = `WHERE ${costConditions.join(' AND ')}`;
    const maintenanceWhere = maintenanceConditions.length ? `WHERE ${maintenanceConditions.join(' AND ')}` : '';

    const incomeResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS income_total
       FROM payments
       ${incomeWhere}`,
      params,
    );

    const costResult = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN is_initial THEN amount ELSE 0 END), 0) AS initial_costs,
         COALESCE(SUM(CASE WHEN NOT is_initial THEN amount ELSE 0 END), 0) AS regular_costs
       FROM costs
       ${costWhere}`,
      params,
    );

    const maintenanceResult = await client.query(
      `SELECT COALESCE(SUM(actual_cost), 0) AS maintenance_costs
       FROM maintenance
       ${maintenanceWhere}`,
      params.slice(0, maintenanceConditions.length ? params.length : (property_id ? 1 : 0)),
    );

    const incomeTotal = Number(incomeResult.rows[0].income_total || 0);
    const initialCosts = Number(costResult.rows[0].initial_costs || 0);
    const regularCosts = Number(costResult.rows[0].regular_costs || 0);
    const maintenanceCosts = Number(maintenanceResult.rows[0]?.maintenance_costs || 0);

    const expenseTotal = regularCosts + maintenanceCosts;
    const netProfit = incomeTotal - expenseTotal;

    const totalInitialCost = initialCosts;
    const recoveryRate = totalInitialCost > 0 ? (netProfit / totalInitialCost) * 100 : null;

    return res.json({
      success: true,
      data: {
        income_total: incomeTotal,
        expense_total: expenseTotal,
        net_profit: netProfit,
        initial_costs: totalInitialCost,
        recovery_rate: recoveryRate,
      },
    });
  } catch (err) {
    console.error('[/api/reports/summary GET] error:', err);
    return sendError(res, 500, 'Failed to fetch summary report', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 報表：出租率
app.get('/api/reports/occupancy', authenticate, async (req, res) => {
  const { property_id } = req.query || {};
  const client = await pool.connect();
  try {
    const params = [];
    let where = 'WHERE 1=1';
    if (property_id) {
      params.push(property_id);
      where += ` AND property_id = $${params.length}`;
    }

    const totalResult = await client.query(
      `SELECT COUNT(*) AS total_rooms
       FROM rooms
       ${where}`,
      params,
    );

    const occupiedResult = await client.query(
      `SELECT COUNT(*) AS occupied_rooms
       FROM rooms
       ${where} AND status = 'occupied'`,
      params,
    );

    const vacantListResult = await client.query(
      `SELECT id, property_id, floor, room_number, monthly_rent, deposit
       FROM rooms
       ${where} AND status = 'vacant'
       ORDER BY property_id, floor, room_number`,
      params,
    );

    const totalRooms = Number(totalResult.rows[0].total_rooms || 0);
    const occupiedRooms = Number(occupiedResult.rows[0].occupied_rooms || 0);
    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return res.json({
      success: true,
      data: {
        total_rooms: totalRooms,
        occupied_rooms: occupiedRooms,
        occupancy_rate: occupancyRate,
        vacant_rooms: vacantListResult.rows,
      },
    });
  } catch (err) {
    console.error('[/api/reports/occupancy GET] error:', err);
    return sendError(res, 500, 'Failed to fetch occupancy report', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 報表：月度收支
app.get('/api/reports/monthly', authenticate, async (req, res) => {
  const { property_id } = req.query || {};
  const client = await pool.connect();
  try {
    const params = [];
    let incomeWhere = 'WHERE is_deleted = false';
    let costWhere = 'WHERE is_deleted = false';

    if (property_id) {
      params.push(property_id);
      incomeWhere += ` AND property_id = $${params.length}`;
      costWhere += ` AND property_id = $${params.length}`;
    }

    const incomeResult = await client.query(
      `SELECT to_char(paid_date, 'YYYY-MM') AS ym,
              COALESCE(SUM(amount), 0) AS income
       FROM payments
       ${incomeWhere}
       GROUP BY ym
       ORDER BY ym`,
      params,
    );

    const costResult = await client.query(
      `SELECT to_char(cost_date, 'YYYY-MM') AS ym,
              COALESCE(SUM(amount), 0) AS expense
       FROM costs
       ${costWhere}
       GROUP BY ym
       ORDER BY ym`,
      params,
    );

    const map = new Map();
    for (const row of incomeResult.rows) {
      map.set(row.ym, { ym: row.ym, income: Number(row.income || 0), expense: 0 });
    }
    for (const row of costResult.rows) {
      const existing = map.get(row.ym) || { ym: row.ym, income: 0, expense: 0 };
      existing.expense = Number(row.expense || 0);
      map.set(row.ym, existing);
    }

    const list = Array.from(map.values()).map((item) => ({
      ym: item.ym,
      income: item.income,
      expense: item.expense,
      net: item.income - item.expense,
    }));

    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[/api/reports/monthly GET] error:', err);
    return sendError(res, 500, 'Failed to fetch monthly report', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
});

// 全量同步資料
// 全量同步資料（API 前綴一致性：保留 /sync/all 相容，同時提供 /api/sync/all）
async function handleSyncAll(req, res) {
  const client = await pool.connect();
  try {
    const propertiesResult = await client.query(
      'SELECT id, name, address, created_at FROM properties ORDER BY id ASC',
    );

    const roomsResult = await client.query(
      `SELECT id, property_id, floor, room_number, monthly_rent, deposit, status,
              tenant_name, check_in_date, check_out_date,
              current_meter, previous_meter,
              locked_by, locked_at, created_at
       FROM rooms
       ORDER BY id ASC`,
    );

    const paymentsResult = await client.query(
      `SELECT id, room_id, property_id, type, amount, paid_date, note, created_by, created_at
       FROM payments
       WHERE is_deleted = false
       ORDER BY id ASC`,
    );

    const historyResult = await client.query(
      `SELECT id, room_id, property_id, action, description,
              amount, performed_by, created_at
       FROM history
       ORDER BY id ASC`,
    );

    const maintenanceResult = await client.query(
      `SELECT id, room_id, property_id, title, description,
              status, estimated_cost, actual_cost,
              completed_at, created_by, created_at
       FROM maintenance
       ORDER BY id ASC`,
    );

    const costsResult = await client.query(
      `SELECT id, property_id, room_id, category, is_initial,
              amount, cost_date, note, created_by, created_at
       FROM costs
       WHERE is_deleted = false
       ORDER BY id ASC`,
    );

    // 按物業分組
    const properties = propertiesResult.rows.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      rooms: [],
      payments: [],
      history: [],
      maintenance: [],
      costs: [],
    }));
    const propMap = new Map();
    properties.forEach((p) => propMap.set(p.id, p));

    for (const r of roomsResult.rows) {
      const prop = propMap.get(r.property_id);
      if (prop) {
        prop.rooms.push(r);
      }
    }

    for (const pay of paymentsResult.rows) {
      const prop = propMap.get(pay.property_id);
      if (prop) {
        prop.payments.push(pay);
      }
    }

    for (const h of historyResult.rows) {
      const prop = propMap.get(h.property_id);
      if (prop) {
        prop.history.push(h);
      }
    }

    for (const m of maintenanceResult.rows) {
      const prop = propMap.get(m.property_id);
      if (prop) {
        prop.maintenance.push(m);
      }
    }

    for (const c of costsResult.rows) {
      const prop = propMap.get(c.property_id);
      if (prop) {
        prop.costs.push(c);
      }
    }

    return res.json({
      success: true,
      data: {
        properties,
      },
    });
  } catch (err) {
    console.error('[/sync/all GET] error:', err);
    return sendError(res, 500, 'Failed to sync data', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
}

app.get('/sync/all', authenticate, handleSyncAll);
app.get('/api/sync/all', authenticate, handleSyncAll);
// ---------------------------------------------------------------------
// 入住 / 退租 API（Transaction + 冪等性）
// ---------------------------------------------------------------------

// 入住完成（原子操作）
app.post(
  '/api/checkin/complete',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      room_id,
      tenant_name,
      phone,
      nationality,
      contract_start,
      contract_end,
      payment_type,
      initial_meter,
    } = req.body || {};

    if (!room_id || !tenant_name || !contract_start || !payment_type) {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['X-Idempotency-Key'];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 冪等性檢查
      const idem = await ensureIdempotency(client, idempotencyKey);
      if (idem.duplicate) {
        await client.query('ROLLBACK');
        return sendError(res, 409, 'Duplicate operation', 'DUPLICATE_OPERATION');
      }

      // 鎖定房間紀錄
      const roomResult = await client.query(
        `SELECT id, property_id, status, tenant_name,
                check_in_date, check_out_date,
                current_meter, previous_meter,
                monthly_rent, deposit,
                locked_by, locked_at
         FROM rooms
         WHERE id = $1
         FOR UPDATE`,
        [room_id],
      );

      if (roomResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }

      const room = roomResult.rows[0];

      // 房間狀態檢查
      if (room.status !== 'vacant' && room.status !== 'pending') {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'Room status not allowed', 'ROOM_STATUS_INVALID');
      }

      // 鎖定檢查（若被他人持有且未逾時）
      const timeoutMinutesSetting = await getSetting(client, 'lock_timeout_minutes', '5');
      const timeoutMinutes = parseInt(timeoutMinutesSetting, 10) || 5;
      if (room.locked_by && room.locked_at) {
        const lockedAt = room.locked_at;
        const now = new Date();
        const expireAt = new Date(lockedAt.getTime() + timeoutMinutes * 60 * 1000);
        if (expireAt > now && room.locked_by !== req.user.username) {
          await client.query('ROLLBACK');
          return sendError(
            res,
            409,
            `Room is locked by ${room.locked_by}`,
            'ROOM_LOCKED',
          );
        }
      }

      const propertyId = room.property_id;
      const contractStartDate = contract_start;
      const contractEndDate = contract_end || null;

      // 建立租客資料
      const tenantResult = await client.query(
        `INSERT INTO tenants (
           room_id, property_id, name, phone, nationality,
           contract_start, contract_end, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id`,
        [
          room_id,
          propertyId,
          tenant_name,
          phone || null,
          nationality || null,
          contractStartDate,
          contractEndDate,
        ],
      );

      const tenantId = tenantResult.rows[0].id;

      // 押金月數設定
      const depositMonthsSetting = await getSetting(client, 'deposit_months', '1');
      const depositMonths = parseInt(depositMonthsSetting, 10) || 1;
      const rentAmount = Number(room.monthly_rent || 0);
      const depositAmount = rentAmount * depositMonths;

      // 收款紀錄
      const payments = [];
      const today = new Date();

      if (payment_type === 'full') {
        if (rentAmount > 0) {
          payments.push({
            type: 'rent',
            amount: rentAmount,
          });
        }
        if (depositAmount > 0) {
          payments.push({
            type: 'deposit',
            amount: depositAmount,
          });
        }
      } else if (payment_type === 'deposit_only') {
        if (depositAmount > 0) {
          payments.push({
            type: 'deposit',
            amount: depositAmount,
          });
        }
      } else if (payment_type === 'booking_only') {
        if (depositAmount > 0) {
          payments.push({
            type: 'booking',
            amount: depositAmount,
          });
        }
      }

      for (const p of payments) {
        await client.query(
          `INSERT INTO payments (
             room_id, property_id, type, amount, paid_date,
             note, created_by, is_deleted
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
          [
            room_id,
            propertyId,
            p.type,
            p.amount,
            today,
            null,
            req.user.username,
          ],
        );
      }

      // 房間狀態更新
      let newStatus = room.status;
      if (payment_type === 'full') {
        newStatus = 'occupied';
      } else if (payment_type === 'deposit_only' || payment_type === 'booking_only') {
        newStatus = 'pending';
      }

      const meterValue = typeof initial_meter === 'number'
        ? initial_meter
        : Number(room.current_meter || 0);

      await client.query(
        `UPDATE rooms
         SET status = $1,
             tenant_name = $2,
             check_in_date = $3,
             check_out_date = NULL,
             current_meter = $4,
             previous_meter = $4,
             locked_by = NULL,
             locked_at = NULL
         WHERE id = $5`,
        [
          newStatus,
          tenant_name,
          contractStartDate,
          meterValue,
          room_id,
        ],
      );

      // 歷史紀錄
      await client.query(
        `INSERT INTO history (
           room_id, property_id, action, description, amount, performed_by
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          room_id,
          propertyId,
          'check_in',
          `Check-in by ${req.user.username}`,
          payments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
          req.user.username,
        ],
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        data: {
          room_id,
          tenant_id: tenantId,
          status: newStatus,
        },
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        console.error('[/api/checkin/complete ROLLBACK] error:', e);
      }
      console.error('[/api/checkin/complete] error:', err);
      return sendError(res, 500, 'Check-in failed', 'CHECKIN_TRANSACTION_FAILED');
    } finally {
      client.release();
    }
  },
);

// 退租完成（原子操作）
app.post(
  '/api/checkout/complete',
  authenticate,
  requireRole(['superadmin', 'staff']),
  async (req, res) => {
    const {
      room_id,
      checkout_date,
      final_meter,
      deposit_action,
      deposit_amount,
      note,
    } = req.body || {};

    if (!room_id || !checkout_date || typeof final_meter !== 'number') {
      return sendError(res, 400, 'Missing required fields', 'VALIDATION_ERROR');
    }

    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['X-Idempotency-Key'];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 冪等性檢查
      const idem = await ensureIdempotency(client, idempotencyKey);
      if (idem.duplicate) {
        await client.query('ROLLBACK');
        return sendError(res, 409, 'Duplicate operation', 'DUPLICATE_OPERATION');
      }

      // 鎖定房間紀錄
      const roomResult = await client.query(
        `SELECT id, property_id, status,
                tenant_name, current_meter, previous_meter
         FROM rooms
         WHERE id = $1
         FOR UPDATE`,
        [room_id],
      );

      if (roomResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendError(res, 404, 'Room not found', 'NOT_FOUND');
      }

      const room = roomResult.rows[0];
      const propertyId = room.property_id;

      const prevMeter = Number(room.previous_meter || 0);
      if (final_meter < prevMeter) {
        await client.query('ROLLBACK');
        return sendError(res, 400, 'Final meter cannot be less than previous', 'VALIDATION_ERROR');
      }

      // 電費計算
      const electricRateSetting = await getSetting(client, 'electric_rate', '6');
      const electricRate = parseFloat(electricRateSetting) || 6;
      const usage = final_meter - prevMeter;
      const electricCost = usage * electricRate;

      const today = new Date();

      // 電費付款記錄
      if (electricCost > 0) {
        await client.query(
          `INSERT INTO payments (
             room_id, property_id, type, amount, paid_date,
             note, created_by, is_deleted
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
          [
            room_id,
            propertyId,
            'electric',
            electricCost,
            today,
            'Electricity on checkout',
            req.user.username,
          ],
        );
      }

      // 押金處理
      if (deposit_action === 'return' && deposit_amount > 0) {
        await client.query(
          `INSERT INTO payments (
             room_id, property_id, type, amount, paid_date,
             note, created_by, is_deleted
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
          [
            room_id,
            propertyId,
            'deposit_return',
            deposit_amount,
            today,
            note || 'Deposit return',
            req.user.username,
          ],
        );
      }

      // 租客狀態更新
      await client.query(
        `UPDATE tenants
         SET is_active = false, contract_end = $1
         WHERE room_id = $2 AND is_active = true`,
        [checkout_date, room_id],
      );

      // 房間狀態更新為空房
      await client.query(
        `UPDATE rooms
         SET status = 'vacant',
             tenant_name = NULL,
             check_in_date = NULL,
             check_out_date = $1,
             previous_meter = $2,
             current_meter = $2,
             locked_by = NULL,
             locked_at = NULL
         WHERE id = $3`,
        [
          checkout_date,
          final_meter,
          room_id,
        ],
      );

      // 歷史紀錄
      await client.query(
        `INSERT INTO history (
           room_id, property_id, action, description, amount, performed_by
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          room_id,
          propertyId,
          'check_out',
          note || `Check-out by ${req.user.username}`,
          electricCost,
          req.user.username,
        ],
      );

      await client.query('COMMIT');

      return res.json({
        success: true,
        data: {
          room_id,
          electric_cost: electricCost,
        },
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        console.error('[/api/checkout/complete ROLLBACK] error:', e);
      }
      console.error('[/api/checkout/complete] error:', err);
      return sendError(res, 500, 'Checkout failed', 'CHECKOUT_TRANSACTION_FAILED');
    } finally {
      client.release();
    }
  },
);

// ---------------------------------------------------------------------
// 健康檢查
// ---------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// ---------------------------------------------------------------------
// 啟動伺服器
// ---------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

