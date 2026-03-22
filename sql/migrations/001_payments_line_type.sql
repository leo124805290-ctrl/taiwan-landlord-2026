-- 同房同月可多筆（押金／月租／電費分開）
-- 若舊庫已有 payments_room_month_unique，請先執行本檔再上線新程式。

ALTER TABLE payments ADD COLUMN IF NOT EXISTS line_type varchar(32) NOT NULL DEFAULT 'rent';

UPDATE payments SET line_type = 'rent' WHERE line_type IS NULL OR line_type = '';

DROP INDEX IF EXISTS payments_room_month_unique;

-- 舊 autoMigrate / 舊表常見名稱（UNIQUE(room_id, payment_month)）
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_room_id_payment_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS payments_room_month_line_unique
  ON payments (room_id, payment_month, line_type);

CREATE INDEX IF NOT EXISTS payments_payment_month_idx ON payments (payment_month);
