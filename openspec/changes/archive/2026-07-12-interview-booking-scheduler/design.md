## Context

這是專案的第二個 change，延續 `recruit-list-filtering-agent` 建立的 monorepo（`packages/shared-integrations`、`packages/recruit-agent`）。`recruit-list-filtering-agent` 的 `invite-dispatch` 能力已定義邀請信連結格式 `${BOOKING_BASE_URL}/book/{candidateId}`，其中 `candidateId` 就是候選人在 Notion 資料庫中的頁面 ID；本 change 的預約網頁即消費這個連結，並沿用同一份 Notion 資料庫（狀態從「已邀請」轉為「已預約」）。

本 change 明確排除「訪談前 24 小時自動提醒」——該功能需要常駐排程機制，已在討論中決議延後處理，留待未來獨立的 change。

## Goals / Non-Goals

**Goals:**

- 受訪者透過邀請連結開啟網頁，看到訪談者 Google Calendar 的即時空檔並可自主選擇時段
- 送出預約時避免與其他受訪者的選擇產生衝突（重複預約同一時段）
- 已完成預約的受訪者重複造訪連結時，看到的是唯讀的既有預約時間，不會建立第二筆
- 預約成立後自動建立 Google Calendar 事件、寄送確認信、同步 Notion 狀態

**Non-Goals:**

- 訪談前 24 小時自動提醒（需要常駐排程機制，已決議延後至未來獨立 change）
- 取消或改期預約的介面（本 change 只處理「首次預約」這個動作）
- 支援多位訪談者／多組 Calendar（假設單一訪談者）
- 訪談者/管理端的操作介面（進度儀表板沿用 Notion，本 change 不重複建立）

## Decisions

### 使用 Next.js（App Router）部署於 Vercel

使用者明確選擇 Next.js 而非更輕量的 Express + 伺服器端渲染模板，換取前後端一體的開發彈性與未來擴充空間；部署選擇 Vercel 是因為 Next.js 在該平台上原生支援度最好、部署設定最少。

### 依固定規則計算可預約時段（1 小時一格、每天 10:00–20:00、僅未來 2 週）

可預約時段 = 「固定時間網格（每天 10:00–20:00，1 小時一格，含週末）」扣除「訪談者 Google Calendar 上該時段已標示忙碌的部分」。只顯示未來 14 天內的網格，避免受訪者選到半年後的時段。這是使用者明確指定的具體規則，不做成可設定選項（YAGNI：目前只有一位訪談者、一組固定規則）。

### 送出當下重新檢查 Calendar 避免重複預約

受訪者選定時段並送出後，伺服器端（API route）在真正建立 Calendar 事件前，重新讀取一次該時段的 free/busy 狀態。若已被佔用（可能是幾乎同時送出的另一位受訪者搶先建立），回傳衝突結果，讓頁面提示「這個時段剛被別人訂走了」並重新整理可預約時段列表。不採用資料庫層級的鎖或佇列機制，因為 Google Calendar 本身就是唯一的時段真實來源（source of truth），重新讀取即可涵蓋絕大多數的衝突情境。

### 已預約者重複造訪連結顯示唯讀狀態

進入 `/book/{candidateId}` 時，先查詢該候選人在 Notion 的狀態。若狀態已是「已預約」，直接顯示已預約的時間（唯讀），不進入選時段流程，避免受訪者重複點連結而建立第二筆 Calendar 事件與確認信。

### Google Calendar 存取沿用 Service Account 分享機制（與 Google Sheets 相同）

Google Calendar 支援把個人行事曆分享給任何 email（包含 service account 的 email）並授予「代為變更活動」權限，這個分享機制不需要 Google Workspace 網域管理員權限（不同於 Gmail 寄信那樣需要 Domain-Wide Delegation）。因此 Calendar 存取沿用與 `recruit-list-filtering-agent` 中 Google Sheets 相同的 Service Account 模式：訪談者一次性把個人 Calendar 分享給 service account email，之後完全免互動。

**替代方案**：讓 Calendar 也走 OAuth 2.0 使用者授權（與 Gmail 相同）。優點是不需要額外的分享設定步驟；缺點是徒增一組 OAuth 流程與 token 管理成本，而 Service Account 分享對 Calendar 完全可行，故不採用。

### Gmail Token 讀取邏輯改為可插拔來源，支援本機檔案與環境變數

`packages/recruit-agent`（本機 CLI）目前把 Gmail OAuth refresh token 存在本機檔案；Vercel 上的 serverless function 沒有可持久化的本機磁碟，必須改讀環境變數。因此修改 `packages/shared-integrations/src/gmail.ts`，讓 token 讀取邏輯依執行環境自動選擇來源：本機檔案存在時優先讀檔案，否則讀取 `GMAIL_OAUTH_REFRESH_TOKEN` 環境變數。兩個 change 共用同一份 Gmail 寄信程式碼，只是 token 的儲存位置不同。

### candidateId 直接對應 Notion 頁面 ID，不另外設計驗證 token

預約連結中的 `candidateId` 就是 Notion 頁面 ID（一組不易猜測的 UUID），本身已提供足夠的存取控制強度：連結只會透過邀請信寄給對應候選人本人，且頁面 ID 無法從其他資訊推導或列舉。因此不另外設計簽章 token 或一次性密碼機制，避免不必要的複雜度。若未來出現連結外流的疑慮，可在該時候再補強（例如加上到期時間或簽章驗證）。

