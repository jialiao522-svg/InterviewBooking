## Context

目前招募篩選 agent（`packages/recruit-agent`）透過三個工具運作：`get_sheet_rows`（讀 Sheet）、`write_tags`（回寫標記，內建 preview + y/n 確認）、`sync_to_notion`（同步到 Notion 資料庫頁面）。整個對話流程由 `SYSTEM_PROMPT`（`packages/recruit-agent/src/agent/systemPrompt.ts`）驅動 LLM 的行為順序，工具執行邏輯在 `packages/recruit-agent/src/agent/tools.ts`，Notion 存取邏輯集中在 `packages/shared-integrations/src/notion.ts`（使用 `@notionhq/client`）。

目前 `sync_to_notion` 只把 name/email/reason/row_index 寫進 Notion 頁面屬性（`candidatePropertiesPayload`），且標記完成後 agent 是被動等待操作者下指令回寫，不會主動總結或指出判斷不確定的列。

## Goals / Non-Goals

**Goals:**

- 標記完成後，agent 在回寫 Sheet 前主動總結結果、指出邊界模糊的列並逐一確認，操作者仍可在此階段補充篩選條件
- 同步到 Notion 時，把候選人的問卷回答（Sheet 除 Tag/Reason 欄位外的所有欄位）整理寫入頁面內文的專屬區塊
- 重新同步時只覆蓋重寫問卷回答區塊，不影響頁面其他手動編輯的內容

**Non-Goals:**

- 不新增 Notion 資料庫屬性來承載問卷回答，只寫頁面內文
- 不處理超過 Notion 單頁區塊分頁上限（100 筆）的內文讀取分頁邏輯；假設候選人頁面的區塊數不會超過此上限
- 不新增設定檔白名單指定問卷欄位，維持「全部欄位扣掉 Tag/Reason」的簡單規則

## Decisions

### 主動確認流程改為 system prompt 行為調整，不新增工具

標記完成後的「總結 → 詢問是否滿意 → 指出邊界模糊列 → 等待確認」流程完全靠調整 `SYSTEM_PROMPT` 文字達成，不需要新增或修改任何工具 schema。理由：邊界模糊的判斷本身是 LLM 的自然語言推理結果，沒有結構化資料需要在程式碼層面傳遞；沿用既有的「文字總結 → 等待操作者下一輪指令 → 才呼叫 write_tags」的既有機制即可承載這個新流程，只是總結內容要求更明確（總是要問滿意度、總是要點出不確定的列）。

替代方案：曾考慮讓 `write_tags` 的輸入 schema 加上 `confidence` 欄位，強制 LLM 為每列標註信心值。捨棄理由：這會讓「哪些列算邊界模糊」變成程式碼判斷的機械式門檻（例如 confidence < 0.7），但邊界模糊本質上是語意判斷，交給 LLM 用自然語言表達即可，不需要額外的資料結構與判斷邏輯。

### 問卷回答寫入頁面內文，使用 toggle heading 區塊作為覆蓋邊界

在 Notion 頁面內文新增（或更新）一個標題文字固定為「問卷回答」、`is_toggleable: true` 的 `heading_2` 區塊，把每一題的 Q&A 寫成該 toggle heading 底下的子區塊（每題一個 `paragraph` 區塊，格式為粗體題目 + 換行 + 回答內容）。重新同步時：

1. 呼叫 `blocks.children.list` 找出頁面現有子區塊，比對 `heading_2` 且 `is_toggleable: true` 且純文字為「問卷回答」的區塊
2. 若找到：呼叫 `blocks.children.list` 取出該 toggle heading 底下的所有子區塊，逐一呼叫 `blocks.delete` 清空，再用 `blocks.children.append` 寫入新的 Q&A 子區塊
3. 若找不到：直接在頁面末尾用 `blocks.children.append` 新增這個 toggle heading 區塊，並帶入子區塊內容

替代方案：曾考慮用「找到標題區塊、往後刪到下一個標題或頁尾」的方式框定覆蓋範圍。捨棄理由：這種掃描方式無法明確保護標題之後、非標題形式的手動筆記（例如操作者直接接著打字沒有另開標題），而 toggle heading 把內容天生限制在子區塊範圍內，覆蓋範圍精確、不需要額外掃描邊界的規則。

### 問卷回答資料來源：同步時重新向 Google Sheets 取值，而非要求 LLM 透過工具呼叫傳遞

`sync_to_notion` 工具的輸入 schema 新增可選欄位 `sheet_name`（比照 `get_sheet_rows`／`write_tags` 既有慣例），`executeTool` 的 `sync_to_notion` case 內部呼叫 `deps.readSheetRows(undefined, sheetName)` 依 `row_index` 找回該候選人整列資料，扣掉 `config.tagColumnHeader` 與 `config.reasonColumnHeader` 兩欄後，其餘欄位組成 `Record<string, string>` 當作問卷回答傳入 Notion 同步函式。

替代方案：讓 LLM 在呼叫 `sync_to_notion` 時,把每位候選人完整的問卷回答內容都填進工具呼叫參數。捨棄理由：問卷欄位可能很多、內容可能很長，要求 LLM 在工具呼叫的結構化 JSON 裡逐字複製容易出現遺漏或截斷，且會大幅增加該輪呼叫的 token 用量；改為程式碼重新讀取 Sheet 可以保證資料與來源一致，也不需要修改 LLM 對候選人資料的組裝方式。

## Implementation Contract

**Behavior:**

