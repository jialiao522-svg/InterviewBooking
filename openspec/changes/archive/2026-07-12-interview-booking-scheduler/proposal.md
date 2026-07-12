## Why

受訪者目前沒有自主預約訪談時間的管道，招募/訪談者必須手動比對行事曆、逐一協調時間，耗時且容易與既有行程衝突。這個 change 提供受訪者自主預約的網頁，直接讀取訪談者的 Google Calendar 空檔，讓預約流程即時完成，並承接 `recruit-list-filtering-agent` 產出的邀請連結，作為整個訪談預約平台的下游環節。

## What Changes

- 新增一個 Next.js 應用（`packages/booking-scheduler`），部署於 Vercel，作為受訪者自主預約的公開網頁
- 讀取訪談者 Google Calendar 空檔，依規則（每格 1 小時、每天 10:00–20:00、只顯示未來 2 週內）計算可預約時段
- 受訪者透過邀請連結（`${BOOKING_BASE_URL}/book/{candidateId}`，由 `recruit-list-filtering-agent` 產生）進入頁面選擇時段並送出預約
- 送出當下重新檢查該時段是否仍空著，避免與其他受訪者的預約產生衝突（race condition）
- 已完成預約的受訪者再次造訪同一連結時，顯示唯讀的已預約時間，不會建立第二筆預約
- 預約成立後：建立 Google Calendar 事件（受訪者為與會者）、寄送自訂確認信（訪談須知與地點資訊；受訪者若需要線上會議，信中註明會再另行協助安排）、即時將預約時間與狀態同步回 Notion
- 擴充共用套件 `packages/shared-integrations`，新增 Google Calendar 存取邏輯（沿用與 Google Sheets 相同的 Service Account 分享機制，訪談者只需把個人 Calendar 分享給 service account 一次）；並將既有的 Gmail OAuth token 讀取邏輯調整為可插拔來源（本機檔案 vs. 環境變數），讓 `packages/recruit-agent`（本機檔案）與本 change（Vercel 環境變數）共用同一套 Gmail 寄信邏輯

## Capabilities

### New Capabilities

- `slot-availability`: 讀取訪談者 Google Calendar 空檔，依時段規則（1 小時一格、每天 10:00–20:00、僅未來 2 週內）計算可預約時段
- `booking-submission`: 受訪者透過邀請連結選擇並送出預約，送出時重新檢查衝突、已預約者顯示唯讀狀態
- `booking-confirmation`: 預約成立後建立 Google Calendar 事件、寄送自訂確認信、即時同步 Notion 預約狀態

### Modified Capabilities

(none)

## Impact

- Affected specs: slot-availability, booking-submission, booking-confirmation
- Affected code:
  - New: packages/booking-scheduler/package.json
  - New: packages/booking-scheduler/tsconfig.json
  - New: packages/booking-scheduler/next.config.ts
  - New: packages/booking-scheduler/src/app/book/[candidateId]/page.tsx
  - New: packages/booking-scheduler/src/app/api/book/[candidateId]/route.ts
  - New: packages/booking-scheduler/src/lib/slotAvailability.ts
  - New: packages/booking-scheduler/src/lib/bookingConfirmation.ts
  - New: packages/shared-integrations/src/googleCalendar.ts
  - Modified: packages/shared-integrations/src/gmail.ts
  - Modified: packages/shared-integrations/src/config.ts
