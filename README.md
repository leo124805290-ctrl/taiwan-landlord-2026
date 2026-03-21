# taiwan-landlord-2026（後端 API）

TypeScript + Express + Drizzle + PostgreSQL。

## 本機

```bash
npm install
cp .env.example .env   # 若有的話；否則自行設定 DATABASE_URL、JWT_SECRET、PORT
npm run dev
```

## 管理後台（Vercel）整合

**清除資料、使用者管理等必須帶 JWT。** 請閱讀並在管理前端實作單一 API 客戶端：

- **[docs/ADMIN_FRONTEND.md](./docs/ADMIN_FRONTEND.md)** — 規範、環境變數、`Authorization`、範例程式
- **[docs/VERCEL.md](./docs/VERCEL.md)** — 專案 ID、`VERCEL_TOKEN`、`GET /api/vercel/deployments` 代理

前端 Vercel 專案 **`rental-frontend-2026`**（ID `prj_gJxuPPShWviozx4o6SPgwlhAChVQ`）：Next.js 程式在 **`rental-frontend/`**（見該目錄 `README.md`、**`lib/api.ts`** 單一 API 客戶端）。

後端端點範例：`POST /api/admin/clear-all-data`（body: `{ "confirm": "CLEAR_ALL" }`）。

### 查 Vercel 部署

- **管理系統**：`GET /api/vercel/deployments`（帶使用者 JWT；後端才用 `VERCEL_TOKEN`）。
- **CLI 本機**：`VERCEL_TOKEN` 設好後執行 `npm run vercel:frontend:deployments`。

## Scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發 |
| `npm run build` / `npm start` | 正式編譯與執行 |
| `npm run lint` | TypeScript 檢查 |
