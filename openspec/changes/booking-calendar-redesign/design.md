## Context

`packages/booking-scheduler` 目前沒有任何樣式框架，`globals.css` 只定義了明暗模式的 CSS 變數與字型。`book/[candidateId]/page.tsx` 呼叫 `getAvailableSlots()`（`src/lib/slotAvailability.ts`）取得橫跨 14 天、每天最多 10 個一小時時段的扁平 `Slot[]`，交給 `BookingForm.tsx` 用 `<fieldset>` + 一長串 `<input type="radio">` 呈現，最多可能同時列出 150 個選項。此變更要把這個流程改成 Airbnb 風格的兩步驟行事曆選擇，同時完全不動資料層（`slotAvailability.ts`、`/api/book/[candidateId]/route.ts`、`Slot` 型別）。

## Goals / Non-Goals

**Goals:**

- 讓候選人透過行事曆介面（先選日期、再選當日時段）完成預約，取代目前的長條 radio 清單
- 套用 Airbnb 風格的視覺語言（圓角卡片、留白、珊瑚色系強調色、柔和陰影）到預約頁
- 不改變底層資料流的行為與契約：`Slot[]`、`getAvailableSlots()`、`/api/book/[candidateId]/route.ts` 的輸入輸出格式維持不變

**Non-Goals:**

- 不重新設計首頁（`app/page.tsx`）或已預約後的唯讀畫面（`page.tsx` 中 `BOOKED_STATUS` 分支）
- 不引入完整 UI 元件庫（如 shadcn/ui），只使用 Tailwind CSS 搭配一個輕量日期選擇套件
- 不支援使用者一次選擇多個時段或跨日期預約
- 不改變 `slotAvailability.ts` 的時段計算邏輯（固定 10:00–20:00 網格、14 天 lookahead、忙碌時段排除）

## Decisions

### 引入 Tailwind CSS v4 作為樣式層

