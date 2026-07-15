import { google } from "googleapis";
import { getGmailOAuthConfig, GmailOAuthConfig } from "./config";
import {
  hasStoredToken,
  runOAuthConsentFlow,
  ensureGoogleAuthorized,
  getAuthorizedOAuthClient,
  GoogleAuthRequiredError,
  StoredGoogleToken,
} from "./googleOAuth";

export {
  hasStoredToken,
  runOAuthConsentFlow,
  StoredGoogleToken as StoredGmailToken,
};
export { GoogleAuthRequiredError as GmailAuthRequiredError };
export const ensureGmailAuthorized = ensureGoogleAuthorized;

async function getGmailClient(config: GmailOAuthConfig = getGmailOAuthConfig()) {
  const oauth2Client = await getAuthorizedOAuthClient(config);
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
