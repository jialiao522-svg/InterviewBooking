// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import BookingCalendar, { groupSlotsByDate } from "./BookingCalendar";
import type { Slot } from "@/lib/slotAvailability";

afterEach(() => {
  cleanup();
});

const JUL_16: Slot[] = [
  { start: "2026-07-16T10:00:00+08:00", end: "2026-07-16T11:00:00+08:00" },
  { start: "2026-07-16T14:00:00+08:00", end: "2026-07-16T15:00:00+08:00" },
  { start: "2026-07-16T16:00:00+08:00", end: "2026-07-16T17:00:00+08:00" },
];

const JUL_18: Slot[] = [
  { start: "2026-07-18T10:00:00+08:00", end: "2026-07-18T11:00:00+08:00" },
  { start: "2026-07-18T11:00:00+08:00", end: "2026-07-18T12:00:00+08:00" },
  { start: "2026-07-18T13:00:00+08:00", end: "2026-07-18T14:00:00+08:00" },
  { start: "2026-07-18T15:00:00+08:00", end: "2026-07-18T16:00:00+08:00" },
  { start: "2026-07-18T18:00:00+08:00", end: "2026-07-18T19:00:00+08:00" },
];

const MIXED_AVAILABILITY: Slot[] = [...JUL_16, ...JUL_18];

function clickDay(container: HTMLElement, isoDate: string) {
  const button = container.querySelector(`[data-day="${isoDate}"] button`);
  expect(button).not.toBeNull();
  fireEvent.click(button as HTMLButtonElement);
}

describe("groupSlotsByDate", () => {
  it("groups slots by their Asia/Taipei date, sorted earliest-first within each date", () => {
    const shuffled = [JUL_18[2], JUL_16[1], JUL_18[0], JUL_16[0], JUL_18[4]];
    const groups = groupSlotsByDate(shuffled);

    expect(Array.from(groups.keys()).sort()).toEqual(["2026-07-16", "2026-07-18"]);
    expect(groups.get("2026-07-16")).toEqual([JUL_16[0], JUL_16[1]]);
    expect(groups.get("2026-07-18")).toEqual([JUL_18[0], JUL_18[2], JUL_18[4]]);
  });
});

describe("BookingCalendar", () => {
  it("renders 7/17 as not selectable when it has zero available slots", () => {
    const { container } = render(
      <BookingCalendar slots={MIXED_AVAILABILITY} selectedSlot={null} onSelectSlot={vi.fn()} />,
    );

    const day17Button = container.querySelector('[data-day="2026-07-17"] button');
    expect(day17Button).toHaveProperty("disabled", true);
  });

  it("shows no time-slot options before any date is selected", () => {
    render(<BookingCalendar slots={MIXED_AVAILABILITY} selectedSlot={null} onSelectSlot={vi.fn()} />);

    expect(screen.queryByRole("group", { name: "可選時段" })).toBeNull();
  });

  it("selecting 7/18 reveals exactly its five slots ordered earliest to latest, and none from 7/16", () => {
    const { container } = render(
      <BookingCalendar slots={MIXED_AVAILABILITY} selectedSlot={null} onSelectSlot={vi.fn()} />,
    );

    clickDay(container, "2026-07-18");

    const group = screen.getByRole("group", { name: "可選時段" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "10:00",
      "11:00",
      "13:00",
      "15:00",
      "18:00",
    ]);
  });

  it("clears the previously selected slot when a different date is selected", () => {
    const onSelectSlot = vi.fn();
    const { container, rerender } = render(
      <BookingCalendar slots={MIXED_AVAILABILITY} selectedSlot={null} onSelectSlot={onSelectSlot} />,
    );

    clickDay(container, "2026-07-16");
    rerender(
      <BookingCalendar slots={MIXED_AVAILABILITY} selectedSlot={JUL_16[0]} onSelectSlot={onSelectSlot} />,
    );

    onSelectSlot.mockClear();
    clickDay(container, "2026-07-18");

    expect(onSelectSlot).toHaveBeenCalledWith(null);
  });

  it("shows a contact-recruiter message and disables the entire calendar when no date has any slot", () => {
    const { container } = render(<BookingCalendar slots={[]} selectedSlot={null} onSelectSlot={vi.fn()} />);

    expect(screen.getByText("近期沒有可預約時段，請聯絡招募人員")).toBeTruthy();
    const dayButtons = container.querySelectorAll("[data-day] button");
    expect(dayButtons.length).toBeGreaterThan(0);
    dayButtons.forEach((button) => {
      expect(button).toHaveProperty("disabled", true);
    });
  });

  it("displays every calendar month spanned by the 14-day availability window without requiring pagination", () => {
    const slotsAcrossTwoMonths: Slot[] = [
      { start: "2026-07-30T10:00:00+08:00", end: "2026-07-30T11:00:00+08:00" },
      { start: "2026-08-02T10:00:00+08:00", end: "2026-08-02T11:00:00+08:00" },
    ];

    render(<BookingCalendar slots={slotsAcrossTwoMonths} selectedSlot={null} onSelectSlot={vi.fn()} />);

    const captions = screen.getAllByRole("status").map((status) => status.textContent);
    expect(captions).toEqual(["July 2026", "August 2026"]);
  });

  it("shows a single month when every available date falls within one calendar month", () => {
    render(<BookingCalendar slots={JUL_16} selectedSlot={null} onSelectSlot={vi.fn()} />);

    const captions = screen.getAllByRole("status").map((status) => status.textContent);
    expect(captions).toEqual(["July 2026"]);
  });
});
