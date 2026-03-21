# rental-frontend-2026（Vercel）

此資料夾用於與 Vercel 專案綁定；**實際 Next.js 程式應放在此目錄**（或將獨立 repo clone 到這裡）。

| 項目 | 值 |
|------|-----|
| 儀表板 | [Vercel Project](https://vercel.com/leo124805290s-projects/rental-frontend-2026) |
| Project ID | `prj_gJxuPPShWviozx4o6SPgwlhAChVQ` |

## CLI

在 `rental-frontend` 目錄內：

```bash
npm i -g vercel
vercel link   # 若尚未連結；會寫入 orgId（團隊專案時需要）
vercel deploy --prod
```

若 `.vercel/project.json` 缺少 `orgId`，請執行一次 `vercel link` 並選同一專案。

## 與後端 monorepo

後端 repo 提供 `GET /api/vercel/deployments`（管理系統用 JWT）與 `npm run vercel:frontend:deployments`（本機需 **VERCEL_TOKEN**）；見上層 `docs/VERCEL.md`。
