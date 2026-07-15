"use client";

import { useState } from "react";
import type { Slot } from "@/lib/slotAvailability";
import BookingCalendar from "./BookingCalendar";

interface BookingFormProps {
  candidateId: string;
  initialSlots: Slot[];
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "booked"; start: string; end: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

function formatSlotLabel(slot: Slot): string {
  return `${slot.start.replace("T", " ").replace(/\+08:00$/, "")} - ${slot.end
    .replace("T", " ")
    .replace(/\+08:00$/, "")
    .split(" ")
    .pop()}`;
}

export default function BookingForm({ candidateId, initialSlots }: BookingFormProps) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [needsRemote, setNeedsRemote] = useState(false);
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedSlot === null) {
      return;
    }
    const slot = selectedSlot;
    setState({ status: "submitting" });

    try {
      const response = await fetch(`/api/book/${candidateId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: slot.start, slotEnd: slot.end, needsRemote }),
      });

      if (response.ok) {
        const data = await response.json();
        setState({ status: "booked", start: data.start, end: data.end });
        return;
      }

      if (response.status === 409) {
        const data = await response.json();
        if (data.reason === "slot_taken") {
          setSlots(data.availableSlots ?? []);
          setSelectedSlot(null);
          setState({ status: "conflict", message: "這個時段剛被別人訂走了，請重新選擇。" });
          return;
        }
        setState({ status: "conflict", message: "這個候選人已經完成預約。" });
        return;
      }

      setState({ status: "error", message: "預約時發生錯誤，請稍後再試。" });
    } catch {
      setState({ status: "error", message: "預約時發生錯誤，請稍後再試。" });
    }
  }

  if (state.status === "booked") {
    return (
      <div className="rounded-card border border-foreground/10 p-6 shadow-card">
        <p className="text-base font-medium text-foreground">
          預約成功！時間：{formatSlotLabel({ start: state.start, end: state.end })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {state.status === "conflict" && (
        <p role="alert" className="rounded-card border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="rounded-card border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-brand">
          {state.message}
        </p>
      )}

      <BookingCalendar slots={slots} selectedSlot={selectedSlot} onSelectSlot={setSelectedSlot} />

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={needsRemote}
          onChange={(event) => setNeedsRemote(event.target.checked)}
          className="h-4 w-4 accent-brand"
        />
        我需要線上參與
      </label>

      <button
        type="submit"
        disabled={selectedSlot === null || state.status === "submitting"}
        className="w-full rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-foreground/20"
      >
        確認預約
      </button>
    </form>
  );
}
