# rental-frontend-2026（Vercel）

Next.js 14 App Router 管理前端，與上層後端 API 對接。

| 項目 | 值 |
|------|-----|
| 儀表板 | [Vercel Project](https://vercel.com/leo124805290s-projects/rental-frontend-2026) |
| Project ID | `prj_gJxuPPShWviozx4o6SPgwlhAChVQ` |

## 本機開發

```bash
cd rental-frontend
cp .env.example .env.local
# 編輯 .env.local：NEXT_PUBLIC_API_URL 指向後端（例如 http://localhost:3001）
npm install
npm run dev
```

- **登入**：`/login`（預設測試密碼見後端 `src/routes/auth.ts`）；成功後導向 **使用者管理**（`/users`）。清除業務資料成功後會導向 **儀表板**（`/dashboard`）。
- **使用者管理**：`/users`（使用者列表、清除所有業務資料；`/admin` 會重新導向至此）
- **API**：統一走 `lib/api.ts`，自動附帶 `Authorization: Bearer`；**失敗時不會使用模擬資料**
- 後端整合規範見上層 **[docs/ADMIN_FRONTEND.md](../docs/ADMIN_FRONTEND.md)**

## 部署（Vercel）

在專案設定中新增環境變數 `NEXT_PUBLIC_API_URL`（Zeabur 後端公開 URL），再部署。

```bash
npm i -g vercel
vercel link
vercel deploy --prod
```

若 `.vercel/project.json` 缺少 `orgId`，請執行一次 `vercel link` 並選同一專案。

## 與後端 monorepo

後端提供 `GET /api/vercel/deployments`（管理系統用 JWT）與根目錄 `npm run vercel:frontend:deployments`（本機需 **VERCEL_TOKEN**）；見 **[docs/VERCEL.md](../docs/VERCEL.md)**。
