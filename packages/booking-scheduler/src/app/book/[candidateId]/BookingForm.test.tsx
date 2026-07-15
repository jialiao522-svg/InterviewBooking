// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import BookingForm from "./BookingForm";
import type { Slot } from "@/lib/slotAvailability";

const SLOTS: Slot[] = [
  { start: "2026-07-16T10:00:00+08:00", end: "2026-07-16T11:00:00+08:00" },
  { start: "2026-07-16T11:00:00+08:00", end: "2026-07-16T12:00:00+08:00" },
  { start: "2026-07-17T09:00:00+08:00", end: "2026-07-17T10:00:00+08:00" },
];

function clickDay(isoDate: string) {
  const button = document.querySelector(`[data-day="${isoDate}"] button`);
  expect(button).not.toBeNull();
  fireEvent.click(button as HTMLButtonElement);
}

function selectSlot(candidateId: string, isoDate: string, timeLabel: string) {
  clickDay(isoDate);
  fireEvent.click(screen.getByRole("button", { name: timeLabel }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("BookingForm", () => {
  it("keeps the confirm button disabled until a slot is selected", () => {
    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);

    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", true);
  });

  it("enables the confirm button after selecting a date and a slot", () => {
    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);

    selectSlot("page-1", "2026-07-16", "10:00");

    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", false);
  });

  it("disables the confirm button again after switching to a different date", () => {
    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);

    selectSlot("page-1", "2026-07-16", "10:00");
    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", false);

    clickDay("2026-07-17");

    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", true);
  });

  it("submits the selected slot's start/end and shows the booked confirmation on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ start: "2026-07-16T10:00:00+08:00", end: "2026-07-16T11:00:00+08:00" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);
    selectSlot("page-1", "2026-07-16", "10:00");
    fireEvent.click(screen.getByRole("button", { name: "確認預約" }));

    await waitFor(() => expect(screen.getByText(/預約成功/)).toBeTruthy());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/book/page-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          slotStart: "2026-07-16T10:00:00+08:00",
          slotEnd: "2026-07-16T11:00:00+08:00",
          needsRemote: false,
        }),
      }),
    );
  });

  it("includes needsRemote=true in the submission when the checkbox is checked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ start: "2026-07-16T10:00:00+08:00", end: "2026-07-16T11:00:00+08:00" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);
    selectSlot("page-1", "2026-07-16", "10:00");
    fireEvent.click(screen.getByRole("checkbox", { name: "我需要線上參與" }));
    fireEvent.click(screen.getByRole("button", { name: "確認預約" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/book/page-1",
      expect.objectContaining({
        body: JSON.stringify({
          slotStart: "2026-07-16T10:00:00+08:00",
          slotEnd: "2026-07-16T11:00:00+08:00",
          needsRemote: true,
        }),
      }),
    );
  });

  it("updates available slots, clears the selection, and shows a conflict message on a slot_taken 409", async () => {
    const remainingSlots: Slot[] = [
      { start: "2026-07-17T09:00:00+08:00", end: "2026-07-17T10:00:00+08:00" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "slot_taken", availableSlots: remainingSlots }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);
    selectSlot("page-1", "2026-07-16", "10:00");
    fireEvent.click(screen.getByRole("button", { name: "確認預約" }));

    await waitFor(() =>
      expect(screen.getByText("這個時段剛被別人訂走了，請重新選擇。")).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", true);

    // 7/16 10:00 was the taken slot and is no longer in the updated availability
    expect(screen.queryByRole("button", { name: "10:00" })).toBeNull();
  });

  it("shows a conflict message without updating slots when the candidate already booked (409)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ reason: "already_booked" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);
    selectSlot("page-1", "2026-07-16", "10:00");
    fireEvent.click(screen.getByRole("button", { name: "確認預約" }));

    await waitFor(() => expect(screen.getByText("這個候選人已經完成預約。")).toBeTruthy());
  });

  it("shows a contact-recruiter message and keeps the confirm button disabled when no dates have any slot", () => {
    render(<BookingForm candidateId="page-1" initialSlots={[]} />);

    expect(screen.getByText("近期沒有可預約時段，請聯絡招募人員")).toBeTruthy();
    expect(screen.getByRole("button", { name: "確認預約" })).toHaveProperty("disabled", true);
  });

  it("shows a generic error message when the request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingForm candidateId="page-1" initialSlots={SLOTS} />);
    selectSlot("page-1", "2026-07-16", "10:00");
    fireEvent.click(screen.getByRole("button", { name: "確認預約" }));

    await waitFor(() =>
      expect(screen.getByText("預約時發生錯誤，請稍後再試。")).toBeTruthy(),
    );
  });
});
