import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFreebusyQuery, mockEventsInsert, mockGetClient, MockGoogleAuth } = vi.hoisted(() => {
  const getClient = vi.fn().mockResolvedValue({});
  class GoogleAuthStub {
    getClient = getClient;
  }
  return {
    mockFreebusyQuery: vi.fn(),
    mockEventsInsert: vi.fn(),
    mockGetClient: getClient,
    MockGoogleAuth: GoogleAuthStub,
  };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: MockGoogleAuth,
    },
    calendar: vi.fn().mockReturnValue({
      freebusy: { query: mockFreebusyQuery },
      events: { insert: mockEventsInsert },
    }),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(
      JSON.stringify({ client_email: "test-service-account@example.iam.gserviceaccount.com" }),
    ),
  };
});

import { queryFreeBusy, createCalendarEvent, CalendarAccessDeniedError } from "./googleCalendar";
import type { CalendarConfig } from "./config";

const testConfig: CalendarConfig = {
  serviceAccountKeyPath: "/fake/key.json",
  calendarId: "interviewer@example.com",
};

beforeEach(() => {
  mockFreebusyQuery.mockReset();
  mockEventsInsert.mockReset();
});

describe("queryFreeBusy", () => {
  it("returns the busy periods reported for the configured calendar", async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          "interviewer@example.com": {
            busy: [{ start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" }],
          },
        },
      },
    });

    const busy = await queryFreeBusy(
      "2026-07-13T00:00:00+08:00",
      "2026-07-27T00:00:00+08:00",
      testConfig,
    );

    expect(busy).toEqual([
      { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
    ]);
  });

  it("throws CalendarAccessDeniedError when the calendar is not shared with the service account", async () => {
    mockFreebusyQuery.mockRejectedValue({ code: 403 });

    await expect(
      queryFreeBusy("2026-07-13T00:00:00+08:00", "2026-07-27T00:00:00+08:00", testConfig),
    ).rejects.toBeInstanceOf(CalendarAccessDeniedError);
    await expect(
      queryFreeBusy("2026-07-13T00:00:00+08:00", "2026-07-27T00:00:00+08:00", testConfig),
    ).rejects.toThrow(/test-service-account@example.iam.gserviceaccount.com/);
  });

  it("throws CalendarAccessDeniedError when the API reports a per-calendar error instead of a busy list", async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          "interviewer@example.com": {
            errors: [{ domain: "global", reason: "notFound" }],
          },
        },
      },
    });

    await expect(
      queryFreeBusy("2026-07-13T00:00:00+08:00", "2026-07-27T00:00:00+08:00", testConfig),
    ).rejects.toBeInstanceOf(CalendarAccessDeniedError);
  });
});

describe("createCalendarEvent", () => {
  it("creates an event spanning the given slot with the candidate as an attendee", async () => {
    mockEventsInsert.mockResolvedValue({ data: { id: "event-123" } });

    const result = await createCalendarEvent(
      {
        start: "2026-07-13T14:00:00+08:00",
        end: "2026-07-13T15:00:00+08:00",
        attendeeEmail: "candidate@example.com",
      },
      testConfig,
    );

    expect(result).toEqual({ eventId: "event-123" });
    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "interviewer@example.com",
        requestBody: expect.objectContaining({
          start: { dateTime: "2026-07-13T14:00:00+08:00" },
          end: { dateTime: "2026-07-13T15:00:00+08:00" },
          attendees: [{ email: "candidate@example.com" }],
        }),
      }),
    );
  });
});
