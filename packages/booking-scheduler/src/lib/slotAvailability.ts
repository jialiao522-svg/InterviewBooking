import { queryFreeBusy, BusyPeriod } from "@interview-platform/shared-integrations";

const OFFSET_HOURS = 8;
const OFFSET_STRING = "+08:00";
const GRID_START_HOUR = 10;
const GRID_END_HOUR = 20;
const LOOKAHEAD_DAYS = 14;

export interface Slot {
  start: string;
  end: string;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Interprets `now` (any instant) as a wall-clock date in Asia/Taipei (UTC+8, no DST). */
function taipeiDateParts(now: Date): DateParts {
  const shifted = new Date(now.getTime() + OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function addDays(parts: DateParts, days: number): DateParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function isoAt(parts: DateParts, hour: number): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:00:00${OFFSET_STRING}`;
}

/** The fixed one-hour grid (10:00-20:00) for a single Asia/Taipei calendar day. */
export function generateDailyGrid(dayParts: DateParts): Slot[] {
  const slots: Slot[] = [];
  for (let hour = GRID_START_HOUR; hour < GRID_END_HOUR; hour++) {
    slots.push({ start: isoAt(dayParts, hour), end: isoAt(dayParts, hour + 1) });
  }
  return slots;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function excludeBusyPeriods(slots: Slot[], busy: BusyPeriod[]): Slot[] {
  return slots.filter((slot) => {
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);
    return !busy.some((period) =>
      overlaps(slotStart, slotEnd, new Date(period.start), new Date(period.end)),
    );
  });
}

/** Grid slots for today through 14 days from today (inclusive), busy periods excluded. */
export function computeAvailableSlots(now: Date, busy: BusyPeriod[]): Slot[] {
  const todayParts = taipeiDateParts(now);
  let allSlots: Slot[] = [];
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
    allSlots = allSlots.concat(generateDailyGrid(addDays(todayParts, offset)));
  }
  return excludeBusyPeriods(allSlots, busy);
}

/**
 * Reads live Calendar free/busy data and returns the resulting available
 * slots. Calendar access errors (e.g. CalendarAccessDeniedError) propagate
 * unchanged so callers can distinguish them from generic failures.
 */
export async function getAvailableSlots(now: Date = new Date()): Promise<Slot[]> {
  const todayParts = taipeiDateParts(now);
  const windowEndParts = addDays(todayParts, LOOKAHEAD_DAYS + 1);
  const busy = await queryFreeBusy(isoAt(todayParts, 0), isoAt(windowEndParts, 0));
  return computeAvailableSlots(now, busy);
}

/** Re-checks a single submitted slot against live Calendar data immediately before finalizing a booking. */
export async function isSlotStillAvailable(slotStart: string, slotEnd: string): Promise<boolean> {
  const busy = await queryFreeBusy(slotStart, slotEnd);
  return busy.length === 0;
}
