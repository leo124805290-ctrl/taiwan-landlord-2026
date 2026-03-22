## 目前狀態（避免當機遺失）

目標（舊輪）：全站 UI 版型一致化（PageShell/PageHeader），並逐頁移除 `@ts-nocheck`，維持 `npm run type-check` / `npm run build` 通過。

### 已完成

- 新增共用版型元件
  - `components/app-shell/page-shell.tsx`
  - `components/app-shell/page-header.tsx`
- 已套用統一版型的頁面（PageShell + PageHeader）
  - `app/dashboard/page.tsx`
  - `app/properties/page.tsx`
  - `app/tenants/page.tsx`
  - `app/payments/page.tsx`
  - `app/checkout/page.tsx`
  - `app/rooms/page.tsx`
- `app/layout.tsx` 已移除 `<main>` padding，避免與各頁容器重複 padding
- 驗證
  - `npm run type-check`：✅
  - `npm run build`：✅

### 未完成（待做）

#### A) 尚未套用統一版型的頁面（仍使用 `container mx-auto ...`）
- `app/meter-readings/page.tsx`
- `app/expenses/page.tsx`
- `app/incomes/page.tsx`
- `app/maintenance/page.tsx`
- `app/reports/page.tsx`
- `app/users/page.tsx`
- `app/properties/[id]/page.tsx`（此頁有多處 container/間距，需要一次性統一）

#### B) `@ts-nocheck` 狀態（技術債）
目前已確認：`rental-frontend-2026/app` 目錄底下沒有找到 `@ts-nocheck`（舊輪技術債已清掉）。

（原則：先做「版型統一」確保視覺一致，再逐頁拿掉 `@ts-nocheck`，每移除一頁就跑 `npm run type-check`。）

#### C) lint 指令目前會進入互動式流程
- `npm run lint` 目前跑 `next lint`，在 Next.js 15 會提示遷移並要求互動選項，會卡住自動化驗證。
- 待處理方向：改成 ESLint CLI（例如 `eslint .`），或加入可非互動執行的 lint 流程。

### 下一步執行順序（不需再問）

1. 先把 A 清單頁面全部改成 PageShell + PageHeader（僅調整版型/間距/標題 actions，不動業務邏輯）。
2. 逐頁移除 B 的 `@ts-nocheck`，修正 TS/未使用變數/不正確型別，並持續維持 `type-check` 與 `build` 通過。
3. 最後處理 C：讓 `npm run lint` 可在無互動情境下跑完。

---

### 新一輪目標：物業封存/刪除策略

#### 已完成（本輪）
- 後端（`taiwan-landlord-backend`）
  - `properties` 新增 `status`：`active | archived | demo`
  - `GET /api/properties`
    - 預設只回傳 `active/demo`
    - `include_archived=true` 可回傳 `archived`
  - 物業刪除/封存/恢復端點
    - `DELETE /api/properties/:id`：僅允許 `demo` 硬刪
    - `PATCH /api/properties/:id/archive`：封存 `active/demo -> archived`
    - `PATCH /api/properties/:id/restore`：恢復 `archived -> active`
  - `/api/rooms`：加入 `properties` join，強制只回傳 `properties.status IN ('active','demo')` 的房間
- 前端（`rental-frontend-2026`）
  - `/properties` 清單
    - 非 demo：刪除按鈕改為「封存」
    - demo：顯示「刪除」（呼叫 backend `DELETE /api/properties/:id`）
    - `archived`：顯示「恢復使用中」（呼叫 `/restore`）
    - 物業狀態 badge：使用中/測試用/已封存
    - 列表切換：`只看使用中` / `顯示已封存`
  - `PropertyForm`
    - 新增「此物業為測試用（demo）」勾選
    - 送出時帶 `is_demo` 給後端
  - `/properties/[id]`：若物業 `archived`，改為只讀提示並提供「恢復使用中」
  - `/rooms`：前端再做一次防呆過濾（只顯示屬於管理清單 active/demo 的房間）
  - `/tenants`：載入時以 `/api/rooms` 的可操作清單過濾 archived 物業的租客
  - `/maintenance`：載入維修紀錄時以 `/api/properties`（active/demo）過濾 archived 物業紀錄
  - `/payments`：載入 `/api/properties` 後過濾 `archived` 物業，避免在 property 下拉選單中操作封存物業
  - `/meter-readings`：載入 `/api/properties` 後過濾 archived 物業，並讓房間列表只顯示可操作清單

#### 驗證
- `rental-frontend-2026`
  - `npm run type-check`：✅
  - `npm run build`：✅

#### 尚未完成（下一輪要接）
- `reports / users` 等頁面：需要確認它們是否仍會顯示/允許操作 `archived` 物業關聯資料（後續要統一「只可操作 active；必要時僅在報表/歷史顯示」）
- 新增物業封存後的「操作入口禁用」：目前只先做了物業詳情頁（`/properties/[id]`）的封存只讀；其它入口仍需逐頁補齊
- 預留後端管理入口：一鍵清除所有 `demo` 物業及其關聯資料（尚未做）

