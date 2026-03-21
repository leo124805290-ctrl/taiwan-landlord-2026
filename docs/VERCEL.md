# Vercel（前端 rental-frontend-2026）

## 專案識別（已寫入 repo，非 secret）

| 鍵 | 值 |
|----|-----|
| Project ID | `prj_gJxuPPShWviozx4o6SPgwlhAChVQ` |
| 專案名稱 | `rental-frontend-2026` |
| 儀表板 | [vercel.com → 專案](https://vercel.com/leo124805290s-projects/rental-frontend-2026) |

程式內常數：`src/config/vercel.ts`  
共用呼叫邏輯：`src/lib/vercel-api.ts`（僅從 `process.env` 讀取 `VERCEL_TOKEN`，**不** export 明文 token）  
CLI 綁定檔：`rental-frontend/.vercel/project.json`

## 環境變數（勿 commit）

| 變數 | 說明 |
|------|------|
| `VERCEL_TOKEN` | Vercel → Account Settings → **Tokens** |
| `VERCEL_TEAM_ID` | 選填；團隊專案若 API 要求時設定 |

`.env.example` 已列欄位；Zeabur／本機／CI Secret 填入真值。

## 管理系統：請用後端代理（推薦）

**不要**在瀏覽器或 Next.js 客戶端持有 `VERCEL_TOKEN`。後端已提供：

- **GET** `/api/vercel/deployments`  
  - 需 **使用者 JWT**：`Authorization: Bearer <access_token>`  
  - 角色：`admin` 或 `super_admin`  
  - 後端以伺服器端 `VERCEL_TOKEN` 呼叫 Vercel API，回傳部署 JSON  

管理前端只要與其他後台 API 一樣帶 **登入 JWT** 即可；見 **[docs/ADMIN_FRONTEND.md](./ADMIN_FRONTEND.md)** 第 7 節。

## CLI／本機除錯

```bash
# PowerShell
$env:VERCEL_TOKEN="你的_token"
npm run vercel:frontend:deployments
```

與後端共用 `listVercelDeployments()` 實作（`scripts/vercel-list-frontend-deployments.ts`）。

## 觸發重新部署

- **儀表板**：Deployments → **Redeploy**。
- **CLI**：在 `rental-frontend` 目錄執行 `vercel deploy --prod`（需已 `vercel link`）。
- **Deploy Hook**：專案 Settings → Git → Deploy Hooks。

## 注意

- `VERCEL_TOKEN` 具帳號權限，只放在後端或 CI，不要寫進 repo。
- 若 Vercel API 回傳與 Team 有關錯誤，設定 `VERCEL_TEAM_ID` 後重試。
