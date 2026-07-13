## Context

`packages/recruit-agent` 目前有兩個進入點，都掛在 `src/index.ts` 的 `main()`：

- 預設模式：啟動 `runFilteringRepl()`，用 `readline` 做一個終端機對話迴圈，把每輪輸入送進 `agent/loop.ts` 的 `runTurn()`。`runTurn()` 直接呼叫 Anthropic SDK（`new Anthropic()`、`client.messages.create()`），模型寫死 `claude-opus-4-8`，工具定義在 `agent/tools.ts`（`get_sheet_rows` / `write_tags` / `sync_to_notion`），guardrail（回寫前 y/n 確認、寫死的工作流程規則）寫在 `agent/systemPrompt.ts`
- `--invite` 模式：呼叫 `dispatchInvites()`，純機械流程（查 Notion 待邀請名單 → 寄信 → 更新 Notion 狀態），完全不涉及 LLM

操作者本身就在 Claude Code 裡工作，篩選這件事等於在 Claude Code 之外又跑了一份「Claude Code 本來就會做的事」，還多背一組 `ANTHROPIC_API_KEY` 計費與一長串啟動指令。這個 change 把篩選流程改成 Claude Code skill，並把 `--invite` 的呼叫方式也簡化（但不改其實作），兩者都新增對應的 skill 檔案。

## Goals / Non-Goals

**Goals:**

- 移除 `packages/recruit-agent` 對 `@anthropic-ai/sdk` 的依賴與自建 agent loop，改由 Claude Code 本身在對話中執行篩選工作流程
- 保留 `get_sheet_rows` / `write_tags` / `sync_to_notion` 三個操作背後的實際邏輯（`shared-integrations` 的 `readSheetRows` / `writeSheetTags` / `syncCandidatesToNotion`），只是換一個穩定的呼叫介面（CLI wrapper）給 Claude Code 用
- 讓 `--invite` 在 Claude Code 裡可以用一句短指令觸發，同時保留原本可被排程/自動化呼叫的能力
- 篩選 skill 需完整複製現有 `systemPrompt.ts` 裡的工作流程保證：唯讀讀取隨時可做、回寫前必須先總結結果並詢問整體滿意度、逐一列出不確定的邊界列讓使用者確認、只有使用者明確要求才回寫、只有使用者明確要求才同步 Notion

**Non-Goals:**

- 不改變 `candidate-roster-filtering`、`invite-dispatch` 兩個 capability 的既有規格行為（本次是實作替換，不是行為變更）
- 不改動 `shared-integrations` 裡 `readSheetRows` / `writeSheetTags` / `syncCandidatesToNotion` / `queryCandidatesByStatus` / `sendEmail` / `updateCandidateStatus` 等函式本身的邏輯
- 不改動 `dispatchInvites()` 或 `index.ts` 的 `--invite` 分支邏輯
- 不處理 `packages/booking-scheduler` 或其他 package，範圍限定在 `packages/recruit-agent`、根目錄 `package.json`、`.claude/skills/`

## Decisions

### 用薄 CLI wrapper 取代 Anthropic tool_use 的結構化呼叫

現有的 `TOOL_DEFINITIONS`（`agent/tools.ts`）用 JSON Schema + `strict: true` 讓 Anthropic API 保證參數形狀正確。Claude Code 沒有這一層，只能透過 Bash 執行指令。因此新增 `packages/recruit-agent/src/cli.ts`，提供三個 subcommand，各自對應一個既有函式，不含新商業邏輯：

- `read-rows [--sheet-name <name>]`：呼叫 `readSheetRows(undefined, sheetName)`，將結果以 JSON 印到 stdout
- `write-tags --rows <json>`：`--rows` 是 JSON 字串，形狀為 `{ row_index: number; tag: boolean; reason?: string }[]`；解析後呼叫 `writeSheetTags(rows, undefined, sheetName)`，將結果以 JSON 印到 stdout；`--sheet-name` 為選填
- `sync-notion --candidates <json>`：`--candidates` 是 JSON 字串，形狀為 `{ row_index: number; name: string; email: string; reason: string }[]`；沿用現有 `sync_to_notion` 工具實作邏輯（重新讀取該 sheet 的列以取出問卷回答，排除標記欄與理由欄後組成 `answers`），呼叫 `syncCandidatesToNotion`，將結果以 JSON 印到 stdout；`--sheet-name` 為選填

