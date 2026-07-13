## 1. 專案初始化與外部服務設定

- [x] 1.1 建立 npm workspaces monorepo 骨架（根目錄 `package.json` 設定 `workspaces: ["packages/*"]`、`tsconfig.base.json`），並建立 `packages/shared-integrations` 與 `packages/recruit-agent` 兩個空白套件，對應「採用 Monorepo 架構，Google/Notion Client 邏輯抽成共用套件」的設計決策 — 驗證：於根目錄執行 `npm run build`（透過 workspaces 建置兩個套件），exit code 為 0
- [x] 1.2 建立 Google Cloud 專案與 Service Account，並將測試用 Google Sheet 分享給該 service account 的 email — 驗證：使用 service account 憑證呼叫 Sheets API 讀取測試 Sheet，成功回傳資料
- [x] 1.3 建立 Notion Internal Integration，並將測試用 Notion 資料庫分享給該 integration — 驗證：以 Integration Token 呼叫 Notion API 列出資料庫內容成功
- [x] 1.4 建立 Gmail OAuth 2.0 使用者授權用戶端設定（Google Cloud OAuth Client ID/Secret，桌面應用程式類型）— 驗證：於本機完成一次瀏覽器同意流程，成功取得並儲存 refresh token

## 2. Claude Agent 核心迴圈與工具定義

- [x] 2.1 實作手動 agentic loop，呼叫 Claude API（`claude-opus-4-8`），處理 `tool_use`／`stop_reason`，並在每輪對話結束後把控制權交還給使用者，對應「使用 Claude API（claude-opus-4-8）搭配手動 Agentic Loop，而非 Tool Runner」的設計決策 — 驗證：以模擬工具呼叫撰寫單元測試，確認迴圈在 `stop_reason !== "tool_use"` 時正確結束並回傳文字給使用者
- [x] 2.2 實作三個獨立的使用者定義工具 `get_sheet_rows`、`write_tags`、`sync_to_notion`（其中 `write_tags` 需帶 `strict: true` schema），對應「篩選/標記/同步拆成三個獨立的使用者定義工具」的設計決策 — 驗證：三個工具各自的單元測試涵蓋成功與失敗情境

## 3. 讀取 Google Sheet 原始名單

- [x] 3.1 實作 `get_sheet_rows` 呼叫 Google Sheets API，回傳每列的 row_index、欄位值與目前標記狀態，滿足 "Read raw candidate data from Google Sheet" 需求 — 驗證：對測試 Sheet 執行後，回傳筆數與內容與 Sheet 實際資料一致
- [x] 3.2 實作 Sheet 未與 service account 共用時的明確錯誤訊息 — 驗證：以未授權的 service account 執行讀取，確認錯誤訊息包含所需共用的 service account email

## 4. 對話式自然語言篩選

- [x] 4.1 實作篩選邏輯，讓 Claude 依使用者自然語言條件為每列產生標記決定與理由，滿足 "Iterative natural-language filtering" 需求 — 驗證：輸入範例篩選條件後，確認回傳的標記結果與理由符合預期
- [x] 4.2 實作條件反覆調整時重新評估標記，不需使用者重述完整原始條件 — 驗證：模擬兩輪對話輸入（先寬後窄或先窄後寬），確認第二輪標記依整體對話脈絡正確調整

## 5. 標記預覽確認與回寫 Google Sheet

- [x] 5.1 實作標記預覽畫面（顯示 row_index、標記值、理由）與 y/n 確認流程，對應「標記與同步前需終端機互動確認，非全自動寫入」的設計決策，並滿足 "Tag write-back requires explicit confirmation" 需求 — 驗證：手動測試輸入拒絕確認，確認未呼叫 Google Sheets 寫入 API
- [x] 5.2 實作 `write_tags` 呼叫 Google Sheets API 寫入標記欄位，滿足 "Confirmed tags are written back to the sheet" 需求 — 驗證：確認後執行寫入，讀回 Sheet 確認標記欄位已正確更新
- [x] 5.3 實作逐列錯誤處理，確保單列寫入失敗不影響其他列的處理結果 — 驗證：模擬單列寫入失敗，確認回報內容明確區分失敗列與成功列

## 6. 同步受訪名單到 Notion

