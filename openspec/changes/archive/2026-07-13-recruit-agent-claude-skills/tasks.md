## 1. 用薄 CLI wrapper 取代 Anthropic tool_use 的結構化呼叫

- [x] 1.1 建立 `packages/recruit-agent/src/cli.ts`，實作 `read-rows [--sheet-name <name>]` subcommand，呼叫既有 `readSheetRows` 並將結果以 JSON 印到 stdout — 驗證：`packages/recruit-agent/src/cli.test.ts` 以 mocked `readSheetRows` 執行 `read-rows`，確認 stdout 印出的 JSON 與 mock 回傳值一致
- [x] 1.2 在 `cli.ts` 實作 `write-tags --rows <json> [--sheet-name <name>]` subcommand，解析 `--rows` 的 JSON 陣列（`{ row_index, tag, reason? }[]`）後呼叫既有 `writeSheetTags`，將結果印到 stdout — 驗證：`cli.test.ts` 以合法 JSON 呼叫，確認 mocked `writeSheetTags` 收到正確解析後的參數；以格式錯誤的 JSON 呼叫，確認 process 以非 0 exit code 結束並印出 `{ error }` 到 stderr、且未呼叫 `writeSheetTags`
- [x] 1.3 在 `cli.ts` 實作 `sync-notion --candidates <json> [--sheet-name <name>]` subcommand，沿用現有 `sync_to_notion` 工具的邏輯（重新讀取該 sheet 列以取出問卷回答、排除標記欄與理由欄組成 answers）後呼叫既有 `syncCandidatesToNotion` — 驗證：`cli.test.ts` 以 mocked `readSheetRows` 與 `syncCandidatesToNotion` 執行，確認傳給 `syncCandidatesToNotion` 的 `answers` 正確排除標記欄與理由欄
- [x] 1.4 為 `write-tags` 與 `sync-notion` 加入例外處理：底層函式拋出例外時，捕捉並印出 `{ error: string }` 到 stderr，以非 0 exit code 結束 — 驗證：`cli.test.ts` 模擬底層函式拋出例外，確認 process exit code 非 0 且 stderr 印出對應錯誤訊息
- [x] 1.5 更新 `packages/recruit-agent/package.json`：新增 `cli.ts` 對應的 build 產物進入點（沿用既有 `tsc` build 流程即可產生 `dist/cli.js`），移除 `@anthropic-ai/sdk` 依賴 — 驗證：於根目錄執行 `npm run build --workspace=@interview-platform/recruit-agent`，確認產生 `packages/recruit-agent/dist/cli.js` 且 `package.json` 不再包含 `@anthropic-ai/sdk`

## 2. 刪除 `agent/loop.ts`、`agent/tools.ts`、`agent/systemPrompt.ts` 與 `@anthropic-ai/sdk`

- [x] 2.1 刪除 `packages/recruit-agent/src/agent/loop.ts`、`agent/tools.ts`、`agent/systemPrompt.ts` 及其測試 `loop.test.ts`、`tools.test.ts` — 驗證：`find packages/recruit-agent/src/agent -type f` 回傳空結果（目錄不存在或無檔案）
- [x] 2.2 修改 `packages/recruit-agent/src/index.ts`：移除 `runFilteringRepl()`、`Anthropic` import 與對 `./agent/loop` 的 import；`main()` 只保留 `--invite` 分支，未帶 `--invite` 時印出提示文字告知改用 Claude Code 的 `recruit-filter` skill — 驗證：執行 `node --env-file=.env packages/recruit-agent/dist/index.js`（不帶參數），確認印出提示文字後正常結束（exit code 0），不再進入互動式 REPL
- [x] 2.3 執行 `npm run test --workspace=@interview-platform/recruit-agent`，確認移除 `agent/` 目錄後既有測試（不含已刪除的 `loop.test.ts`/`tools.test.ts`）全數通過 — 驗證：指令 exit code 為 0

## 3. `recruit-filter` skill：把篩選工作流程搬進 Claude Code

- [x] 3.1 建立 `.claude/skills/recruit-filter/SKILL.md`，內容涵蓋 design.md「`recruit-filter` skill 承接原本 systemPrompt 的工作流程保證」列出的 7 個步驟（唯讀讀取隨時可做、總結並詢問整體滿意度與邊界列、確認後才回寫、明確要求才同步、sheet_name 一致性等）— 驗證：人工比對 SKILL.md 內容，確認 7 個步驟逐條可在文件中找到對應段落
- [x] 3.2 在 SKILL.md 中明確指示：執行 `write-tags` 前，Claude 需先列出即將回寫的列與標記內容並取得使用者明確同意，取代原本 `tools.ts` 的 y/n 提示 — 驗證：人工走一次流程，觀察 Claude 在使用者尚未表態滿意前不會執行 `write-tags`，且執行前有列出預覽並等待同意
- [x] 3.3 人工執行一次完整篩選情境（描述條件 → 收到符合/不符合筆數總結與邊界列詢問 → 補充調整條件 → 確認 → 回寫 → 明確要求同步 Notion）— 驗證：觀察到的行為與 design.md 中 Implementation Contract 描述的驗收標準一致，且未在確認前呼叫 `write-tags` 或 `sync-notion`

## 4. `recruit-invite` skill 只是既有指令的別名，不重寫邏輯

- [x] 4.1 在根目錄 `package.json` 新增 `invite` script：`npm run build --workspace=@interview-platform/recruit-agent && node --env-file=.env packages/recruit-agent/dist/index.js --invite` — 驗證：於根目錄執行 `npm run invite`，確認行為與直接執行 `node --env-file=.env packages/recruit-agent/dist/index.js --invite` 一致（沿用既有 `dispatchInvites()`）
- [x] 4.2 建立 `.claude/skills/recruit-invite/SKILL.md`，內容為：使用者要求發送邀請信時，透過 Bash 執行 `npm run invite` 並回報其輸出（成功/失敗筆數、失敗清單）— 驗證：人工呼叫此 skill，確認 Claude 執行 `npm run invite` 並將輸出內容回報給使用者

## 5. 文件更新

- [x] 5.1 更新 `packages/recruit-agent/README.md` 的「執行」段落與「環境變數」段落，移除 `ANTHROPIC_API_KEY` 相關說明，改為說明透過 Claude Code 的 `recruit-filter` 與 `recruit-invite` skill 操作、以及 `npm run invite` 的獨立呼叫方式 — 驗證：人工審閱 README 內容，確認不再提及 `ANTHROPIC_API_KEY` 或舊有的 `node ... dist/index.js`（不含 `--invite`）啟動方式
