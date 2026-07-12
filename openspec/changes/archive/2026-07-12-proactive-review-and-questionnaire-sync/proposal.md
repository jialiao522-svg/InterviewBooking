## Why

目前招募篩選流程中，agent 標記完候選人後只是被動等待操作者下指令回寫或同步；對於判斷模糊的邊界列，操作者必須自己發現問題才會要求調整條件，容易在沒注意到的情況下把誤判的列寫進 Sheet 或同步到 Notion。另外，同步到 Notion 的候選人頁面目前只有 Name/Email/SourceRowIndex/Reason/Status 幾個屬性，招募方在 Notion 上看不到候選人實際填寫的問卷回答內容，還要回頭查 Google Sheet 才能了解候選人背景，增加了篩選後續作業的往返成本。

## What Changes

- 標記完成後、回寫 Sheet 前，agent 主動總結整體標記結果並詢問操作者是否滿意；同時主動指出判斷不確定的邊界列，逐一列出讓操作者確認去留，而不是只被動等待操作者要求調整
- 操作者在確認階段仍可比照現有的「Iterative natural-language filtering」需求繼續補充或調整篩選條件，agent 依整個對話脈絡重新評估
- 同步到 Notion 時，除了既有的 Name/Email/SourceRowIndex/Reason/Status 屬性外，額外把候選人在 Sheet 上填寫的問卷回答（除了 Tag 欄位與 Reason 欄位以外的所有欄位）整理寫入該候選人 Notion 頁面的內文，以「問卷回答」區塊呈現，每一題以欄位標題為題目、儲存格內容為回答
- 重新同步既有候選人時，只覆蓋重寫「問卷回答」區塊內的內容，不動頁面其他部分（保留操作者事後手動加入的訪談筆記等內容）

## Non-Goals (optional)

- 不引入新的 Notion 資料庫屬性（property）來承載問卷回答，僅寫入頁面內文，避免每次問卷題目變動就要調整 Notion 資料庫欄位結構
- 不新增設定檔白名單來指定「哪些欄位算問卷回答」，維持「Sheet 全部欄位扣掉 Tag/Reason 欄位」這個由既有設定值（`tagColumnHeader`、`reasonColumnHeader`）推導出的簡單規則
- 不處理 Notion 頁面內文以外的其他人工編輯內容保護機制（例如版本歷史、衝突偵測），只保證「問卷回答」區塊之外的內容不會被同步流程刪除

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `candidate-roster-filtering`: 標記結果需要在回寫 Sheet 前，先由 agent 主動總結、詢問操作者是否滿意並逐一確認邊界模糊的列，而非被動等待操作者主動要求調整或回寫
- `notion-roster-sync`: 同步到 Notion 時，除了既有屬性欄位外，還要把候選人的問卷回答（Sheet 除 Tag/Reason 外的所有欄位）整理寫入頁面內文的專屬區塊，並且重新同步時只覆蓋重寫該區塊

## Impact

- Affected specs: candidate-roster-filtering, notion-roster-sync
- Affected code:
  - Modified:
    - packages/recruit-agent/src/agent/systemPrompt.ts
    - packages/recruit-agent/src/agent/tools.ts
    - packages/shared-integrations/src/notion.ts
  - New: (none)
  - Removed: (none)
