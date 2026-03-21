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

**若本前端與後端在同一個 Git monorepo**：請在 Vercel 專案設定將 **Root Directory** 設為 **`rental-frontend`**（否則會建到錯誤目錄或仍是舊版前端）。

```bash
cd rental-frontend
npm i -g vercel
vercel link
vercel deploy --prod
```

若 `.vercel/project.json` 缺少 `orgId`，請執行一次 `vercel link` 並選同一專案。

### 清除後仍看到示範數字、圖表、「今日待辦」？

本目錄的 UI 為 **簡潔表格**（儀表板無長條圖、抄表無「房間電錶清單」那種完整表格、支出頁無每列編輯刪除）。若你線上畫面標題是 **「租屋管理系統」「Dashboard v2」** 或仍有 **固定示範文案（如特定區域、金額）**，代表 **Vercel 仍在跑另一套舊前端**；該專案多半 **內建前端模擬資料** 或 API 失敗時改顯示假資料——**只清後端資料庫無法消掉前端的假資料**。

請擇一處理：

1. **改部署這份 `rental-frontend`**（Root Directory + 重新部署），或  
2. 在 **實際上線的那個前端專案** 內搜尋 `mock`、`demo`、`sample`、`假資料`、`fallback`，改為只顯示 API 真實回傳（空就顯示空）。

用瀏覽器 **DevTools → Network** 檢查：若 `/api/reports/summary` 等回傳已是空或 0，畫面卻仍有大數字，即可確認是 **前端假資料**。

## 與後端 monorepo

後端提供 `GET /api/vercel/deployments`（管理系統用 JWT）與根目錄 `npm run vercel:frontend:deployments`（本機需 **VERCEL_TOKEN**）；見 **[docs/VERCEL.md](../docs/VERCEL.md)**。
