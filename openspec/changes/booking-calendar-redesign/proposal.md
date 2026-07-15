## Why

目前預約頁面（`book/[candidateId]`）完全沒有視覺設計，且把最多 15 天、每天 10 個時段攤成一長串多達 150 個 radio button 疊在同一頁，選擇訪談時段既不直覺也難以瀏覽。希望改採 Airbnb 風格的視覺語言，並把時段選擇改成行事曆形式，讓候選人能更快、更清楚地找到並選擇合適的時段。

## What Changes

- 引入 Tailwind CSS 作為 `packages/booking-scheduler` 的樣式層，套用 Airbnb 風格的視覺語言（圓角卡片、留白、珊瑚色系強調色、柔和陰影）
- 引入輕量日期選擇套件（`react-day-picker`）畫出月曆格線，取代目前手刻的日期字串處理
- `BookingForm` 改為兩步驟選擇流程：先在月曆上選日期，選定日期後才顯示該日期的可用時段列表；尚未選擇日期時不顯示任何時段
- 月曆上沒有任何可用時段的日期顯示為灰階、不可點擊；有可用時段的日期顯示為可點擊
- 時段依日期分組的邏輯放在前端 `BookingForm.tsx` 處理，不變更 `getAvailableSlots()` 回傳的 `Slot[]` 資料形狀
- 範圍限定於 `book/[candidateId]/page.tsx` 與 `BookingForm.tsx` 兩個檔案；首頁（`app/page.tsx`）與已預約後的唯讀畫面維持現狀，不在此次範圍內

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `booking-submission`: 新增「候選人透過行事曆選擇日期、只有還有可用時段的日期可點選、選定日期後才顯示該日期時段列表」的互動需求

## Impact

- Affected specs: booking-submission
- Affected code:
  - New: packages/booking-scheduler/tailwind.config.ts
  - New: packages/booking-scheduler/postcss.config.mjs
  - New: packages/booking-scheduler/src/app/book/[candidateId]/BookingCalendar.tsx
  - Modified: packages/booking-scheduler/src/app/book/[candidateId]/BookingForm.tsx
  - Modified: packages/booking-scheduler/src/app/book/[candidateId]/page.tsx
  - Modified: packages/booking-scheduler/src/app/globals.css
  - Modified: packages/booking-scheduler/package.json
