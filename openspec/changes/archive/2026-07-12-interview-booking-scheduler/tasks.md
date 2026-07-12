## 1. 專案骨架與外部服務設定

- [x] 1.1 建立 `packages/booking-scheduler` 這個 Next.js（App Router）套件骨架，加入 monorepo workspaces，對應「使用 Next.js（App Router）部署於 Vercel」的設計決策 — 驗證：於根目錄執行 `npm run build`，此套件成功編譯，exit code 為 0
- [x] 1.2 建立 Vercel 專案並連結 `packages/booking-scheduler`，設定必要環境變數（Service Account 憑證、`GMAIL_OAUTH_REFRESH_TOKEN`、Notion 憑證、`BOOKING_BASE_URL`）— 驗證：於 Vercel 完成一次成功部署，可透過部署網址開啟首頁
- [x] 1.3 訪談者將個人 Google Calendar 分享給既有的 service account email 並授予「代為變更活動」權限 — 驗證：使用 service account 憑證呼叫 Calendar Free/Busy API 讀取該 Calendar，成功回傳資料

## 2. 共用套件擴充：Google Calendar 與 Gmail Token 來源

- [x] 2.1 於 `packages/shared-integrations` 新增 `googleCalendar.ts`，沿用 Service Account 存取 Calendar Free/Busy 與建立事件，對應「Google Calendar 存取沿用 Service Account 分享機制（與 Google Sheets 相同）」的設計決策 — 驗證：單元測試涵蓋讀取 free/busy 與建立含與會者事件兩種情境
- [x] 2.2 修改 `packages/shared-integrations/src/gmail.ts`，讓 token 讀取邏輯依環境自動選擇本機檔案或 `GMAIL_OAUTH_REFRESH_TOKEN` 環境變數，對應「Gmail Token 讀取邏輯改為可插拔來源，支援本機檔案與環境變數」的設計決策 — 驗證：分別在「有本機檔案」與「無本機檔案但有環境變數」兩種情境下執行單元測試，確認寄信函式都能正確取得 token

## 3. 可預約時段計算

- [x] 3.1 實作固定時段網格產生邏輯（每天 10:00–20:00、1 小時一格），滿足 "Available slots follow a fixed daily grid" 需求 — 驗證：單元測試以空白 Calendar 輸入，確認回傳 spec 範例表格中的十個時段
- [x] 3.2 實作扣除 Calendar 忙碌時段的邏輯，滿足 "Busy calendar time is excluded from available slots" 需求 — 驗證：單元測試模擬 14:00–15:00 忙碌事件，確認回傳九個時段且不含 14:00–15:00
- [x] 3.3 實作僅顯示未來 14 天內時段的邏輯，對應「依固定規則計算可預約時段（1 小時一格、每天 10:00–20:00、僅未來 2 週）」的設計決策，滿足 "Availability is limited to a 14-day lookahead window" 需求 — 驗證：單元測試確認第 15 天以後的時段不會出現在回傳結果中
- [x] 3.4 實作 Calendar 未分享給 service account 時的明確錯誤訊息，滿足 "Calendar access failure is surfaced clearly" 需求 — 驗證：以未授權的 service account 執行讀取，確認錯誤訊息可與一般伺服器錯誤區分

## 4. 預約頁面與送出流程

- [x] 4.1 實作 `/book/[candidateId]` 頁面，以 candidateId（即 Notion 頁面 ID，對應「candidateId 直接對應 Notion 頁面 ID，不另外設計驗證 token」的設計決策）查詢候選人資料，查無對應頁面時回傳 404 並顯示連結無效訊息，滿足 "Invalid candidate link is rejected" 需求 — 驗證：以不存在的 candidateId 開啟頁面，確認回傳 404
- [x] 4.2 實作候選人 Notion 狀態已為「已預約」時顯示唯讀已預約時間、不進入選時段流程，滿足 "Existing booking is shown as read-only on repeat visits" 需求，並對應「已預約者重複造訪連結顯示唯讀狀態」的設計決策 — 驗證：對已預約的測試候選人開啟連結，確認顯示唯讀時間且無法送出新的預約
- [x] 4.3 實作預約 API route，送出當下重新檢查該時段是否仍空著才 finalize，滿足 "Slot submission is re-validated against live calendar data before finalizing" 需求，對應「送出當下重新檢查 Calendar 避免重複預約」的設計決策 — 驗證：模擬兩個請求幾乎同時提交同一時段，確認僅一個成功、另一個收到衝突結果且未建立事件

## 5. 預約成立後的建立與同步

- [x] 5.1 實作預約成立後建立 Google Calendar 事件並將候選人 email 加入與會者，滿足 "Finalized booking creates a Google Calendar event with the candidate as attendee" 需求 — 驗證：對測試候選人完成預約後，確認 Calendar 上建立的事件包含該候選人 email 作為與會者
- [x] 5.2 實作預約成立後更新 Notion 狀態為「已預約」並記錄預約時間，滿足 "Finalized booking updates Notion status and booked time" 需求 — 驗證：完成預約後查詢 Notion，確認狀態與時間欄位正確更新
- [x] 5.3 實作確認信內容包含訪談須知與實體地點，並在候選人有線上需求時加註會另行協助安排，滿足 "Confirmation email contains interview preparation content" 需求 — 驗證：檢查測試信箱收到的確認信內容，分別驗證一般情境與線上需求情境的信件內容
- [x] 5.4 實作確認信寄送失敗時不回滾已建立的 Calendar 事件與 Notion 狀態、並記錄失敗原因，滿足 "Confirmation email failure does not roll back the booking" 需求 — 驗證：模擬寄信失敗，確認 Calendar 事件與 Notion 狀態維持不變，且失敗原因被記錄
