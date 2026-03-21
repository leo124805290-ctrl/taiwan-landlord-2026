# Vercel（前端 rental-frontend-2026）

## 專案識別（已寫入 repo）

| 鍵 | 值 |
|----|-----|
| Project ID | `prj_gJxuPPShWviozx4o6SPgwlhAChVQ` |
| 專案名稱 | `rental-frontend-2026` |
| 儀表板 | [vercel.com → 專案](https://vercel.com/leo124805290s-projects/rental-frontend-2026) |

程式內常數：`scripts/vercel-frontend-constants.mjs`  
CLI 綁定檔：`rental-frontend/.vercel/project.json`

## 與 Vercel API 互動

1. 建立 **Personal Access Token**：Vercel → Account Settings → **Tokens**。
2. 本機或 CI 設定（勿提交）：

```bash
set VERCEL_TOKEN=你的_token
# PowerShell: $env:VERCEL_TOKEN="..."
```

3. 查詢最近部署：

```bash
npm run vercel:frontend:deployments
```

## 觸發重新部署

- **儀表板**：Deployments → 選一筆 → **Redeploy**。
- **CLI**：在 `rental-frontend` 目錄（或已 `vercel link` 的專案根目錄）執行 `vercel deploy --prod`。
- **Deploy Hook**：在專案 Settings → Git → Deploy Hooks 建立 URL，用 `curl` POST 觸發（適合 CI）。

## 注意

- `VERCEL_TOKEN` 具帳號權限，請用環境變數或 CI secret，不要寫進程式碼或 commit。
- 若 API 回傳與 team 有關的錯誤，可能需在請求加上 `teamId`（見 Vercel REST API 文件），或在儀表板確認專案所屬 Team。
