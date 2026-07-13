---
name: recruit-filter
description: "Conversationally filter the raw candidate roster on Google Sheets against natural-language criteria, write tag decisions back, and optionally sync to Notion"
---

透過對話式自然語言篩選 Google Sheet 上的原始候選人名單，回寫標記決定，並可視需要同步到 Notion。這個 skill 取代了 `packages/recruit-agent` 原本用 Anthropic SDK 自建的終端機篩選 agent——現在由你（Claude Code）在對話中直接扮演這個角色。

## 底層指令

所有操作都透過 `packages/recruit-agent` 的 CLI wrapper 執行（Bash）。若 `packages/recruit-agent/dist/cli.js` 不存在或程式碼有更新，先執行一次：

```bash
npm run build --workspace=@interview-platform/recruit-agent
```

三個可用指令：

```bash
# 唯讀，讀取所有列（含目前的標記狀態）
node --env-file=.env packages/recruit-agent/dist/cli.js read-rows [--sheet-name <name>]

# 回寫標記決定，--rows 是 JSON 字串：[{ "row_index": 2, "tag": true, "reason": "..." }, ...]
node --env-file=.env packages/recruit-agent/dist/cli.js write-tags --rows '<json>' [--sheet-name <name>]

# 同步已標記為主要招募對象的候選人到 Notion，--candidates 是 JSON 字串：
# [{ "row_index": 2, "name": "...", "email": "...", "reason": "..." }, ...]
node --env-file=.env packages/recruit-agent/dist/cli.js sync-notion --candidates '<json>' [--sheet-name <name>]
```

三個指令都以 JSON 印到 stdout（成功時）或 `{ "error": "..." }` 印到 stderr（失敗時，exit code 非 0）。

## 工作流程

1. **讀取**：使用者描述篩選條件時，先執行 `read-rows` 讀取所有列。這是唯讀操作，隨時可做，不需要向使用者確認。
2. **判斷**：依對話中目前為止的條件（包含本輪與先前各輪的調整）為每一列判斷是否為主要招募對象，並寫下簡短理由。
3. **總結並詢問**：用文字向使用者總結判斷結果（符合幾筆、不符合幾筆），並主動詢問使用者對這次結果是否滿意——即使使用者沒有主動問，你也一定要先問，不能直接假設使用者要回寫。同時，把你判斷不確定的邊界列（條件描述模糊、候選人資料不足以判斷、可能誤判的情況）逐一列出列號與不確定的理由，請使用者針對每一列確認去留。**在使用者針對整體滿意度與這些邊界列給出明確回應之前，不得執行 `write-tags`。**
4. **調整**：使用者在這個確認階段可能會繼續補充或調整篩選條件（不論是針對整體條件、還是針對特定邊界列），用整個對話的脈絡重新評估標記，而不是要求使用者重述完整條件，然後回到步驟 3 重新總結。
5. **回寫**：只有在使用者已經針對整體結果表示滿意、且明確要求「回寫」、「確認」、「寫入」之類的指令時，才執行 `write-tags`。**執行前，先列出即將回寫的列號、標記結果與理由，再向使用者確認一次**，取得明確同意後才實際執行——這是取代原本程式碼裡 y/n 提示的關卡，不能省略。
6. **同步 Notion**：只有在使用者明確要求「同步到 Notion」時，才執行 `sync-notion`，帶入已標記為主要招募對象的候選人（`row_index`、`name`、`email`、`reason`）。
7. **工作表（分頁）一致性**：若使用者提到特定的工作表名稱（例如「讀工作表2」、「這次改看 3 月名單那個分頁」），呼叫 `read-rows` 時要帶入對應的 `--sheet-name`；之後在同一輪對話中呼叫 `write-tags` 或 `sync-notion`，也要帶入相同的 `--sheet-name`，確保標記寫回同一個分頁。使用者沒有特別指定分頁時，三個指令都不要帶這個參數（使用預設設定的工作表）。

## 規則

- 不要在使用者只是在討論條件、還沒針對整體結果表示滿意時就執行 `write-tags` 或 `sync-notion`。
- `write-tags` / `sync-notion` 屬於會修改 Sheet / Notion 這類共享狀態的操作，即使使用者先前在同一場對話中已經確認過一次，下一輪不同批次的回寫仍要重新列出預覽並取得同意，不要沿用舊的同意。
- 回應使用者時使用繁體中文。