- 呼叫 `runTurn`（`packages/recruit-agent/src/agent/loop.ts`）跑完第一輪標記評估後，assistant 的文字回應必須包含：整體標記結果總結（符合/不符合筆數）、明確詢問操作者是否滿意、以及任何被判斷為邊界模糊的列（若有）逐一列出理由。在操作者針對總結與邊界列給出明確回應之前，assistant 不得呼叫 `write_tags`。這個行為調整完全由 `SYSTEM_PROMPT` 文字驅動，無新增工具或資料結構。
- 操作者明確要求「同步到 Notion」時，`sync_to_notion` 呼叫除了既有的 Name/Email/SourceRowIndex/Reason/Status 屬性同步外，還會把該候選人的問卷回答整理寫入其 Notion 頁面內文的「問卷回答」toggle heading 區塊；若該候選人是第一次同步（頁面剛建立），區塊為新建；若候選人先前已同步過，只覆蓋重寫該區塊底下的子區塊內容。

**Interface / data shape:**

- `packages/recruit-agent/src/agent/tools.ts`：`sync_to_notion` 的 `input_schema` 新增可選欄位 `sheet_name: string`，與 `get_sheet_rows`／`write_tags` 一致；`SyncToNotionInput` type 對應新增 `sheet_name?: string`。`executeTool` 的 `sync_to_notion` case 呼叫 `deps.readSheetRows(undefined, sheetName)` 取得候選人整列 columns，組出 `answers: Record<string, string>`（扣除 tag/reason 欄位）後傳給 `deps.syncCandidatesToNotion`。
- `packages/shared-integrations/src/notion.ts`：`CandidateSyncInput` 新增欄位 `answers: Record<string, string>`（欄位標題 → 回答內容的 map）。`syncCandidatesToNotion` 在既有的 create/update 屬性流程後，另外呼叫一個新函式（例如 `writeQuestionnaireSection(client, pageId, answers)`）負責 toggle heading 區塊的建立/覆蓋邏輯，內部使用 `client.blocks.children.list`、`client.blocks.children.append`、`client.blocks.delete`。
- `packages/recruit-agent/src/agent/systemPrompt.ts`：`SYSTEM_PROMPT` 內容更新，明確描述「標記完成後先總結＋詢問滿意度＋指出邊界模糊列，操作者確認後才回寫」的順序，取代目前「總結後可直接等待回寫指令」的描述。

**Failure modes:**

- 問卷區塊寫入失敗（例如 `blocks.children.append` 或 `blocks.delete` 拋出例外）時，該候選人視為同步失敔，計入既有 `SyncResult.failed` 陣列（與屬性寫入失敗共用同一個失敗清單與錯誤訊息格式），不影響其他候選人的同步結果，沿用 `notion-roster-sync` 既有的「Per-candidate sync failure isolation」需求。
- 若指定的 `sheet_name` 找不到、或該 `row_index` 在重新讀取時已不存在於 Sheet 上（例如同步前該列被刪除），該候選人的問卷區塊寫入視為失敗，錯誤訊息需說明原因（找不到列），其餘候選人不受影響。

**Acceptance criteria:**

- `packages/shared-integrations/src/notion.test.ts` 新增測試：候選人第一次同步時會建立「問卷回答」toggle heading 區塊並帶入子區塊內容；候選人已有該區塊時，重新同步只刪除並重建該區塊底下的子區塊（驗證 `blocks.delete` 只針對舊子區塊呼叫，`blocks.children.append`／`pages.update` 等既有屬性呼叫不受影響）。
- `packages/recruit-agent/src/agent/tools.test.ts` 新增測試：`sync_to_notion` 執行時會呼叫 `deps.readSheetRows` 取得候選人整列資料，並把扣除 Tag/Reason 欄位後的內容組成 `answers` 傳給 `deps.syncCandidatesToNotion`；帶入 `sheet_name` 時 `readSheetRows` 收到相同的 `sheet_name`。
- `packages/recruit-agent/src/agent/systemPrompt.ts` 的內容檢查（人工核對或 snapshot 測試）確認新版文字包含「主動詢問滿意度」與「指出邊界模糊列」的指示，且未移除既有「不要在使用者只是討論條件時呼叫 write_tags」的規則。

**Scope boundaries:**

- 範圍內：`SYSTEM_PROMPT` 文字調整、`sync_to_notion` 工具 schema 與執行邏輯擴充、`notion.ts` 新增問卷區塊讀寫函式與對應測試
- 範圍外：`write_tags` 工具本身的 schema 或行為（既有 preview + y/n 確認機制不變）、Notion 資料庫屬性 schema（不新增/修改 property）、Sheet 讀取/回寫邏輯本身（`googleSheets.ts` 不需修改）、`invite-dispatch` 能力（邀請信寄送流程不受影響）

## Risks / Trade-offs

- [風險] toggle heading 的比對方式依賴標題純文字完全等於「問卷回答」，若操作者手動把該標題文字改掉，下次同步會誤判為找不到區塊而在頁尾重複新增一個 → 緩解：這是已知限制，先以此簡單規則上線，若之後發現操作者常手動改標題，再考慮改用區塊自訂中繼資料或固定 ID 比對的方式
- [風險] 問卷欄位內容若超過 Notion 單一 `rich_text` 區塊 2000 字元限制會寫入失敗 → 緩解：此風險視為既有 Notion API 限制的已知邊界情況，發生時該候選人會落入既有的 per-candidate 失敗清單並回報錯誤原因，不做額外的自動截斷或分段處理
- [取捨] 主動確認流程完全依賴 LLM 對 `SYSTEM_PROMPT` 指示的遵循程度，沒有程式碼層面的強制檢查（例如擋下不符合流程的 `write_tags` 呼叫）→ 這是既有架構的既定模式（現有的「未經確認不得回寫」也是靠 prompt 描述 + `write_tags` 內建的 y/n 確認雙重保障，沒有更早一層的程式碼擋點），本次改動維持同樣的信任模型
