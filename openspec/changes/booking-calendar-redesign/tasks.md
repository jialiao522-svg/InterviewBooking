## 1. Tailwind CSS 設置

- [x] 1.1 新增 `tailwindcss`、`@tailwindcss/postcss` 依賴，建立 `postcss.config.mjs` 與 `tailwind.config.ts`，依照「引入 Tailwind CSS v4 作為樣式層」的決策定義 Airbnb 風格 theme（珊瑚色主色 `#FF385C`、hover 用 `#E31C5F`、卡片圓角 `12px`、柔和陰影 token）；`globals.css` 改為以 `@import "tailwindcss";` 開頭，並把現有 `--background`/`--foreground` 明暗模式變數併入 Tailwind v4 的 `@theme` 區塊。以 `npm run build --workspace=@interview-platform/booking-scheduler` 成功建置且無 CSS 編譯錯誤驗證。

## 2. BookingCalendar 元件與日期分組邏輯

- [x] 2.1 新增 `react-day-picker` 依賴，建立 `packages/booking-scheduler/src/app/book/[candidateId]/BookingCalendar.tsx`，依照「用 react-day-picker 畫月曆格線」與「新增 BookingCalendar 元件，封裝「日期分組 + 兩步驟選擇」邏輯」的決策，實作 Calendar-based date and time selection 需求：把傳入的 `slots` 依 `start` 的日期部分分組，沒有任何時段的日期在月曆上不可點擊，選定日期後回傳該日期依時間排序的時段清單給呼叫端。以新增的單元測試驗證日期分組結果與 disabled 日期判斷正確（涵蓋 spec 中 7/16 有 3 個時段、7/17 無時段、7/18 有 5 個時段的範例資料）。
- [x] 2.2 `BookingCalendar` 依 `numberOfMonths` 或初始 `month` 設定，確保頁面載入時已一次顯示涵蓋未來 14 天視窗的所有月份，不需要使用者額外翻頁才能看到全部可預約日期所在月份。以單元測試斷言元件初始渲染時顯示的月份範圍涵蓋起始日期起 14 天內的所有日曆月份驗證。

## 3. BookingForm 整合

- [x] 3.1 修改 `BookingForm.tsx`，將 `selectedIndex: number | null` 狀態改為 `selectedSlot: Slot | null`，並以 `<BookingCalendar>` 取代原本的 `<fieldset>` radio 列表，實作 Calendar-based date and time selection 需求中「未選擇日期前不顯示任何時段」「選定日期後顯示該日期依時間排序的時段」「切換到另一個日期時清除先前選取的時段」三項行為。以更新後的 `BookingForm.test.tsx` 單元測試驗證這三種情境。
- [x] 3.2 確認送出邏輯改用 `selectedSlot.start`/`selectedSlot.end` 呼叫 `/api/book/${candidateId}`，且既有的四種分支行為（200 成功顯示已預約訊息、409 `slot_taken` 更新可用時段並額外清空 `selectedSlot`、409 已預約顯示衝突訊息、其他錯誤顯示錯誤訊息）與變更前完全一致。以單元測試驗證四種分支各自的呼叫參數與畫面狀態。
- [x] 3.3 當所有日期都沒有可用時段時，月曆整體顯示為不可點擊，時段區塊顯示「近期沒有可預約時段，請聯絡招募人員」提示文字，實作 Calendar-based date and time selection 需求中「沒有日期有可用時段」的情境。以單元測試驗證此空狀態畫面內容。

## 4. 視覺風格與手動驗證

- [x] 4.1 依照設計文件定義的 Airbnb 風格視覺 tokens（圓角卡片、留白間距、珊瑚色系強調色、柔和陰影、系統字型堆疊模擬 Circular），套用到 `book/[candidateId]/page.tsx` 與 `BookingForm.tsx` 的排版與樣式。以人工檢查頁面樣式是否套用 1.1 定義的 theme tokens（顏色、圓角、陰影）作為驗證方式。
- [x] 4.2 手動啟動 `npm run dev --workspace=@interview-platform/booking-scheduler`，在瀏覽器開啟一個測試 `candidateId` 的預約頁，確認月曆呈現、日期可點擊/不可點擊狀態、兩步驟選擇流程與 Airbnb 視覺風格符合設計；同時執行 `npm run test --workspace=@interview-platform/booking-scheduler` 確認全數測試通過。
