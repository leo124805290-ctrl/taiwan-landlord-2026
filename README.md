# taiwan-landlord-2026（後端 API）

TypeScript + Express + Drizzle + PostgreSQL。

## 前端與 Repo 邊界

| 位置 | 說明 |
|------|------|
| **`deployed-rental-frontend/`** | 主要管理後台（Next.js 15），**獨立 Git**（`rental-frontend-2026`），本後端 repo 以 `.gitignore` 忽略此目錄。日常功能與 UI 迭代以此為準。 |
| **`rental-frontend/`** | 較舊的 Next 14 範例／實驗用前端，**可由此後端 repo 追蹤**；若與主前台重複，請避免雙邊改同一流程而不同步。 |

部署前請確認：瀏覽器實際開啟的網址已列入後端 **CORS**（見下方環境變數）。

## 本機

```bash
npm install
cp .env.example .env   # 若有的話；否則自行設定 DATABASE_URL、JWT_SECRET、PORT
npm run db:seed          # 建立 admin@rental.com 等初始資料（密碼見終端機或 SEED_ADMIN_PASSWORD）
npm run dev
```

## 登入與 API 保護

- **POST** `/api/auth/login`：body 為 `{ "email": "admin@rental.com", "password": "…" }`，成功回傳 `data.tokens.accessToken`。
- 除 **`/api/auth/login`**、**`/api/auth/refresh`**、**`/api/auth/logout`** 外，其餘 **`/api/*` 皆須**標頭 `Authorization: Bearer <accessToken>`。
- **`GET /api/debug/db-status`** 僅在 **`NODE_ENV=development`** 註冊，且開發時可不帶 token（僅供本機除錯）；正式環境不暴露此路由。

## 環境變數補充

- **`FRONTEND_URL`**：主前端 origin（與瀏覽器網址一致，勿尾隨 `/`）。
- **`FRONTEND_ORIGINS_EXTRA`**：多個來源時以逗號分隔（例如 Vercel Preview、第二網域）。
- **`SEED_ADMIN_PASSWORD`**：`npm run db:seed` 建立的管理員密碼；未設定時使用開發預設並於主控台警告，**正式環境務必設定**。

## 維運與安全（建議排程）

1. **依賴**：定期執行 `npm audit`，重大通報在獨立分支試跑升級與回歸（`drizzle-kit` 等開發依賴常牽涉 `esbuild`／`tar` 通報）。
2. **Git**：勿提交 `node_modules`、勿將 **`.env`** 或真 **`VERCEL_TOKEN`** 納入版控；編譯產物 **`dist/`** 已列入 `.gitignore`。
3. **TypeScript**：目前 `strict` 未開；長期可漸進開啟 `strict` 或先開 `noImplicitAny` 分段修正。
4. **種子腳本**：僅限本機／重置環境；正式庫勿沿用種子帳密。

## 管理後台（Vercel）整合

**清除資料、使用者管理等必須帶 JWT。** 請閱讀並在管理前端實作單一 API 客戶端：

- **[docs/ADMIN_FRONTEND.md](./docs/ADMIN_FRONTEND.md)** — 規範、環境變數、`Authorization`、範例程式
- **[docs/VERCEL.md](./docs/VERCEL.md)** — `VERCEL_TOKEN`、`VERCEL_FRONTEND_PROJECT_ID`、`GET /api/vercel/deployments` 代理（專案 ID 請至 Vercel 控制台複製並設為環境變數，勿寫死於程式碼）

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
