## Why

`packages/recruit-agent` 目前用一支自建的終端機 REPL（`agent/loop.ts` + `agent/tools.ts` + `agent/systemPrompt.ts`）呼叫 Anthropic SDK 來做候選人篩選，操作者每次都要先 build、再打一長串 `node --env-file=.env packages/recruit-agent/dist/index.js` 才能啟動。這套自建的 tool-calling loop 等同於重新實作一次 Claude Code 已經內建的能力，還額外需要一組 `ANTHROPIC_API_KEY` 與按 token 計費。既然操作者本身就是在 Claude Code 裡工作，直接把篩選流程包成 Claude Code skill，可以省掉這整套自建 agent loop、免除獨立 API 費用，也不用再記那行長指令。

`--invite`（發送邀請信）雖然沒有用到 LLM，一樣有指令太長的問題，值得順便一起解決，但它的機械流程本身要保留成可被排程/自動化呼叫的獨立指令，不能只能在 Claude Code 裡手動觸發。

## What Changes

- 刪除 `packages/recruit-agent/src/agent/loop.ts`、`agent/tools.ts`、`agent/systemPrompt.ts` 及對應測試（`loop.test.ts`、`tools.test.ts`），移除 `package.json` 裡的 `@anthropic-ai/sdk` 依賴與 `runFilteringRepl()` 進入點
- 新增 `packages/recruit-agent/src/cli.ts`：一支薄 CLI wrapper，提供 `read-rows` / `write-tags` / `sync-notion` 三個 subcommand，各自只解析參數、呼叫 `@interview-platform/shared-integrations` 既有的 `readSheetRows` / `writeSheetTags` / `syncCandidatesToNotion`，並把結果印成 JSON，不包含新的商業邏輯
- 新增 Claude Code skill `.claude/skills/recruit-filter/SKILL.md`：把原本 `systemPrompt.ts` 裡的篩選工作流程（讀取 → 依對話條件判斷標記 → 主動總結並詢問整體滿意度與邊界列 → 使用者明確要求才回寫 → 使用者明確要求才同步 Notion）搬到 skill 指示中，透過 Bash 呼叫上面的 CLI wrapper
- 在根目錄 `package.json` 新增 `invite` script：`npm run build --workspace=@interview-platform/recruit-agent && node --env-file=.env packages/recruit-agent/dist/index.js --invite`，不修改 `dispatchInvites()` 或 `index.ts` 既有的 `--invite` 分支邏輯
- 新增 Claude Code skill `.claude/skills/recruit-invite/SKILL.md`：使用者要求發送邀請信時執行 `npm run invite`，與未來任何排程/自動化觸發共用同一行指令、同一套底層邏輯
- 更新 `packages/recruit-agent/README.md` 的「執行」段落，反映新的 skill 呼叫方式與精簡後的環境變數需求（不再需要 `ANTHROPIC_API_KEY`）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- Affected specs: 無（`candidate-roster-filtering` 與 `invite-dispatch` 的既有需求皆為行為導向，本次僅替換實作方式，不改變任何已承諾的行為）
- Affected code:
  - New: packages/recruit-agent/src/cli.ts
  - New: packages/recruit-agent/src/cli.test.ts
  - New: .claude/skills/recruit-filter/SKILL.md
  - New: .claude/skills/recruit-invite/SKILL.md
  - Modified: packages/recruit-agent/package.json
  - Modified: packages/recruit-agent/README.md
  - Modified: package.json
  - Removed: packages/recruit-agent/src/agent/loop.ts
  - Removed: packages/recruit-agent/src/agent/tools.ts
  - Removed: packages/recruit-agent/src/agent/systemPrompt.ts
  - Removed: packages/recruit-agent/src/agent/loop.test.ts
  - Removed: packages/recruit-agent/src/agent/tools.test.ts
