import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetToken, mockGenerateAuthUrl, mockSetCredentials, MockOAuth2, mockGmailSend } =
  vi.hoisted(() => {
    const getToken = vi.fn();
    const generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/fake-auth-url");
    const setCredentials = vi.fn();

    class OAuth2Stub {
      generateAuthUrl = generateAuthUrl;
      getToken = getToken;
      setCredentials = setCredentials;
    }

    return {
      mockGetToken: getToken,
      mockGenerateAuthUrl: generateAuthUrl,
      mockSetCredentials: setCredentials,
      MockOAuth2: OAuth2Stub,
      mockGmailSend: vi.fn(),
    };
  });

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: MockOAuth2 },
    gmail: vi.fn().mockReturnValue({
      users: { messages: { send: mockGmailSend } },
    }),
  },
}));

let storedFiles: Record<string, string> = {};

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn((filePath: string) => filePath in storedFiles),
    readFileSync: vi.fn((filePath: string) => storedFiles[filePath as string]),
    writeFileSync: vi.fn((filePath: string, data: string) => {
      storedFiles[filePath as string] = data;
    }),
    mkdirSync: vi.fn(),
  };
});

vi.mock("http", () => ({
  createServer: vi.fn((handler: (req: unknown, res: unknown) => void) => ({
    listen: vi.fn(() => {
      const req = { url: "/oauth2callback?code=fake-auth-code" };
      const res = { end: vi.fn() };
      handler(req, res);
    }),
    close: vi.fn(),
  })),
}));

import {
  hasStoredToken,
  runOAuthConsentFlow,
  ensureGmailAuthorized,
  sendEmail,
  GmailAuthRequiredError,
} from "./gmail";
import type { GmailOAuthConfig } from "./config";

const testConfig: GmailOAuthConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  tokenPath: "/fake/gmail-token.json",
};

beforeEach(() => {
  storedFiles = {};
  mockGetToken.mockReset();
  mockGenerateAuthUrl.mockClear();
  mockSetCredentials.mockClear();
  mockGmailSend.mockReset();
  delete process.env.GMAIL_OAUTH_REFRESH_TOKEN;
});

describe("hasStoredToken", () => {
  it("returns false when no token file exists", () => {
    expect(hasStoredToken(testConfig)).toBe(false);
  });

  it("returns true once a token file has been written", () => {
    storedFiles[testConfig.tokenPath] = JSON.stringify({ refresh_token: "abc" });
    expect(hasStoredToken(testConfig)).toBe(true);
  });
});

describe("sendEmail without prior authorization", () => {
  it("throws GmailAuthRequiredError and never calls the Gmail send API", async () => {
    await expect(
      sendEmail({ to: "a@example.com", subject: "hi", body: "hello" }, testConfig),
    ).rejects.toBeInstanceOf(GmailAuthRequiredError);
    expect(mockGmailSend).not.toHaveBeenCalled();
  });
});

describe("sendEmail token source", () => {
  it("uses the local file token when one is stored", async () => {
    storedFiles[testConfig.tokenPath] = JSON.stringify({ refresh_token: "file-refresh-token" });
    mockGmailSend.mockResolvedValue({});

    await sendEmail({ to: "a@example.com", subject: "hi", body: "hello" }, testConfig);

    expect(mockSetCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "file-refresh-token" }),
    );
    expect(mockGmailSend).toHaveBeenCalled();
  });

  it("falls back to GMAIL_OAUTH_REFRESH_TOKEN when no local file token exists", async () => {
    process.env.GMAIL_OAUTH_REFRESH_TOKEN = "env-refresh-token";
    mockGmailSend.mockResolvedValue({});

    await sendEmail({ to: "a@example.com", subject: "hi", body: "hello" }, testConfig);

    expect(mockSetCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refresh_token: "env-refresh-token" }),
    );
    expect(mockGmailSend).toHaveBeenCalled();
  });

  it("throws GmailAuthRequiredError when neither a file token nor the env var is available", async () => {
    await expect(
      sendEmail({ to: "a@example.com", subject: "hi", body: "hello" }, testConfig),
    ).rejects.toBeInstanceOf(GmailAuthRequiredError);
  });
});

describe("runOAuthConsentFlow", () => {
  it("exchanges the captured auth code for a token and persists it", async () => {
    mockGetToken.mockResolvedValue({
      tokens: { refresh_token: "new-refresh-token", access_token: "abc", expiry_date: 123 },
    });

    await runOAuthConsentFlow(testConfig);

    expect(mockGetToken).toHaveBeenCalledWith("fake-auth-code");
    const saved = JSON.parse(storedFiles[testConfig.tokenPath]);
    expect(saved.refresh_token).toBe("new-refresh-token");
  });

  it("throws when Google does not return a refresh token", async () => {
    mockGetToken.mockResolvedValue({ tokens: { access_token: "abc" } });

    await expect(runOAuthConsentFlow(testConfig)).rejects.toThrow(/refresh token/);
  });
});

describe("ensureGmailAuthorized", () => {
  it("runs the consent flow when no token is stored yet", async () => {
    mockGetToken.mockResolvedValue({
      tokens: { refresh_token: "new-refresh-token" },
    });

    await ensureGmailAuthorized(testConfig);

    expect(mockGenerateAuthUrl).toHaveBeenCalled();
    expect(hasStoredToken(testConfig)).toBe(true);
  });

  it("does nothing when a token is already stored", async () => {
    storedFiles[testConfig.tokenPath] = JSON.stringify({ refresh_token: "existing" });

    await ensureGmailAuthorized(testConfig);

    expect(mockGenerateAuthUrl).not.toHaveBeenCalled();
  });
});
