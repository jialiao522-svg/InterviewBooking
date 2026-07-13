# recruit-agent

招募名單篩選與邀請信發送。篩選透過 Claude Code 的 `recruit-filter` skill 進行對話式自然語言篩選，回寫標記，同步到 Notion；邀請信發送則透過 `recruit-invite` skill（或直接執行 `npm run invite`）觸發。

## 一次性設定

以下步驟需要你本人操作（無法由 Agent 代為完成）。

### 1. Google Sheets（Service Account）

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立一個專案（或使用既有專案）。
2. 啟用 **Google Sheets API**（APIs & Services → Enable APIs and Services → 搜尋 "Google Sheets API"）。
3. 建立 Service Account（IAM & Admin → Service Accounts → Create Service Account），完成後在該 Service Account 底下建立一組 JSON 金鑰並下載。
4. 打開你要篩選的 Google Sheet，點右上角「共用」，把 Service Account 的 email（格式類似 `xxx@xxx.iam.gserviceaccount.com`，可在 JSON 金鑰檔案的 `client_email` 欄位找到）加進去，權限選「編輯者」。
5. 把下載的 JSON 金鑰檔案放到本機一個安全的位置（**不要**放進這個 git repo，`.gitignore` 已排除 `service-account.json` 這類檔名，但仍建議放在 repo 外）。

### 2. Notion（Internal Integration）

1. 到 [Notion Integrations](https://www.notion.so/my-integrations) 建立一個新的 Internal Integration，取得 API Token（`ntn_...` 或 `secret_...` 開頭）。
2. 建立（或使用既有）用來追蹤受訪名單的 Notion 資料庫，至少要有以下欄位：
   - `Name`（Title）
   - `Email`（Email）
   - `SourceRowIndex`（Number）
   - `Reason`（Text）
   - `Status`（Status，選項至少包含「已篩選待邀請」與「已邀請」）
3. 打開該資料庫，點右上角「···」→「Connections」，把剛建立的 Integration 加進去。
4. 資料庫的 ID 可從網址列取得（`https://www.notion.so/xxxxx?v=...` 中的 `xxxxx` 那段，去掉連字號）。

### 3. Gmail（OAuth 2.0 使用者授權）

1. 在同一個（或另一個）Google Cloud 專案中啟用 **Gmail API**。
2. 前往 OAuth 同意畫面設定（OAuth consent screen），選擇「外部」測試模式，把你要用來寄信的 Gmail 帳號加入測試使用者名單。
3. 建立 OAuth Client ID（Credentials → Create Credentials → OAuth client ID），應用程式類型選「Desktop app」。記下 Client ID 與 Client Secret。
4. 第一次執行 `--invite` 指令時，程式會印出一個授權網址，請在瀏覽器開啟並完成 Google 帳號同意流程；完成後 refresh token 會自動存到本機（預設 `~/.interview-platform/gmail-token.json`）。

## 環境變數

在專案根目錄建立 `.env`（或用其他方式匯出以下環境變數）：

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
GOOGLE_SHEET_ID=...
# 以下為選填，有預設值
# GOOGLE_SHEET_RANGE=Sheet1!A1:Z1000
# GOOGLE_SHEET_TAG_COLUMN=Tag
# GOOGLE_SHEET_REASON_COLUMN=Reason

NOTION_API_KEY=...
NOTION_DATABASE_ID=...

GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
# GMAIL_OAUTH_TOKEN_PATH=~/.interview-platform/gmail-token.json

BOOKING_BASE_URL=https://your-booking-scheduler-domain.example.com
```

## 執行

### 篩選（在 Claude Code 中）

在 Claude Code 對話中呼叫 `recruit-filter` skill，描述篩選條件即可開始（例如「篩選出住在台北、有使用者研究經驗的候選人」）。這個 skill 底層透過 `packages/recruit-agent/src/cli.ts` 提供的 CLI wrapper 讀取/回寫 Google Sheet、同步 Notion，細節見 `.claude/skills/recruit-filter/SKILL.md`。

若想直接呼叫 CLI wrapper（除錯用）：

```bash
npm run build --workspace=@interview-platform/recruit-agent

node --env-file=.env packages/recruit-agent/dist/cli.js read-rows [--sheet-name <name>]
node --env-file=.env packages/recruit-agent/dist/cli.js write-tags --rows '<json>' [--sheet-name <name>]
node --env-file=.env packages/recruit-agent/dist/cli.js sync-notion --candidates '<json>' [--sheet-name <name>]
```

### 發送邀請信

在 Claude Code 對話中呼叫 `recruit-invite` skill，或直接在根目錄執行：

```bash
npm run invite
```

這個指令會先 build 本套件，再執行 `node --env-file=.env packages/recruit-agent/dist/index.js --invite`，查詢 Notion 上待邀請的候選人並寄送邀請信。

> `--env-file` 是 Node.js 20.6+ 內建功能，本專案假設在 Node 20.6 以上執行。
