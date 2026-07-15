import { notFound } from "next/navigation";
import { getCandidateById, BOOKED_STATUS } from "@interview-platform/shared-integrations";
import { getAvailableSlots } from "@/lib/slotAvailability";
import BookingForm from "./BookingForm";

interface PageProps {
  params: Promise<{ candidateId: string }>;
}

function formatSlotLabel(start: string, end: string): string {
  const startLabel = start.replace("T", " ").replace(/\+08:00$/, "");
  const endTime = end.replace(/\+08:00$/, "").split("T").pop();
  return `${startLabel} - ${endTime}`;
}

export default async function BookingPage({ params }: PageProps) {
  const { candidateId } = await params;
  const candidate = await getCandidateById(candidateId);

  if (!candidate) {
    notFound();
  }

  if (candidate.status === BOOKED_STATUS && candidate.bookedTime) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold text-foreground">{candidate.name} 您好</h1>
        <div className="rounded-card border border-foreground/10 p-6 shadow-card">
          <p className="text-base text-foreground">
            您已完成預約，訪談時間為：
            {formatSlotLabel(candidate.bookedTime.start, candidate.bookedTime.end)}
          </p>
        </div>
      </main>
    );
  }

  let slots;
  try {
    slots = await getAvailableSlots();
  } catch (error) {
    if (error instanceof Error && error.name === "CalendarAccessDeniedError") {
      return (
        <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
          <h1 className="text-2xl font-semibold text-foreground">暫時無法讀取可預約時段</h1>
          <p className="text-sm text-foreground/70">行事曆存取設定尚未完成，請聯絡招募人員協助處理。</p>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">{candidate.name} 您好，請選擇訪談時段</h1>
      <BookingForm candidateId={candidateId} initialSlots={slots} />
    </main>
  );
}
