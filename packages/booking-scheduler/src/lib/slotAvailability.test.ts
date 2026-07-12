import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryFreeBusy } = vi.hoisted(() => ({
  mockQueryFreeBusy: vi.fn(),
}));

vi.mock("@interview-platform/shared-integrations", () => ({
  queryFreeBusy: mockQueryFreeBusy,
}));

import {
  generateDailyGrid,
  excludeBusyPeriods,
  computeAvailableSlots,
  getAvailableSlots,
  isSlotStillAvailable,
} from "./slotAvailability";

class FakeCalendarAccessDeniedError extends Error {
  constructor() {
    super("Google Calendar is not shared with the service account.");
    this.name = "CalendarAccessDeniedError";
  }
}

beforeEach(() => {
  mockQueryFreeBusy.mockReset();
});

describe("generateDailyGrid", () => {
  it("produces ten one-hour slots from 10:00 to 20:00 for an empty calendar day", () => {
    const slots = generateDailyGrid({ year: 2026, month: 7, day: 13 });

    expect(slots).toEqual([
      { start: "2026-07-13T10:00:00+08:00", end: "2026-07-13T11:00:00+08:00" },
      { start: "2026-07-13T11:00:00+08:00", end: "2026-07-13T12:00:00+08:00" },
      { start: "2026-07-13T12:00:00+08:00", end: "2026-07-13T13:00:00+08:00" },
      { start: "2026-07-13T13:00:00+08:00", end: "2026-07-13T14:00:00+08:00" },
      { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
      { start: "2026-07-13T15:00:00+08:00", end: "2026-07-13T16:00:00+08:00" },
      { start: "2026-07-13T16:00:00+08:00", end: "2026-07-13T17:00:00+08:00" },
      { start: "2026-07-13T17:00:00+08:00", end: "2026-07-13T18:00:00+08:00" },
      { start: "2026-07-13T18:00:00+08:00", end: "2026-07-13T19:00:00+08:00" },
      { start: "2026-07-13T19:00:00+08:00", end: "2026-07-13T20:00:00+08:00" },
    ]);
  });
});

describe("excludeBusyPeriods", () => {
  it("removes only the slot overlapping a busy 14:00-15:00 event", () => {
    const slots = generateDailyGrid({ year: 2026, month: 7, day: 13 });

    const available = excludeBusyPeriods(slots, [
      { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
    ]);

    expect(available).toHaveLength(9);
    expect(available).not.toContainEqual(
      expect.objectContaining({ start: "2026-07-13T14:00:00+08:00" }),
    );
  });
});

describe("computeAvailableSlots", () => {
  it("does not include any slot dated 15 or more days from today", () => {
    const now = new Date("2026-07-13T01:00:00+08:00");

    const slots = computeAvailableSlots(now, []);

    const day15 = "2026-07-28";
    expect(slots.some((slot) => slot.start.startsWith(day15))).toBe(false);
    const day14 = "2026-07-27";
    expect(slots.some((slot) => slot.start.startsWith(day14))).toBe(true);
  });
});

describe("getAvailableSlots", () => {
  it("propagates a distinguishable error when the calendar is not shared with the service account", async () => {
    mockQueryFreeBusy.mockRejectedValue(new FakeCalendarAccessDeniedError());

    await expect(getAvailableSlots(new Date("2026-07-13T01:00:00+08:00"))).rejects.toMatchObject({
      name: "CalendarAccessDeniedError",
    });
  });
});

describe("isSlotStillAvailable", () => {
  it("returns true when the requested window has no busy periods", async () => {
    mockQueryFreeBusy.mockResolvedValue([]);

    const stillFree = await isSlotStillAvailable(
      "2026-07-13T14:00:00+08:00",
      "2026-07-13T15:00:00+08:00",
    );

    expect(stillFree).toBe(true);
  });

  it("returns false when another booking has taken the slot in the meantime", async () => {
    mockQueryFreeBusy.mockResolvedValue([
      { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
    ]);

    const stillFree = await isSlotStillAvailable(
      "2026-07-13T14:00:00+08:00",
      "2026-07-13T15:00:00+08:00",
    );

    expect(stillFree).toBe(false);
  });
});
