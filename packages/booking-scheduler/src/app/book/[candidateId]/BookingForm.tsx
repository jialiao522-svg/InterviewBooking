"use client";

import { useState } from "react";
import type { Slot } from "@/lib/slotAvailability";

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [needsRemote, setNeedsRemote] = useState(false);
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedIndex === null) {
      return;
    }
    const slot = slots[selectedIndex];
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
          setSelectedIndex(null);
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
      <p>
        預約成功！時間：{formatSlotLabel({ start: state.start, end: state.end })}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {state.status === "conflict" && <p role="alert">{state.message}</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}

      <fieldset>
        <legend>選擇訪談時段</legend>
        {slots.map((slot, index) => (
          <label key={slot.start} style={{ display: "block" }}>
            <input
              type="radio"
              name="slot"
              checked={selectedIndex === index}
              onChange={() => setSelectedIndex(index)}
            />
            {formatSlotLabel(slot)}
          </label>
        ))}
      </fieldset>

      <label>
        <input
          type="checkbox"
          checked={needsRemote}
          onChange={(event) => setNeedsRemote(event.target.checked)}
        />
        我需要線上參與
      </label>

      <button type="submit" disabled={selectedIndex === null || state.status === "submitting"}>
        確認預約
      </button>
    </form>
  );
}