在 `packages/booking-scheduler` 新增 `tailwindcss`、`@tailwindcss/postcss` 依賴，建立 `postcss.config.mjs`（套用 `@tailwindcss/postcss` plugin）與 `tailwind.config.ts`（定義 Airbnb 風格的 theme 延伸：珊瑚色主色 `#FF385C`、hover 用 `#E31C5F`、卡片圓角 `12px`、柔和陰影 token）。`globals.css` 改為以 `@import "tailwindcss";` 開頭，並把現有的 `--background`/`--foreground` 明暗模式變數併入 Tailwind v4 的 `@theme` 區塊，避免新舊兩套 CSS 變數系統並存。字體堆疊改用系統字型模擬 Airbnb 使用的 Circular 字體：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif`。

替代方案（否決）：手刻一套 design-token CSS（不用 Tailwind）。否決原因：完全靠手寫 CSS 難以在時間內做出一致的 Airbnb 級視覺細節，且往後維護樣式一致性的成本更高。

### 用 react-day-picker 畫月曆格線

新增 `react-day-picker` 依賴（選用支援 React 19 的版本），負責月曆格線的渲染、鍵盤導覽與 ARIA 屬性；不使用它內建的時段/時間功能，時段清單另外用自訂的按鈕列表呈現。月曆的可見範圍需涵蓋 14 天 lookahead 視窗（可能橫跨兩個月份），透過 `numberOfMonths` 或初始 `month` 設定確保使用者不需要額外翻頁就能看到全部可預約日期所在的月份。

替代方案（否決）：完全手刻月曆格線元件。否決原因：正確處理週起始日、鍵盤操作、無障礙屬性等細節工作量大，且是眾所皆知容易出錯的部分，優先用成熟套件覆蓋這塊。

### 新增 BookingCalendar 元件，封裝「日期分組 + 兩步驟選擇」邏輯

新增 `packages/booking-scheduler/src/app/book/[candidateId]/BookingCalendar.tsx`，把 `Slot[]` 依日期分組、計算哪些日期可點擊、渲染月曆與時段清單兩個區塊，並把使用者最終選定的時段往上回傳給 `BookingForm.tsx`。`BookingForm.tsx` 保留既有的提交狀態機（`idle`/`submitting`/`booked`/`conflict`/`error`）與 `/api/book/${candidateId}` 呼叫邏輯，只是把原本的 radio 列表換成 `<BookingCalendar>`，並把 `selectedIndex: number | null` 改為 `selectedSlot: Slot | null`。

替代方案（否決）：把分組與兩步驟邏輯直接寫在 `BookingForm.tsx` 裡，不拆出新元件。否決原因：`BookingForm.tsx` 已經承擔提交狀態機與 API 呼叫的職責，混入月曆渲染邏輯會讓單一檔案職責過重，也更難單獨測試「日期分組是否正確」這件事。

## Implementation Contract

**行為（Behavior）**：

- 使用者進入 `book/[candidateId]` 頁面時，看到一個月曆格線，涵蓋未來 14 天所在的月份範圍（可能橫跨兩個月）。
- 月曆上，`initialSlots` 中完全沒有任何時段的日期顯示為灰階且不可點擊；至少有一個時段的日期顯示為可點擊。
- 使用者點擊一個可點擊的日期後，畫面上出現該日期所有可用時段的按鈕列表，依時間先後排序。
- 在使用者選擇日期之前，時段列表區塊不顯示任何時段按鈕（空狀態）。
- 使用者點擊一個時段按鈕後，該按鈕呈現已選取的視覺樣式，且「確認預約」按鈕變成可點擊；點擊確認預約後的行為（呼叫 `/api/book/${candidateId}`、處理 200 成功、409 衝突、其他錯誤）與變更前完全相同。
- 使用者切換到另一個日期時，先前選取的時段會被清除，避免送出的時段與畫面顯示的日期不一致。
- 若所有日期都沒有可用時段，月曆整體顯示為全部不可點擊，時段列表區塊顯示提示文字「近期沒有可預約時段，請聯絡招募人員」。

**介面 / 資料形狀**：

- 新增 `BookingCalendar.tsx`：`interface BookingCalendarProps { slots: Slot[]; selectedSlot: Slot | null; onSelectSlot: (slot: Slot | null) => void; }`。元件內部把 `slots` 依 `start` 欄位的日期部分（ISO 字串前 10 碼 `YYYY-MM-DD`，即 Asia/Taipei 牆上時間的日期）分組成 `Map<string, Slot[]>`；沒有任何時段的日期傳給 `react-day-picker` 的 `disabled` 條件。
- `BookingForm.tsx` 的狀態從 `selectedIndex: number | null` 改為 `selectedSlot: Slot | null`；送出邏輯改用 `selectedSlot.start` / `selectedSlot.end` 取代原本用 `slots[selectedIndex]` 取值；`SubmitState` 型別與既有的 409/error 分支處理邏輯不變。409 衝突時（`data.reason === "slot_taken"`）在 `setSlots(data.availableSlots ?? [])` 之外，同時把 `selectedSlot` 設回 `null`。
- `getAvailableSlots()`、`Slot` 型別（`src/lib/slotAvailability.ts`）、`/api/book/[candidateId]/route.ts` 的輸入輸出格式完全不變。

**失敗模式**：

- 沒有任何日期有可用時段：月曆所有日期不可點擊，時段列表區塊顯示「近期沒有可預約時段，請聯絡招募人員」提示文字，不新增任何後端錯誤處理邏輯。
- 409 衝突（時段被搶走）：沿用現行邏輯更新可用時段清單，並額外清空 `selectedSlot`，使用者需重新從月曆選擇日期與時段。
- Calendar 存取失敗（`CalendarAccessDeniedError`）：沿用 `page.tsx` 現行的錯誤畫面，不受此次變更影響。

**驗收標準**：

- 新增或更新 `BookingForm.test.tsx`（若尚無此測試檔則新增），涵蓋：(a) 沒有任何時段的日期在月曆中不可點擊；(b) 點擊有時段的日期後，畫面顯示該日期全部時段且依時間排序；(c) 點擊時段後點「確認預約」會以正確的 `slotStart`/`slotEnd`（即該時段的 `start`/`end`）呼叫 `/api/book/${candidateId}`；(d) 切換到另一個日期後，先前選取的時段視覺上不再呈現已選取狀態，且再次點擊確認預約前必須重新選擇時段。
- 手動驗證：`npm run dev --workspace=@interview-platform/booking-scheduler` 啟動後，在瀏覽器開啟一個測試 `candidateId` 的預約頁，確認月曆呈現、日期可點擊/不可點擊狀態、兩步驟選擇流程，以及圓角卡片、珊瑚色系、留白等視覺風格符合 Airbnb 風格設計。

**範圍邊界**：

- 範圍內：`book/[candidateId]/page.tsx`、`BookingForm.tsx`、新增的 `BookingCalendar.tsx`、`globals.css`、`package.json`（新增 `tailwindcss`、`@tailwindcss/postcss`、`react-day-picker` 依賴）、`tailwind.config.ts`、`postcss.config.mjs`
- 範圍外：`app/page.tsx` 首頁、已預約後的唯讀畫面內容與樣式、`slotAvailability.ts` 的時段計算邏輯、`/api/book/[candidateId]/route.ts` 的行為、`shared-integrations` 套件

## Risks / Trade-offs

- [Risk] `react-day-picker` 對 React 19 / Next.js 16 的相容性可能尚未完全穩定 → [Mitigation] 導入時選擇明確標示支援 React 19 的版本，若發現相容性問題則改為手刻一個最小可用的月曆格線元件，不影響 `BookingCalendar` 對外的 props 介面
- [Risk] 把現有 `--background`/`--foreground` 明暗模式變數併入 Tailwind v4 的 `@theme` 區塊時，可能與新的珊瑚色系 token 命名衝突或遺漏深色模式樣式 → [Mitigation] 一次性重構，將所有顏色 token 集中定義在同一個 `@theme` 區塊，並手動檢查深色模式下的可讀性
- [Risk] 月曆預設顯示範圍若只涵蓋當月，14 天 lookahead 跨月時使用者需要手動翻頁才能看到全部可預約日期 → [Mitigation] 設定 `numberOfMonths` 或初始 `month`，確保頁面載入時已一次顯示涵蓋 14 天視窗的月份