- [x] 6.1 實作 `sync_to_notion`，將標記為主要招募對象的列建立或更新對應 Notion 頁面，滿足 "Sync tagged candidates to Notion" 需求，並沿用「Notion 存取採用官方 SDK（`@notionhq/client`）搭配 Internal Integration Token」的設計決策 — 驗證：對測試資料庫執行同步後，確認頁面正確建立且欄位內容正確
- [x] 6.2 實作已同步候選人更新既有頁面而非重複建立 — 驗證：對同一候選人執行兩次同步，確認 Notion 資料庫中只有一筆對應頁面
- [x] 6.3 實作同步結果摘要輸出（建立/更新/失敗筆數）與逐筆失敗隔離，滿足 "Sync result reporting" 需求 — 驗證：模擬單筆同步失敗，確認摘要正確顯示各類筆數且其餘筆數不受影響

## 7. 邀請信發送指令

- [x] 7.1 實作獨立的邀請信發送指令，查詢 Notion 中狀態為待邀請的名單並逐一寄送，滿足 "Manual invite dispatch trigger" 需求，對應「邀請信發送為獨立指令，讀取 Notion 已篩選名單並寄送含預留預約連結的信件」的設計決策 — 驗證：對測試 Notion 資料庫執行指令，確認僅寄送給狀態為待邀請的候選人
- [x] 7.2 實作無待邀請名單時的提示訊息 — 驗證：清空測試資料庫中待邀請項目後執行指令，確認顯示「無需寄送」且未呼叫寄信 API
- [x] 7.3 實作信件內容包含依候選人 ID 組成的預留預約連結，滿足 "Invite email contains a booking link placeholder" 需求 — 驗證：檢查寄出信件內容包含正確格式的 `${BOOKING_BASE_URL}/book/{candidateId}` 連結

## 8. 邀請結果狀態更新與錯誤隔離

- [x] 8.1 實作寄信成功後更新 Notion 狀態為已邀請，滿足 "Notion status updated after successful send" 需求 — 驗證：對測試候選人寄送成功後，確認 Notion 狀態欄位正確變更
- [x] 8.2 實作寄信失敗時狀態維持不變並回報失敗原因 — 驗證：模擬寄信失敗，確認 Notion 狀態未被更新且錯誤訊息包含具體原因
- [x] 8.3 實作批次寄送中單一候選人失敗不影響其他候選人，滿足 "Per-candidate failure isolation during dispatch" 需求 — 驗證：模擬其中一筆候選人寄信失敗，確認其餘候選人仍正常收到邀請信

## 9. Gmail 授權流程與憑證安全

- [x] 9.1 實作首次寄信前檢查本機是否已有有效 Gmail OAuth token，若無則啟動一次性瀏覽器同意流程，滿足 "Gmail authorization is established before first send" 需求，對應「Google Sheets 存取採用 Service Account；Gmail 寄信採用 OAuth 2.0 使用者授權」的設計決策 — 驗證：刪除本機 token 檔案後執行寄信指令，確認觸發 OAuth 同意流程且流程完成前未寄出任何信件
- [x] 9.2 將 OAuth refresh token 檔案與其他憑證檔案加入 `.gitignore`，避免意外提交至版本控制 — 驗證：執行 `git status`，確認 token 與憑證檔案未被追蹤

## 10. 支援對話中指定工作表分頁

- [x] 10.1 實作 `get_sheet_rows`／`write_tags` 的 `sheet_name` 參數，讓使用者可在對話中指定要讀取/回寫的 Google Sheet 分頁，未指定時 fallback 到設定的預設分頁，滿足 "Operator may target a specific sheet tab within the conversation" 需求，對應「get_sheet_rows／write_tags 支援可選的 sheet_name 參數，讀寫使用同一分頁」的設計決策 — 驗證：單元測試涵蓋「指定分頁時使用該分頁」「未指定時使用預設分頁」兩種情境，並以真實 Sheet（15 筆問卷資料）驗證讀取與回寫皆正確作用於指定分頁
- [x] 10.2 確保同一輪對話中，read 與 write 使用相同的 sheet_name，避免標記寫到錯誤分頁 — 驗證：單元測試確認 write_tags 帶入與 get_sheet_rows 相同的 sheet_name 時，寫入請求的 range 落在正確分頁