三個 subcommand 都不做互動式確認（不像現有 `tools.ts` 的 `confirm()`）——確認這件事交給 Claude Code 對話本身（skill 指示要求先取得使用者明確同意才執行 `write-tags` / `sync-notion`）。

若拒絕方案：讓 Claude 直接用 `node -e` 臨場拼接呼叫 `shared-integrations` 函式，不建立固定 CLI——放棄，因為沒有固定契約、无法寫測試、每次呼叫容易拼錯巢狀 JSON 參數。

### 刪除 `agent/loop.ts`、`agent/tools.ts`、`agent/systemPrompt.ts` 與 `@anthropic-ai/sdk`

這三個檔案的職責（模型呼叫迴圈、工具定義、系統提示詞）在新架構下由 Claude Code 本身 + `.claude/skills/recruit-filter/SKILL.md` 取代，不再需要。`index.ts` 移除 `runFilteringRepl()` 與相關 import，`main()` 只保留 `--invite` 分支；若無 `--invite`，印出提示訊息告知改用 Claude Code skill。

### `recruit-filter` skill 承接原本 systemPrompt 的工作流程保證

`.claude/skills/recruit-filter/SKILL.md` 內容需完整表達現有 `agent/systemPrompt.ts` 的規則，而不只是「呼叫 CLI」：

1. 使用者描述篩選條件時，先執行 `read-rows` 讀取所有列（唯讀，隨時可做，不需確認）
2. 依對話中目前為止的條件（含本輪與先前調整）為每列判斷是否為主要招募對象並寫下理由
3. 用文字總結判斷結果（符合幾筆、不符合幾筆），主動詢問使用者是否滿意；逐一列出不確定的邊界列（條件模糊、資料不足、可能誤判），請使用者針對每列確認去留；在使用者明確回應整體滿意度與邊界列之前，不得執行 `write-tags`
4. 使用者在確認階段補充或調整條件時，用整個對話脈絡重新評估，回到步驟 3 重新總結，不要求使用者重述完整條件
5. 只有使用者明確要求「回寫」/「確認」/「寫入」時才執行 `write-tags`；執行前，Claude 需先列出即將回寫的列與標記內容，再向使用者確認一次（取代原本 `tools.ts` 裡程式碼寫死的 y/n 提示）
6. 只有使用者明確要求「同步到 Notion」時才執行 `sync-notion`，帶入已標記為主要招募對象的候選人（row_index、name、email、reason）
7. 若使用者提到特定工作表（分頁）名稱，讀取與後續回寫/同步都要帶入相同的 `--sheet-name`；未指定時三個 subcommand 都不帶這個參數

### `recruit-invite` skill 只是既有指令的別名，不重寫邏輯

在根目錄 `package.json` 新增：

```json
"invite": "npm run build --workspace=@interview-platform/recruit-agent && node --env-file=.env packages/recruit-agent/dist/index.js --invite"
```

`.claude/skills/recruit-invite/SKILL.md` 的職責只有一件事：使用者要求發送邀請信時，透過 Bash 執行 `npm run invite`，並將輸出（成功/失敗筆數、失敗清單）回報給使用者。不新增任何 wrapper 程式碼，因為 `--invite` 分支本身已經是一個穩定、單一呼叫點；未來若要接排程/自動化，一樣呼叫 `npm run invite`，與 skill 共用同一份邏輯。

## Implementation Contract

**CLI wrapper（`packages/recruit-agent/src/cli.ts`）**