## Implementation Contract

**行為**：
- 受訪者開啟 `/book/{candidateId}`：
  - 若該候選人在 Notion 的狀態已是「已預約」→ 顯示唯讀的已預約時間，不提供選時段介面
  - 否則 → 讀取訪談者 Google Calendar 未來 14 天內、每天 10:00–20:00、1 小時一格的空檔列表，供受訪者選擇
- 受訪者選定時段並送出：
  - 伺服器重新檢查該時段是否仍空著
    - 若已被佔用 → 回傳衝突結果，頁面提示重選並重新整理可預約列表，不建立任何 Calendar 事件或 Notion 更新
    - 若仍空著 → 依序執行：建立 Google Calendar 事件（受訪者 email 為與會者）→ 更新 Notion 該候選人的狀態為「已預約」並記錄預約時間 → 嘗試寄送自訂確認信（訪談須知、地點資訊；若候選人有線上需求，信中註明會後續協助安排）
    - 確認信寄送失敗不會讓已建立的 Calendar 事件與 Notion 更新回滾（Calendar 原生邀請本身會通知受訪者，作為確認信失敗時的備援通知管道），但失敗原因需被記錄／回報

**資料形狀**：
- 可預約時段：`{ start: string /* ISO 8601 */, end: string /* ISO 8601 */ }[]`
- 送出預約請求：`{ candidateId: string, slotStart: string, slotEnd: string }`
- Notion 候選人頁面新增欄位：`BookedTime`（預約時間）、`CalendarEventId`（對應建立的 Calendar 事件 ID，供之後查詢或除錯使用）
- `Status` 欄位新增列舉值「已預約」，接續 `recruit-list-filtering-agent` 已定義的「已邀請」狀態

**失敗模式**：
- `candidateId` 在 Notion 中查無對應頁面 → 回傳 404，頁面顯示「連結無效或已過期」
- Google Calendar API 呼叫失敗（讀取空檔或建立事件）→ 回傳明確錯誤訊息，不建立部分寫入的 Notion 狀態
- 送出當下時段已被佔用 → 回傳衝突狀態碼，附上最新的可預約列表供頁面重新渲染
- Gmail 寄送確認信失敗 → 記錄失敗原因，但不影響已完成的 Calendar 事件建立與 Notion 狀態更新

**驗收標準**：
- 對測試候選人開啟預約連結，確認顯示的可預約時段符合「未來 14 天、每天 10:00–20:00、1 小時一格、扣除既有忙碌時段」的規則
- 選定時段並送出後，確認 Google Calendar 上建立了包含候選人 email 的事件、Notion 狀態變為「已預約」且記錄了正確的預約時間、測試信箱收到確認信
- 模擬兩個請求幾乎同時預約同一時段，確認只有一個成功、另一個收到衝突提示且未建立重複事件
- 對已完成預約的候選人重新開啟同一連結，確認顯示唯讀的已預約時間，且未產生第二筆 Calendar 事件

**範圍邊界**：
- 本 change 不包含：訪談前 24 小時自動提醒、取消/改期預約介面、多訪談者支援、訪談者/管理端操作介面
- 本 change 不包含：連結簽章或到期時間驗證機制（見上方決策的替代方案說明）

## Risks / Trade-offs

- [風險] 訪談者需手動把個人 Google Calendar 分享給 service account，若忘記操作會導致讀取空檔時失敗 → [緩解] 啟動/部署文件中列出一次性設定步驟，API 失敗時回傳可辨識的錯誤訊息（區分「未授權」與其他錯誤）
- [風險] Gmail OAuth refresh token 過期時，Vercel serverless 環境沒有互動式瀏覽器可重新同意 → [緩解] 列為 Open Question，需另外設計重新授權流程（見下方）
- [風險] 確認信寄送失敗不會回滾已建立的預約，可能讓候選人只收到 Calendar 原生邀請、沒收到含訪談須知的確認信 → [緩解] 失敗會被記錄，且 Calendar 原生邀請本身包含事件時間資訊，作為最低限度的備援通知
- [風險] `candidateId` 沒有額外的簽章或到期時間保護，連結外流即可被任何人查看/預約 → [緩解] 目前威脅模型下可接受（見上方決策說明），未來若有外流疑慮再補強

## Migration Plan

全新套件，無既有系統需要遷移。首次部署需要的一次性設定：
- 訪談者把個人 Google Calendar 分享給既有的 service account email，並授予「代為變更活動」權限
- 在 Vercel 專案設定環境變數：Service Account 憑證、`GMAIL_OAUTH_REFRESH_TOKEN`、Notion 憑證、`BOOKING_BASE_URL`
- 將 `packages/booking-scheduler` 連結到 Vercel 專案並完成首次部署

## Open Questions

- Gmail OAuth refresh token 在 Vercel 環境下過期時，沒有互動式瀏覽器同意流程可用；需要另外決定重新授權的操作方式（例如：在本機重新執行一次 OAuth 流程取得新的 refresh token，再手動更新 Vercel 環境變數），這部分留待實際遇到時或後續 change 再定案
