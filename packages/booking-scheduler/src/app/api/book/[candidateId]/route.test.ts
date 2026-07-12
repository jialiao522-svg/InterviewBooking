import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCandidateById, mockIsSlotStillAvailable, mockGetAvailableSlots, mockFinalizeCandidateBooking } =
  vi.hoisted(() => ({
    mockGetCandidateById: vi.fn(),
    mockIsSlotStillAvailable: vi.fn(),
    mockGetAvailableSlots: vi.fn(),
    mockFinalizeCandidateBooking: vi.fn(),
  }));

vi.mock("@interview-platform/shared-integrations", () => ({
  getCandidateById: mockGetCandidateById,
  BOOKED_STATUS: "已預約",
}));

vi.mock("@/lib/slotAvailability", () => ({
  isSlotStillAvailable: mockIsSlotStillAvailable,
  getAvailableSlots: mockGetAvailableSlots,
}));

vi.mock("@/lib/bookingConfirmation", () => ({
  finalizeCandidateBooking: mockFinalizeCandidateBooking,
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/book/page-1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const candidate = {
  pageId: "page-1",
  name: "Alice",
  email: "alice@example.com",
  status: "已邀請",
  bookedTime: null,
  needsRemote: false,
};

beforeEach(() => {
  mockGetCandidateById.mockReset();
  mockIsSlotStillAvailable.mockReset();
  mockGetAvailableSlots.mockReset();
  mockFinalizeCandidateBooking.mockReset();
});

describe("POST /api/book/[candidateId]", () => {
  it("returns 404 when the candidateId has no matching Notion page", async () => {
    mockGetCandidateById.mockResolvedValue(null);

    const response = await POST(makeRequest({ slotStart: "a", slotEnd: "b" }), {
      params: Promise.resolve({ candidateId: "unknown" }),
    });

    expect(response.status).toBe(404);
    expect(mockIsSlotStillAvailable).not.toHaveBeenCalled();
  });

  it("returns a conflict when the candidate has already booked", async () => {
    mockGetCandidateById.mockResolvedValue({
      ...candidate,
      status: "已預約",
      bookedTime: { start: "2026-07-13T10:00:00+08:00", end: "2026-07-13T11:00:00+08:00" },
    });

    const response = await POST(
      makeRequest({ slotStart: "2026-07-13T14:00:00+08:00", slotEnd: "2026-07-13T15:00:00+08:00" }),
      { params: Promise.resolve({ candidateId: "page-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mockFinalizeCandidateBooking).not.toHaveBeenCalled();
  });

  it("rejects the submission and returns refreshed slots when the requested slot has just been taken", async () => {
    mockGetCandidateById.mockResolvedValue(candidate);
    mockIsSlotStillAvailable.mockResolvedValue(false);
    mockGetAvailableSlots.mockResolvedValue([
      { start: "2026-07-13T15:00:00+08:00", end: "2026-07-13T16:00:00+08:00" },
    ]);

    const response = await POST(
      makeRequest({ slotStart: "2026-07-13T14:00:00+08:00", slotEnd: "2026-07-13T15:00:00+08:00" }),
      { params: Promise.resolve({ candidateId: "page-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.availableSlots).toEqual([
      { start: "2026-07-13T15:00:00+08:00", end: "2026-07-13T16:00:00+08:00" },
    ]);
    expect(mockFinalizeCandidateBooking).not.toHaveBeenCalled();
  });

  it("finalizes the booking when the slot is still free (candidate A wins the race)", async () => {
    mockGetCandidateById.mockResolvedValue(candidate);
    mockIsSlotStillAvailable.mockResolvedValue(true);
    mockFinalizeCandidateBooking.mockResolvedValue({ eventId: "event-1", emailSent: true });

    const response = await POST(
      makeRequest({ slotStart: "2026-07-13T14:00:00+08:00", slotEnd: "2026-07-13T15:00:00+08:00" }),
      { params: Promise.resolve({ candidateId: "page-1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.booked).toBe(true);
    expect(mockFinalizeCandidateBooking).toHaveBeenCalledWith(
      expect.objectContaining({ candidatePageId: "page-1", slotStart: "2026-07-13T14:00:00+08:00" }),
    );
  });
});
