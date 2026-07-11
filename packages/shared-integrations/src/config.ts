import * as os from "os";
import * as path from "path";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface SheetsConfig {
  serviceAccountKeyPath: string;
  sheetId: string;
  sheetRange: string;
  tagColumnHeader: string;
  reasonColumnHeader: string;
}

export function getSheetsConfig(): SheetsConfig {
  return {
    serviceAccountKeyPath: requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
    sheetId: requireEnv("GOOGLE_SHEET_ID"),
    sheetRange: process.env.GOOGLE_SHEET_RANGE ?? "Sheet1!A1:Z1000",
    tagColumnHeader: process.env.GOOGLE_SHEET_TAG_COLUMN ?? "Tag",
    reasonColumnHeader: process.env.GOOGLE_SHEET_REASON_COLUMN ?? "Reason",
  };
}

export interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

export function getNotionConfig(): NotionConfig {
  return {
    apiKey: requireEnv("NOTION_API_KEY"),
    databaseId: requireEnv("NOTION_DATABASE_ID"),
  };
}

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenPath: string;
}

export function getGmailOAuthConfig(): GmailOAuthConfig {
  return {
    clientId: requireEnv("GMAIL_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("GMAIL_OAUTH_CLIENT_SECRET"),
    tokenPath:
      process.env.GMAIL_OAUTH_TOKEN_PATH ??
      path.join(os.homedir(), ".interview-platform", "gmail-token.json"),
  };
}

export function getBookingBaseUrl(): string {
  return requireEnv("BOOKING_BASE_URL");
}

export { requireEnv };
