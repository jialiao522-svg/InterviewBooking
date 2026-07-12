# booking-scheduler

受訪者自主預約訪談時間的公開網頁，部署於 Vercel。透過 `recruit-list-filtering-agent` 產生的邀請連結（`${BOOKING_BASE_URL}/book/{candidateId}`，`candidateId` 為 Notion 頁面 ID）進入。

## 尚待完成的一次性設定

以下步驟需要你本人操作：

### 1. 訪談者 Google Calendar 分享給既有的 Service Account

把訪談者本人的 Google Calendar 分享給 `recruit-list-filtering-agent` 已建立的 service account email（`service-account.json` 的 `client_email` 欄位），權限選「代為變更活動」。

### 2. 建立 Vercel 專案並設定環境變數

將 `packages/booking-scheduler` 連結到一個新的 Vercel 專案，並設定以下環境變數：

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=...  # 或改用 Vercel 的 base64/secret 存放服務帳號金鑰內容，依部署方式調整
GOOGLE_CALENDAR_ID=...               # 訪談者的 Calendar ID（通常就是其 Gmail 地址）

NOTION_API_KEY=...
NOTION_DATABASE_ID=...

GMAIL_OAUTH_CLIENT_ID=...
GMAIL_OAUTH_CLIENT_SECRET=...
GMAIL_OAUTH_REFRESH_TOKEN=...        # Vercel 無持久化磁碟，改用環境變數而非本機 token 檔案

BOOKING_BASE_URL=https://your-booking-scheduler-domain.example.com
```

`GMAIL_OAUTH_REFRESH_TOKEN` 可從本機已完成過一次 `recruit-agent` 授權流程後產生的 `~/.interview-platform/gmail-token.json` 中取得 `refresh_token` 欄位值。

### 3. Notion 資料庫新增欄位

在 `recruit-list-filtering-agent` 使用的 Notion 資料庫中新增：

- `BookedTime`（Date，需支援時間範圍）
- `CalendarEventId`（Text）
- `NeedsRemote`（Checkbox）
- `Status` 屬性新增選項「已預約」

### 4. 填寫確認信範本

`templates/confirmation-email.txt` 目前是範本，請填入實際的訪談地點與訪談須知內容（方括號標記處）。

## 執行

```bash
npm run build --workspace=@interview-platform/booking-scheduler
npm run dev --workspace=@interview-platform/booking-scheduler
```
