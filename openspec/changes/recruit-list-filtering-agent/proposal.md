## Why

目前招募流程中，Google Sheet 上累積的是未經篩選的原始報名/應徵資料，篩選主要招募對象需要人工逐列檢視，且篩選標準會隨招募輪次調整、難以一次到位。同時，篩選結果目前沒有集中的進度追蹤機制，難以掌握「已篩選、待邀請」的名單狀態。

本變更建立一個以終端機對話驅動的篩選 Agent，讓使用者用自然語言下篩選條件、反覆調整，並將結果自動回寫 Google Sheet、同步到 Notion 作為進度追蹤起點，最後在確認名單後由使用者手動觸發邀請信發送。這是整個訪談預約平台的上游環節，後續的預約網頁（另一個 change）將依賴這裡產出的「已確認受訪名單＋邀請信」。

## What Changes

- 新增一個 Node.js/TypeScript 終端機互動程式，透過 `@anthropic-ai/sdk` 呼叫 Claude API（`claude-opus-4-8`），以多輪對話驅動篩選流程
- 讀取 Google Sheet 原始名單，讓使用者以自然語言描述篩選條件（可反覆調整、多次下指令微調結果）
- 將篩選標記（是否為主要招募對象）回寫到 Google Sheet 對應欄位
- 將篩選後的受訪名單同步到 Notion 資料庫，作為後續進度追蹤與儀表板的資料來源
- 使用者確認名單後，手動觸發「發送邀請信」動作（人在迴圈把關，非全自動），邀請信含預約連結（連結指向的預約頁面由後續 change 提供）
- 整個專案改採 npm workspaces 的 monorepo 結構：Google Sheets／Gmail／Notion 的 client 存取邏輯抽成共用套件 `packages/shared-integrations`，供本 change 與後續的 `interview-booking-scheduler`（預約網頁，另一個獨立 change）共用，避免兩邊各自維護一份認證邏輯

## Capabilities

### New Capabilities

- `candidate-roster-filtering`: 讀取 Google Sheet 原始名單，透過自然語言指令反覆篩選並標記主要招募對象，回寫標記到 Sheet
- `notion-roster-sync`: 將篩選後的受訪名單同步到 Notion 資料庫，作為進度追蹤起點
- `invite-dispatch`: 使用者確認名單後，手動觸發發送邀請信（含預約連結）給已標記的受訪者

### Modified Capabilities

(none)

## Impact

- Affected specs: candidate-roster-filtering, notion-roster-sync, invite-dispatch
- Affected code:
  - New: package.json
  - New: tsconfig.base.json
  - New: packages/shared-integrations/package.json
  - New: packages/shared-integrations/tsconfig.json
  - New: packages/shared-integrations/src/googleSheets.ts
  - New: packages/shared-integrations/src/notion.ts
  - New: packages/shared-integrations/src/gmail.ts
  - New: packages/shared-integrations/src/config.ts
  - New: packages/recruit-agent/package.json
  - New: packages/recruit-agent/tsconfig.json
  - New: packages/recruit-agent/src/index.ts
  - New: packages/recruit-agent/src/agent/loop.ts
  - New: packages/recruit-agent/src/agent/tools.ts
  - New: packages/recruit-agent/src/agent/systemPrompt.ts
