"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import type { Slot } from "@/lib/slotAvailability";

export interface BookingCalendarProps {
  slots: Slot[];
  selectedSlot: Slot | null;
  onSelectSlot: (slot: Slot | null) => void;
}

function dateKey(isoString: string): string {
  return isoString.slice(0, 10);
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyFromDate(date: Date): string {
  return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Groups slots by their Asia/Taipei wall-clock date (the first 10 chars of the ISO `start`), each day's slots sorted earliest-first. */
export function groupSlotsByDate(slots: Slot[]): Map<string, Slot[]> {
  const groups = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dateKey(slot.start);
    const existing = groups.get(key);
    if (existing) {
      existing.push(slot);
    } else {
      groups.set(key, [slot]);
    }
  }
  for (const daySlots of groups.values()) {
    daySlots.sort((a, b) => a.start.localeCompare(b.start));
  }
  return groups;
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Number of distinct calendar months (`YYYY-MM`) represented across the given date keys. */
function monthsSpanned(dateKeys: string[]): number {
  const monthSet = new Set(dateKeys.map((key) => key.slice(0, 7)));
  return monthSet.size;
}

function formatTimeLabel(isoString: string): string {
  return isoString.slice(11, 16);
}

const dayPickerClassNames = {
  months: "flex flex-wrap gap-8",
  month: "space-y-3",
  month_caption: "flex justify-center py-1",
  caption_label: "text-sm font-semibold text-foreground",
  nav: "flex items-center justify-between",
  button_previous:
    "h-8 w-8 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors disabled:opacity-30",
  button_next:
    "h-8 w-8 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors disabled:opacity-30",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "w-10 h-8 flex items-center justify-center text-xs font-medium text-foreground/50",
  weeks: "space-y-1",
  week: "flex",
  day: "w-10 h-10 p-0 text-center align-middle data-today:font-semibold data-selected:[&>button]:bg-brand data-selected:[&>button]:text-white data-selected:[&>button]:hover:bg-brand-hover",
  day_button:
    "w-10 h-10 rounded-full text-sm font-medium text-foreground transition-colors hover:bg-brand/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent aria-disabled:opacity-30 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent",
};

export default function BookingCalendar({ slots, selectedSlot, onSelectSlot }: BookingCalendarProps) {
  const groups = groupSlotsByDate(slots);
  const dateKeys = Array.from(groups.keys());
  const selectableDates = new Set(dateKeys);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  function handleDateSelect(date: Date | undefined) {
    setSelectedDate(date);
    onSelectSlot(null);
  }

  if (dateKeys.length === 0) {
    return (
      <div className="rounded-card border border-foreground/10 p-4 shadow-card">
        <DayPicker mode="single" disabled={() => true} classNames={dayPickerClassNames} />
        <p className="mt-3 text-sm text-foreground/70">近期沒有可預約時段，請聯絡招募人員</p>
      </div>
    );
  }

  const sortedKeys = dateKeys.slice().sort();
  const startMonth = parseDateKey(sortedKeys[0]);
  const numberOfMonths = Math.min(2, Math.max(1, monthsSpanned(sortedKeys)));

  const selectedDateKey = selectedDate ? dateKeyFromDate(selectedDate) : null;
  const slotsForSelectedDate = selectedDateKey ? groups.get(selectedDateKey) ?? [] : [];

  return (
    <div className="rounded-card border border-foreground/10 p-4 shadow-card">
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={handleDateSelect}
        disabled={(date) => !selectableDates.has(dateKeyFromDate(date))}
        month={startMonth}
        numberOfMonths={numberOfMonths}
        classNames={dayPickerClassNames}
      />
      {selectedDateKey && (
        <div role="group" aria-label="可選時段" className="mt-4 flex flex-wrap gap-2 border-t border-foreground/10 pt-4">
          {slotsForSelectedDate.map((slot) => (
            <button
              key={slot.start}
              type="button"
              aria-pressed={selectedSlot?.start === slot.start}
              onClick={() => onSelectSlot(slot)}
              className={
                selectedSlot?.start === slot.start
                  ? "rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                  : "rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand hover:text-brand"
              }
            >
              {formatTimeLabel(slot.start)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
