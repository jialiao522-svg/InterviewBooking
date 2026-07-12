import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateCalendarEvent, mockFinalizeBooking, mockSendEmail } = vi.hoisted(() => ({
  mockCreateCalendarEvent: vi.fn(),
  mockFinalizeBooking: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock("@interview-platform/shared-integrations", () => ({
  createCalendarEvent: mockCreateCalendarEvent,
  finalizeBooking: mockFinalizeBooking,
  sendEmail: mockSendEmail,
}));

import { finalizeCandidateBooking } from "./bookingConfirmation";

const baseInput = {
  candidatePageId: "page-1",
  candidateName: "Alice",
  candidateEmail: "alice@example.com",
  slotStart: "2026-07-13T14:00:00+08:00",
  slotEnd: "2026-07-13T15:00:00+08:00",
  needsRemote: false,
};

beforeEach(() => {
  mockCreateCalendarEvent.mockReset();
  mockFinalizeBooking.mockReset();
  mockSendEmail.mockReset();
});

describe("finalizeCandidateBooking", () => {
  it("creates a Calendar event with the candidate as attendee", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ eventId: "event-123" });
    mockFinalizeBooking.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);

    await finalizeCandidateBooking(baseInput);

    expect(mockCreateCalendarEvent).toHaveBeenCalledWith({
      start: baseInput.slotStart,
      end: baseInput.slotEnd,
      attendeeEmail: baseInput.candidateEmail,
    });
  });

  it("updates Notion status and booked time with the created event id", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ eventId: "event-123" });
    mockFinalizeBooking.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);

    await finalizeCandidateBooking(baseInput);

    expect(mockFinalizeBooking).toHaveBeenCalledWith("page-1", {
      start: baseInput.slotStart,
      end: baseInput.slotEnd,
      calendarEventId: "event-123",
      needsRemote: false,
    });
  });

  it("sends a standard confirmation email without the remote note when remote is not needed", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ eventId: "event-123" });
    mockFinalizeBooking.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);

    await finalizeCandidateBooking(baseInput);

    const sentBody = mockSendEmail.mock.calls[0][0].body as string;
    expect(sentBody).toContain("Alice");
    expect(sentBody).not.toContain("線上參與需求");
  });

  it("adds the remote-arrangement note when the candidate has indicated a remote need", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ eventId: "event-123" });
    mockFinalizeBooking.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(undefined);

    await finalizeCandidateBooking({ ...baseInput, needsRemote: true });

    const sentBody = mockSendEmail.mock.calls[0][0].body as string;
    expect(sentBody).toContain("線上參與需求");
  });

  it("does not roll back the Calendar event or Notion update when the email send fails", async () => {
    mockCreateCalendarEvent.mockResolvedValue({ eventId: "event-123" });
    mockFinalizeBooking.mockResolvedValue(undefined);
    mockSendEmail.mockRejectedValue(new Error("smtp down"));

    const result = await finalizeCandidateBooking(baseInput);

    expect(result).toEqual({ eventId: "event-123", emailSent: false, emailError: "smtp down" });
    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockFinalizeBooking).toHaveBeenCalledTimes(1);
  });
});
