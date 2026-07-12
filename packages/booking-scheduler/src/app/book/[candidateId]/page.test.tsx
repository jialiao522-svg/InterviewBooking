import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCandidateById, mockGetAvailableSlots, mockNotFound } = vi.hoisted(() => ({
  mockGetCandidateById: vi.fn(),
  mockGetAvailableSlots: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@interview-platform/shared-integrations", () => ({
  getCandidateById: mockGetCandidateById,
  BOOKED_STATUS: "已預約",
}));

vi.mock("@/lib/slotAvailability", () => ({
  getAvailableSlots: mockGetAvailableSlots,
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("./BookingForm", () => ({
  default: () => null,
}));

import BookingPage from "./page";

beforeEach(() => {
  mockGetCandidateById.mockReset();
  mockGetAvailableSlots.mockReset();
  mockNotFound.mockClear();
});

describe("BookingPage", () => {
  it("calls notFound and never reads calendar availability when the candidateId has no matching Notion page", async () => {
    mockGetCandidateById.mockResolvedValue(null);

    await expect(
      BookingPage({ params: Promise.resolve({ candidateId: "unknown" }) }),
    ).rejects.toThrow();

    expect(mockNotFound).toHaveBeenCalled();
    expect(mockGetAvailableSlots).not.toHaveBeenCalled();
  });

  it("does not read calendar availability for an already-booked candidate (read-only path)", async () => {
    mockGetCandidateById.mockResolvedValue({
      pageId: "page-1",
      name: "Alice",
      email: "alice@example.com",
      status: "已預約",
      bookedTime: { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
      needsRemote: false,
    });

    const element = await BookingPage({ params: Promise.resolve({ candidateId: "page-1" }) });

    expect(mockGetAvailableSlots).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });

  it("reads calendar availability and renders the booking form for a candidate who has not booked yet", async () => {
    mockGetCandidateById.mockResolvedValue({
      pageId: "page-1",
      name: "Alice",
      email: "alice@example.com",
      status: "已邀請",
      bookedTime: null,
      needsRemote: false,
    });
    mockGetAvailableSlots.mockResolvedValue([
      { start: "2026-07-13T10:00:00+08:00", end: "2026-07-13T11:00:00+08:00" },
    ]);

    await BookingPage({ params: Promise.resolve({ candidateId: "page-1" }) });

    expect(mockGetAvailableSlots).toHaveBeenCalledTimes(1);
  });
});