- 命令列介面：`node dist/cli.js read-rows [--sheet-name <name>]`、`node dist/cli.js write-tags --rows <json> [--sheet-name <name>]`、`node dist/cli.js sync-notion --candidates <json> [--sheet-name <name>]`
- 輸出：成功時，每個 subcommand 將對應函式的回傳值以 `JSON.stringify(...)` 印到 stdout，exit code 0
- 失敗模式：底層函式拋出例外時，`cli.ts` 捕捉例外，將 `{ error: string }` 印到 stderr，並以非 0 exit code 結束；`--rows` / `--candidates` 的 JSON 解析失敗時，同樣印出 `{ error: string }` 到 stderr 並以非 0 exit code 結束，不呼叫底層函式
- 驗收標準：`packages/recruit-agent/src/cli.test.ts` 對三個 subcommand 個別驗證（1）正常輸入時呼叫對應的 mocked 函式並印出其 JSON 結果、（2）`write-tags`/`sync-notion` 的 JSON 參數格式錯誤時回傳非 0 exit code 與 `{ error }`、（3）底層函式拋出例外時同樣回傳非 0 exit code 與 `{ error }`

**`recruit-filter` skill（`.claude/skills/recruit-filter/SKILL.md`）**

- 行為：一份 SKILL.md，內容涵蓋上述 Decisions 中列出的 7 個工作流程步驟，供 Claude Code 在使用者呼叫此 skill 時遵循
- 驗收標準：人工執行一次完整流程（描述條件 → 收到總結與邊界列詢問 → 確認 → 觀察是否在確認前執行 `write-tags`），並檢查 SKILL.md 內容逐條對應到上述 7 個步驟（內容審查，非自動化測試，因為這是 prompt 而非程式碼）

**`recruit-invite` skill（`.claude/skills/recruit-invite/SKILL.md`）与 npm script**

- 行為：使用者要求發送邀請信時，Claude Code 執行 `npm run invite`
- 驗收標準：於根目錄執行 `npm run invite`，確認執行結果與直接執行 `node --env-file=.env packages/recruit-agent/dist/index.js --invite` 一致（沿用既有 `dispatchInvites()` 行為，不需新增測試）

**範圍邊界**：本次變更僅止於 `packages/recruit-agent`（新增 `cli.ts` 及其測試、刪除 `agent/` 目錄下三個檔案及其測試、修改 `index.ts` 與 `package.json`）、根目錄 `package.json`（新增 `invite` script）、`.claude/skills/recruit-filter/`、`.claude/skills/recruit-invite/`、`packages/recruit-agent/README.md`。不涉及 `shared-integrations`、`booking-scheduler` 或任何 spec 檔案的修改。

## Risks / Trade-offs

- [風險] 回寫/同步前的確認關卡從程式碼強制（`tools.ts` 的 `confirm()` y/n）變成 SKILL.md 裡的文字指示，強制力較弱，Claude 有可能在極端情況下沒有充分確認就執行 `write-tags` → [緩解] SKILL.md 明確要求「執行前必須列出預覽並取得使用者明確同意」，且 `write-tags` 屬於本系統「風險操作需確認」的通用準則範圍內
- [風險] `write-tags` / `sync-notion` 失去 Anthropic API 端的 JSON Schema 型別驗證，參數形狀錯誤不會在送出前被攔截 → [緩解] `cli.ts` 自行做基本的 JSON 解析與必要欄位檢查，解析失敗時回傳明確錯誤訊息而非靜默失敗
- [風險] 篩選功能改為只能在 Claude Code 互動 session 中執行，無法排程/無人值守觸發 → [緩解] 此為刻意取捨（篩選本來就需要人工判斷條件），且 `--invite` 這條可排程的路徑不受影響，仍可獨立於 Claude Code 之外觸發
- [風險] 移除 `@anthropic-ai/sdk` 後，篩選品質會跟著使用者當下 Claude Code session 選用的模型變動，不再固定使用 `claude-opus-4-8` → [緩解] 使用者可在 Claude Code 中自行切換模型；此為已知並接受的取捨（見 `/spectra-discuss` 討論結論）
