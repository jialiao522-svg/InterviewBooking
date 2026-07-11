## Context

這是全新專案的第一個 change，目前沒有既有程式碼可沿用。使用者（招募/訪談者）目前手動維護一份 Google Sheet 存放原始未篩選名單，篩選條件會隨招募輪次變動，且沒有集中的進度追蹤機制。本 change 建立一支終端機互動程式，作為使用者與 Claude API 對話式篩選的介面，並串接 Google Sheets 與 Notion。後續的預約網頁與背景服務（`interview-booking-scheduler`，另一個獨立 change）將依賴這裡產出的「已確認受訪名單」與邀請信發送結果，但本 change 不包含預約頁面、行事曆讀取、確認信或行前提醒。

`interview-booking-scheduler` 同樣需要存取 Google（Calendar、Gmail）與 Notion API，兩個 change 因此共用同一個 monorepo 專案，並共用一份 Google/Notion client 邏輯（見下方「採用 Monorepo 架構」決策），避免認證邏輯在兩處各自維護。

## Goals / Non-Goals

**Goals:**

- 使用者可用自然語言下篩選條件，並反覆調整（多輪對話），對 Google Sheet 原始名單進行標記
- 標記結果回寫到 Google Sheet，且回寫前有明確的預覽/確認步驟
- 篩選後的受訪名單同步到 Notion 資料庫，作為後續進度追蹤起點
- 使用者確認名單後，可手動觸發發送邀請信（人在迴圈把關）

**Non-Goals:**

- 受訪者自主預約頁面、Google Calendar 空檔讀取、確認信、行前提醒（屬於 `interview-booking-scheduler` change）
- 全自動、無人把關的邀請信發送
- 多使用者同時操作同一份名單（假設單一操作者）
- 跨行程持久化對話狀態（本次為單一終端機 session 內的記憶體狀態，不做磁碟持久化）

## Decisions

### 使用 Claude API（claude-opus-4-8）搭配手動 Agentic Loop，而非 Tool Runner

這是一個持續運作的終端機 REPL，使用者會在同一個 session 內多次下達獨立的篩選指令（反覆調整條件），而不是一次性「執行到完成」的自動化任務。手動迴圈讓程式控制每一輪對話的邊界（何時把控制權交還給使用者），並在工具呼叫需要寫入外部系統前插入確認步驟。SDK 內建的 tool runner 假設迴圈跑到底才停，不適合這種「每輪由人驅動」的互動模式。

### 篩選/標記/同步拆成三個獨立的使用者定義工具

`get_sheet_rows`（唯讀，讀取 Sheet 原始資料）、`write_tags`（標記回寫，帶 `strict: true` schema）、`sync_to_notion`（同步到 Notion）。拆成三個工具而非一個泛用的「execute」工具，是因為這三個動作的風險等級不同（唯讀 vs. 會修改外部系統的狀態），需要能個別攔截、審核、記錄。

### 採用 Monorepo 架構，Google/Notion Client 邏輯抽成共用套件

專案改採 npm workspaces 的 monorepo 結構：`packages/shared-integrations` 存放 Google Sheets、Gmail、Notion 的 client 存取邏輯（含認證設定），`packages/recruit-agent` 是本 change 的終端機程式，依賴 `shared-integrations`。這是因為後續的 `interview-booking-scheduler`（預約網頁）也需要存取 Google（Calendar、Gmail）與 Notion API，若兩個 change 各自實作一份 client 程式碼，Service Account／OAuth 認證邏輯會需要在兩處重複維護且容易不同步。抽成共用套件後，兩個 change 都只依賴同一份底層存取邏輯，各自的應用邏輯（CLI REPL vs. 預約網頁）維持獨立。

**替代方案**：讓兩個 change 各自獨立維護一份 client 程式碼。優點是部署環境不同（CLI vs. Vercel serverless）時不需要共用套件版本管理的額外複雜度；缺點是認證邏輯重複、日後任一邊調整認證方式都要記得同步到另一邊，故不採用。

