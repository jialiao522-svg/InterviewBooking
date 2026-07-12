## 1. 主動確認流程（SYSTEM_PROMPT 行為調整，不新增工具）

- [x] 1.1 依 design.md 決策「主動確認流程改為 system prompt 行為調整，不新增工具」，更新 `packages/recruit-agent/src/agent/systemPrompt.ts` 的 `SYSTEM_PROMPT`：標記完成後，先總結符合/不符合筆數、明確詢問操作者是否滿意，並逐一列出被判斷為邊界模糊的列（含理由），待操作者回應後才允許進入回寫流程，全程不新增任何工具 schema；驗證方式：人工核對更新後的 `SYSTEM_PROMPT` 字串同時包含「詢問滿意度」與「列出邊界模糊列」對應的指示語句，且仍保留「使用者只是討論條件、尚未要求回寫時不得呼叫 write_tags」的既有規則（對應 spec `candidate-roster-filtering` 的 Requirement: Tag write-back requires explicit confirmation 中新增的 Proactive summary and satisfaction check / Ambiguous rows are flagged individually 情境）
- [x] 1.2 在 `packages/recruit-agent/src/agent/loop.test.ts` 新增測試情境，驗證 `runTurn` 在收到第一輪標記評估的純文字回應後直接回傳給操作者、不會自動觸發 `write_tags` 工具呼叫；驗證方式：`vitest run packages/recruit-agent/src/agent/loop.test.ts` 通過，且新增案例中 `writeSheetTags` 未被呼叫（對應 Requirement: Tag write-back requires explicit confirmation 的既有 Preview shown before write 情境維持成立）

## 2. sync_to_notion 取得候選人完整問卷資料

- [x] 2.1 修改 `packages/recruit-agent/src/agent/tools.ts` 的 `sync_to_notion` `input_schema`，新增可選欄位 `sheet_name: string`（比照 `get_sheet_rows`／`write_tags` 既有慣例），並同步更新 `SyncToNotionInput` type；驗證方式：`packages/recruit-agent/src/agent/tools.test.ts` 的 `TOOL_DEFINITIONS` 測試群組新增斷言，確認 `sync_to_notion` 的 `input_schema.properties` 含有 `sheet_name`
- [x] 2.2 修改 `executeTool` 的 `sync_to_notion` case：呼叫 `deps.readSheetRows(undefined, sheetName)` 依 `row_index` 找回候選人整列 `columns`，扣除 `config.tagColumnHeader` 與 `config.reasonColumnHeader` 兩欄後，组成 `answers: Record<string, string>` 併入傳給 `deps.syncCandidatesToNotion` 的候選人物件（對應 design.md 決策「問卷回答資料來源：同步時重新向 Google Sheets 取值，而非要求 LLM 透過工具呼叫傳遞」）；驗證方式：`packages/recruit-agent/src/agent/tools.test.ts` 的 `executeTool: sync_to_notion` 群組新增測試，驗證 `readSheetRows` 被以正確 `row_index`／`sheet_name` 呼叫，且 `syncCandidatesToNotion` 收到的候選人物件包含扣除 Tag/Reason 欄位後的 `answers`
- [x] 2.3 在同一測試群組新增案例，驗證帶入 `sheet_name` 時會原樣傳遞給 `readSheetRows`；未帶入時 `readSheetRows` 收到 `undefined`；驗證方式：`vitest run packages/recruit-agent/src/agent/tools.test.ts` 通過

## 3. Notion 頁面內文「問卷回答」區塊（toggle heading）

- [x] 3.1 修改 `packages/shared-integrations/src/notion.ts` 的 `CandidateSyncInput`，新增欄位 `answers: Record<string, string>`；驗證方式：`packages/shared-integrations/src/notion.test.ts` 現有測試更新候選人輸入資料含 `answers` 欄位仍可通過型別檢查與既有屬性同步斷言
- [x] 3.2 在 `packages/shared-integrations/src/notion.ts` 新增函式（例如 `writeQuestionnaireSection`），依 design.md 決策「問卷回答寫入頁面內文，使用 toggle heading 區塊作為覆蓋邊界」實作：用 `client.blocks.children.list` 找出標題純文字為「問卷回答」且 `is_toggleable: true` 的 `heading_2` 區塊；找不到時用 `client.blocks.children.append` 在頁尾新增該 toggle heading 並帶入每題一個子段落區塊；找到時先用 `client.blocks.children.list` 取出其子區塊、逐一 `client.blocks.delete`，再用 `client.blocks.children.append` 寫入新的子區塊；驗證方式：`packages/shared-integrations/src/notion.test.ts` 新增測試，分別驗證「候選人第一次同步時建立 toggle heading 與子區塊」與「候選人已有該區塊時只刪除重建子區塊、不影響頁面其他區塊」兩種情境
- [x] 3.3 讓 `syncCandidatesToNotion` 在既有的 create/update 屬性流程完成後，呼叫 3.2 新增的函式寫入問卷回答區塊，並將該步驟的例外視為該候選人的同步失敗，計入既有 `SyncResult.failed` 陣列而不中斷其他候選人的同步；驗證方式：`packages/shared-integrations/src/notion.test.ts` 新增測試，模擬 `blocks.children.append` 或 `blocks.delete` 拋出例外時，`result.failed` 包含該候選人且其他候選人仍完成同步（對應 spec `notion-roster-sync` 新增的 Requirement: Questionnaire answers written to Notion page body 中 Questionnaire answers included on first sync / Questionnaire section overwritten, not duplicated, on re-sync / Questionnaire write failure isolated per candidate 三個情境）

## 4. 端到端驗證

- [x] 4.1 執行 `pnpm --filter @interview-platform/shared-integrations test` 與 `pnpm --filter @interview-platform/recruit-agent test`（或對應的 workspace 測試指令），確認所有既有測試與本次新增測試皆通過；驗證方式：兩個指令的執行結果皆為 exit code 0、無失敗案例
