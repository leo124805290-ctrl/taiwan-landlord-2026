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
- **[docs/VERCEL.md](./docs/VERCEL.md)** — 前端專案 ID、`VERCEL_TOKEN`、查部署腳本

前端 Vercel 專案 **`rental-frontend-2026`**（ID `prj_gJxuPPShWviozx4o6SPgwlhAChVQ`）綁定檔見 **`rental-frontend/.vercel/project.json`**；實際 Next.js 程式應置於 `rental-frontend/` 或將該目錄與獨立 repo 同步。

後端端點範例：`POST /api/admin/clear-all-data`（body: `{ "confirm": "CLEAR_ALL" }`）。

### 查 Vercel 部署（需 `VERCEL_TOKEN`）

```bash
npm run vercel:frontend:deployments
```

## Scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 開發 |
| `npm run build` / `npm start` | 正式編譯與執行 |
| `npm run lint` | TypeScript 檢查 |