### Google Sheets 存取採用 Service Account；Gmail 寄信採用 OAuth 2.0 使用者授權

兩者選擇不同的認證方式，原因不同：
- **Sheets**：Service Account 只需把 Sheet 共用給 service account 的 email 一次，之後完全免互動，適合單一操作者的 CLI 工具。
- **Gmail**：Service Account 無法以個人 Gmail 帳號身份寄信（Domain-Wide Delegation 需要 Google Workspace 管理員權限，一般使用者帳號不具備），因此邀請信發送改用 OAuth 2.0 使用者授權流程（一次性瀏覽器同意，之後用 refresh token 續期），這樣不論帳號是否屬於 Workspace 網域都能運作。

### Notion 存取採用官方 SDK（`@notionhq/client`）搭配 Internal Integration Token

Notion Internal Integration 是最簡單、不需 OAuth 流程的存取方式：使用者建立一個 integration、把目標資料庫分享給該 integration 即可。

### 標記與同步前需終端機互動確認，非全自動寫入

`write_tags` 與 `sync_to_notion` 屬於會修改外部系統狀態的動作。執行前，CLI 顯示本輪異動預覽（哪些列會被標記、標記結果為何），並要求使用者輸入 y/n 確認後才真正呼叫 Sheets/Notion API。這對應討論中「你確認名單」的要求，也降低 LLM 誤判造成的風險。

### get_sheet_rows／write_tags 支援可選的 sheet_name 參數，讀寫使用同一分頁

原本假設 Sheet 只有單一固定分頁（由 `GOOGLE_SHEET_RANGE` 設定），但實測時發現分頁名稱可能異動（例如 Google Sheet 預設分頁名稱「工作表1」被改掉），且使用者可能想在同一個 Sheet 檔案中處理多個分頁（例如不同月份的名單）。因此為 `get_sheet_rows` 與 `write_tags` 加上可選的 `sheet_name` 參數：使用者在對話中指定分頁名稱時，兩個工具都改用該分頁；未指定時 fallback 回 `.env` 設定的預設分頁。系統提示詞明確要求：若讀取時用了特定 `sheet_name`，回寫時要帶入相同的值，避免「讀 A 分頁、寫到 B 分頁」這種資料錯置的情況。

**替代方案**：只讓使用者透過修改 `.env` 的 `GOOGLE_SHEET_RANGE` 來切換分頁。優點是實作最簡單；缺點是每次切換分頁都要重啟程式改環境變數，不符合對話式工具原本「隨時可調整」的使用情境，故不採用。

### 邀請信發送為獨立指令，讀取 Notion 已篩選名單並寄送含預留預約連結的信件

邀請信發送（`invite-dispatch`）不是篩選對話迴圈的一部分，而是使用者在確認名單後另外觸發的指令。信件內容包含指向預約頁面的連結（`${BOOKING_BASE_URL}/book/{candidateId}`），`BOOKING_BASE_URL` 為環境變數，實際網址在 `interview-booking-scheduler` change 完成後才會生效；本 change 只需要產生正確格式的連結與寄信機制。

## Implementation Contract

**行為**：
- 執行 CLI（例如 `npm start`）進入互動式終端機 REPL
- 使用者輸入自然語言篩選條件 → Claude 呼叫 `get_sheet_rows` 讀取資料、依條件判斷標記 → 顯示標記預覽 → 使用者可再下一輪指令調整條件，或輸入確認指令執行 `write_tags` 回寫
- 標記回寫成功後，使用者可觸發 `sync_to_notion`，將標記為「主要招募對象」的列同步到 Notion 資料庫（顯示同步結果的建立/更新筆數）
- 使用者可另外執行邀請信發送指令，讀取 Notion 中狀態為「已篩選待邀請」的名單，逐一寄送邀請信，寄送成功後將該筆 Notion 狀態更新為「已邀請」

