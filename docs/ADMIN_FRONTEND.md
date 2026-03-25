# 管理後台與後端 API 整合規範

後端已實作「清除所有業務資料」等管理功能；**管理系統（Vercel 前端）必須統一帶上 JWT**，否則會出現 `缺少有效的 Authorization header`，並落入「模擬資料」分支。

## 1. 原則（請團隊遵守，避免再踩坑）

| 原則 | 說明 |
|------|------|
| **單一 API 客戶端** | 所有呼叫 Zeabur 後端的 `fetch` / `axios` 都經過**同一支**會自動加 `Authorization` 的函式。禁止在頁面裡複製貼上「沒帶 header」的裸 `fetch`。 |
| **登入後一定要能讀到 token** | 登入 API 回傳的 `accessToken`（或你們欄位名）需存到 `localStorage` / `sessionStorage` / memory store，且 key **全專案統一**（例如 `landlord_access_token`）。 |
| **環境變數** | 後端基底網址用 `NEXT_PUBLIC_API_URL`（或既有變數），勿在程式裡寫死。 |
| **需要登入的頁面** | 使用者列表、清除資料、建立帳號等，一律用**已認證**的 client，不要用「公開 API」那套。 |

## 2. 登入（取得 JWT）

- **POST** `/api/auth/login`  
  - Body: `{ "email": "admin@rental.com", "password": "<種子或正式密碼>" }`  
  - 成功：`data.user`、`data.tokens.accessToken`（前端需寫入 localStorage／cookie 並於後續請求帶 `Authorization`）。

## 3. 後端端點（已部署即可用）

- **POST** `/api/admin/clear-all-data`  
  - Headers: `Authorization: Bearer <access_token>`  
  - Body JSON: `{ "confirm": "CLEAR_ALL" }`  
  - 角色：`super_admin` 或 `admin`（JWT 內 `role`）

- **GET** `/api/users`（僅 `super_admin`）  
  - 同樣必須帶 `Authorization: Bearer <token>`

## 4. 前端範例（請複製到專案並依命名微調）

檔名建議：`lib/api.ts` 或 `lib/api-client.ts`。

```typescript
const TOKEN_KEY = 'landlord_access_token'; // 與登入成功後寫入的 key 一致

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL 未設定');
  return base.replace(/\/$/, '');
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: authHeaders(),
    credentials: 'omit',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    credentials: 'omit',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** 清除所有業務資料（需 admin / super_admin） */
export function clearAllBusinessData() {
  return apiPost<{ success: boolean }>('/api/admin/clear-all-data', {
    confirm: 'CLEAR_ALL',
  });
}
```

**清除按鈕**請只呼叫 `clearAllBusinessData()`，不要另寫一支沒帶 `authHeaders` 的 `fetch`。

## 5. 登入成功時必做

在登入成功 callback 裡（依你們 API 回傳欄位調整）：

```typescript
localStorage.setItem(TOKEN_KEY, data.accessToken); // 或 data.token
```

若 token 放在 **httpOnly Cookie** 且前端讀不到，則需用 **Next.js Route Handler** 在伺服器端讀 cookie 並代為向後端轉發 `Authorization`，不能只用瀏覽器裸 `fetch` 而不帶 Bearer。

## 6. 驗收清單（每次改 UI 都過一次）

1. DevTools → Network → 點「清除」或「使用者列表」請求。  
2. Request Headers 必須有：`Authorization: Bearer eyJ...`  
3. 無則先修 API client，不要改後端繞過驗證。

## 7. CORS

後端已對 `FRONTEND_URL` 開 CORS；Vercel 網址變更時請同步 Zeabur 環境變數 `FRONTEND_URL`。

## 8. Vercel 部署清單（不透過前端暴露 Token）

**`VERCEL_TOKEN` 絕不可寫進前端或 commit**；必須只在 **Zeabur／本機後端** 以環境變數注入。

### 後端環境變數（Zeabur）

| 變數 | 說明 |
|------|------|
| `VERCEL_TOKEN` | Vercel → Account Settings → **Tokens** 建立（具帳號權限，勿外洩） |
| `VERCEL_TEAM_ID` | 選填；若 API 回傳與 Team 有關錯誤，在 Team Settings 複製 Team ID |

`.env.example` 已列出上述欄位，僅作佔位；真值只放在託管平台 Secret。

### 後端代理端點（管理系統應呼叫這個，不要從瀏覽器直打 Vercel）

- **GET** `/api/vercel/deployments`  
  - Headers：`Authorization: Bearer <後端登入 JWT>`（與其他管理 API 相同）  
  - 角色：`admin` 或 `super_admin`  
  - 回傳：Vercel `v6/deployments` 的 JSON（由後端用伺服器端 `VERCEL_TOKEN` 轉發）

前端範例：

```typescript
// 與 apiGet 相同，帶的是「登入後台」的 JWT，不是 VERCEL_TOKEN
export function listVercelDeploymentsForAdmin() {
  return apiGet<{ success: boolean; data: unknown }>('/api/vercel/deployments');
}
```

這樣管理畫面只帶 **使用者 JWT**，**Vercel Token 永遠只在後端**，符合安全實務。

詳見 **[docs/VERCEL.md](./VERCEL.md)**。
