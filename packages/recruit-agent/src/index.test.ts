import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockQueryCandidatesByStatus,
  mockUpdateCandidateStatus,
  mockEnsureGmailAuthorized,
  mockSendEmail,
  mockGetBookingBaseUrl,
} = vi.hoisted(() => ({
  mockQueryCandidatesByStatus: vi.fn(),
  mockUpdateCandidateStatus: vi.fn(),
  mockEnsureGmailAuthorized: vi.fn(),
  mockSendEmail: vi.fn(),
  mockGetBookingBaseUrl: vi.fn().mockReturnValue("https://booking.example.com"),
}));

vi.mock("@interview-platform/shared-integrations", () => ({
  queryCandidatesByStatus: mockQueryCandidatesByStatus,
  updateCandidateStatus: mockUpdateCandidateStatus,
  ensureGmailAuthorized: mockEnsureGmailAuthorized,
  sendEmail: mockSendEmail,
  getBookingBaseUrl: mockGetBookingBaseUrl,
  // Unused by this test but transitively required by ./agent/tools.ts
  readSheetRows: vi.fn(),
  writeSheetTags: vi.fn(),
  syncCandidatesToNotion: vi.fn(),
  getSheetsConfig: vi.fn(),
  PENDING_INVITATION_STATUS: "已篩選待邀請",
  INVITED_STATUS: "已邀請",
}));

import { dispatchInvites } from "./index";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockQueryCandidatesByStatus.mockReset();
  mockUpdateCandidateStatus.mockReset();
  mockEnsureGmailAuthorized.mockReset();
  mockSendEmail.mockReset();
});

describe("dispatchInvites", () => {
  it("reports nothing to send and never authorizes Gmail when no candidates are pending", async () => {
    mockQueryCandidatesByStatus.mockResolvedValue([]);

    const result = await dispatchInvites();

    expect(result).toEqual({ sent: 0, failed: [] });
    expect(mockEnsureGmailAuthorized).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends an invite containing the candidate's booking link and marks them invited", async () => {
    mockQueryCandidatesByStatus.mockResolvedValue([
      { pageId: "page-1", name: "Alice", email: "alice@example.com", status: "已篩選待邀請" },
    ]);
    mockSendEmail.mockResolvedValue(undefined);
    mockUpdateCandidateStatus.mockResolvedValue(undefined);

    const result = await dispatchInvites();

    expect(mockEnsureGmailAuthorized).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        body: expect.stringContaining("https://booking.example.com/book/page-1"),
      }),
    );
    expect(mockUpdateCandidateStatus).toHaveBeenCalledWith("page-1", "已邀請");
    expect(result).toEqual({ sent: 1, failed: [] });
  });

  it("leaves status unchanged and records the failure when sending fails", async () => {
    mockQueryCandidatesByStatus.mockResolvedValue([
      { pageId: "page-1", name: "Alice", email: "alice@example.com", status: "已篩選待邀請" },
    ]);
    mockSendEmail.mockRejectedValue(new Error("smtp down"));

    const result = await dispatchInvites();

    expect(mockUpdateCandidateStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      sent: 0,
      failed: [{ name: "Alice", email: "alice@example.com", error: "smtp down" }],
    });
  });

  it("isolates one candidate's failure so the rest still get invited", async () => {
    mockQueryCandidatesByStatus.mockResolvedValue([
      { pageId: "page-1", name: "Alice", email: "alice@example.com", status: "已篩選待邀請" },
      { pageId: "page-2", name: "Bob", email: "bob@example.com", status: "已篩選待邀請" },
    ]);
    mockSendEmail
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(undefined);
    mockUpdateCandidateStatus.mockResolvedValue(undefined);

    const result = await dispatchInvites();

    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([
      { name: "Alice", email: "alice@example.com", error: "smtp down" },
    ]);
    expect(mockUpdateCandidateStatus).toHaveBeenCalledWith("page-2", "已邀請");
  });
});