**資料形狀**：
- `get_sheet_rows` 回傳：`{ row_index: number, columns: Record<string, string>, current_tag: boolean | null }[]`
- `write_tags` 輸入：`{ rows: { row_index: number, tag: boolean, reason?: string }[] }`
- `sync_to_notion` 輸入：已標記為 `tag: true` 的候選人列表，對應建立/更新 Notion 資料庫的頁面（欄位至少包含姓名、Email、來源列索引、標記理由、狀態）
- 邀請信寄送不使用 Claude 工具呼叫，而是獨立指令直接讀取 Notion API 資料後寄送

**失敗模式**：
- Google Sheet 未與 service account 共用 → 啟動時明確報錯，說明需要的共用步驟
- Gmail OAuth token 不存在或過期 → 首次觸發邀請信發送時進入一次性瀏覽器同意流程
- Sheets/Notion/Gmail API 呼叫失敗 → 逐列回報失敗原因，不靜默吞掉錯誤；`write_tags`／`sync_to_notion`／寄信皆為逐筆處理，單筆失敗不影響其他筆的處理結果

**驗收標準**：
- 對測試用 Sheet 下自然語言篩選條件，確認標記結果符合預期並正確回寫到 Sheet 對應欄位
- 確認 Notion 測試資料庫收到正確的同步筆數與欄位內容
- 對測試信箱實際寄出一封邀請信，確認信件內容包含正確格式的預留預約連結，且 Notion 狀態正確更新為「已邀請」

**範圍邊界**：
- 本 change 不包含：預約頁面、Google Calendar 讀取、確認信、行前提醒（這些屬於 `interview-booking-scheduler`）
- 本 change 不包含：多使用者權限管理、跨裝置/跨 session 的狀態同步

## Risks / Trade-offs

- [風險] Service Account 需要使用者手動把 Sheet 分享給 service account email，若忘記操作會導致啟動失敗 → [緩解] 在 `tasks.md` 加入一次性設定步驟的文件/檢查，啟動時偵測權限不足並給出明確指引
- [風險] Gmail OAuth refresh token 存在本機檔案，若外洩可被用來以使用者身份寄信 → [緩解] token 檔案加入 `.gitignore`，僅存於本機，不上傳版本控制
- [風險] 自然語言篩選條件屬於 LLM 判斷，可能有誤判（過篩或漏篩）→ [緩解] 標記回寫前強制預覽與人工確認，且標記理由會寫入 Notion 供事後檢查
- [風險] 若 Sheet 列數過多，一次讀取可能超出對話的合理 token 用量 → [緩解] `get_sheet_rows` 設計為可分批讀取（例如依區間或分頁），初期實作先以中小型名單（數百列以內）為假設，若實務上超出再調整分批策略
- [風險] `shared-integrations` 是兩個獨立 change（CLI 與後續的 Vercel 預約網頁）共用的套件，任一方修改共用介面時都可能影響另一方 → [緩解] 共用套件對外只暴露穩定的 client 建立函式（例如 `getSheetsClient()`、`getNotionClient()`），內部認證細節的調整不影響呼叫端；跨 change 的介面異動須在對應的 design.md 中記錄

## Migration Plan

全新專案，無既有系統需要遷移。首次部署需要的一次性設定（monorepo 骨架建立、Google Cloud 專案建立、Service Account 建立與 Sheet 共用、Notion Integration 建立與資料庫共用、Gmail OAuth 用戶端設定）會列在 `tasks.md` 中作為設定步驟，而非程式碼遷移。

## Open Questions

- Google Sheet 原始資料的確切欄位結構（哪些欄位可用來判斷「主要招募對象」）尚未定案，需在實作時參考實際 Sheet 範例來確認
- Notion 資料庫的確切屬性名稱／型別尚未定案，需在實作時依使用者實際的 Notion 工作區設定調整
