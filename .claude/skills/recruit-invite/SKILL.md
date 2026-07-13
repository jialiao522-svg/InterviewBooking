---
name: recruit-invite
description: "Dispatch invite emails to candidates in Notion who are pending invitation"
---

發送邀請信給 Notion 上狀態為「已篩選待邀請」的候選人。

## 這個 skill 做什麼

這是既有 `--invite` 指令的別名，不重寫任何邏輯。實際行為完全由 `packages/recruit-agent` 的 `dispatchInvites()` 決定：查詢 Notion 上狀態為「已篩選待邀請」的候選人、寄送含預約連結的邀請信、將寄送成功的候選人狀態更新為「已邀請」。

## 執行方式

使用者要求發送邀請信時，透過 Bash 在專案根目錄執行：

```bash
npm run invite
```

這個指令會先 build `@interview-platform/recruit-agent`，再執行 `node --env-file=.env packages/recruit-agent/dist/index.js --invite`。未來若排程或其他自動化要觸發同一件事，也是呼叫這行 `npm run invite`——skill 與自動化共用同一套邏輯，不會分岔成兩套實作。

**這是會實際寄送 email、修改 Notion 資料的操作**，執行前應向使用者確認要發送邀請信，而不是自動觸發。

## 執行後

將 `npm run invite` 的輸出（成功筆數、失敗筆數、失敗清單）完整回報給使用者。若 exit code 非 0，說明可能的原因（例如 Gmail 尚未完成 OAuth 授權、Notion API 金鑰設定錯誤）並附上原始錯誤訊息。
