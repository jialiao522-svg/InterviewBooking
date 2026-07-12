import * as fs from "fs";

/**
 * Vercel functions have no persistent disk and service-account.json is
 * gitignored, so it never reaches the deployment bundle. GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 * carries the key content as an env var instead; this writes it once per
 * cold start to the path shared-integrations already expects.
 */
export function writeServiceAccountKeyFromEnv() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyJson && keyPath && !fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, keyJson);
  }
}
