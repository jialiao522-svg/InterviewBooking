import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { google } from "googleapis";
import { getGmailOAuthConfig, GmailOAuthConfig } from "./config";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

export interface StoredGmailToken {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

export class GmailAuthRequiredError extends Error {
  constructor(public readonly tokenPath: string) {
    super(
      `No Gmail OAuth token found at ${tokenPath}. Run the authorization consent flow first.`,
    );
    this.name = "GmailAuthRequiredError";
  }
}

export function hasStoredToken(
  config: GmailOAuthConfig = getGmailOAuthConfig(),
): boolean {
  return fs.existsSync(config.tokenPath);
}

function loadToken(tokenPath: string): StoredGmailToken {
  return JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
}

function saveToken(
  token: StoredGmailToken,
  config: GmailOAuthConfig = getGmailOAuthConfig(),
): void {
  fs.mkdirSync(path.dirname(config.tokenPath), { recursive: true });
  fs.writeFileSync(config.tokenPath, JSON.stringify(token), { mode: 0o600 });
}

function createOAuthClient(config: GmailOAuthConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, REDIRECT_URI);
}

/**
 * Opens a one-time browser consent flow and persists the resulting refresh
 * token to the configured token path. Google's legacy out-of-band (OOB) flow
 * is deprecated, so this spins up a short-lived local HTTP server to catch
 * the redirect instead of asking the user to paste a code manually.
 */
export async function runOAuthConsentFlow(
  config: GmailOAuthConfig = getGmailOAuthConfig(),
): Promise<void> {
  const oauth2Client = createOAuthClient(config);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [GMAIL_SEND_SCOPE],
    prompt: "consent",
  });

  // eslint-disable-next-line no-console
  console.log("請在瀏覽器開啟以下網址並完成 Google 帳號授權：");
  // eslint-disable-next-line no-console
  console.log(authUrl);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        return;
      }
      const url = new URL(req.url, REDIRECT_URI);
      const authCode = url.searchParams.get("code");
      if (authCode) {
        res.end("授權完成，請回到終端機。");
        server.close();
        resolve(authCode);
      } else {
        res.end("授權失敗，請重試。");
        server.close();
        reject(new Error("OAuth callback did not include an authorization code"));
      }
    });
    server.listen(REDIRECT_PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token; retry the consent flow (prompt=consent forces one)",
    );
  }

  saveToken(
    {
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    },
    config,
  );
}

export async function ensureGmailAuthorized(
  config: GmailOAuthConfig = getGmailOAuthConfig(),
): Promise<void> {
  if (!hasStoredToken(config)) {
    await runOAuthConsentFlow(config);
  }
}

/**
 * Local file takes priority (used by the recruit-agent CLI, which can run the
 * interactive consent flow). Serverless environments like Vercel have no
 * persistent disk, so they fall back to a refresh token supplied via env var.
 */
function resolveToken(config: GmailOAuthConfig): StoredGmailToken {
  if (hasStoredToken(config)) {
    return loadToken(config.tokenPath);
  }
  const envRefreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;
  if (envRefreshToken) {
    return { refresh_token: envRefreshToken };
  }
  throw new GmailAuthRequiredError(config.tokenPath);
}

async function getGmailClient(config: GmailOAuthConfig = getGmailOAuthConfig()) {
  const token = resolveToken(config);
  const oauth2Client = createOAuthClient(config);
  oauth2Client.setCredentials(token);
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

function encodeMessage(message: EmailMessage): string {
  const raw = [
    `To: ${message.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.body,
  ].join("\r\n");

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendEmail(
  message: EmailMessage,
  config: GmailOAuthConfig = getGmailOAuthConfig(),
): Promise<void> {
  const gmail = await getGmailClient(config);
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeMessage(message) },
  });
}
