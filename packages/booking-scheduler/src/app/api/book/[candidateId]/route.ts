import { NextRequest, NextResponse } from "next/server";
import { getCandidateById, BOOKED_STATUS } from "@interview-platform/shared-integrations";
import { getAvailableSlots, isSlotStillAvailable } from "@/lib/slotAvailability";
import { finalizeCandidateBooking } from "@/lib/bookingConfirmation";

interface BookingRequestBody {
  slotStart: string;
  slotEnd: string;
  needsRemote?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
): Promise<NextResponse> {
  const { candidateId } = await params;
  const { slotStart, slotEnd, needsRemote }: BookingRequestBody = await request.json();

  const candidate = await getCandidateById(candidateId);
  if (!candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (candidate.status === BOOKED_STATUS) {
    return NextResponse.json(
      { conflict: true, reason: "already_booked", bookedTime: candidate.bookedTime },
      { status: 409 },
    );
  }

  const stillFree = await isSlotStillAvailable(slotStart, slotEnd);
  if (!stillFree) {
    const availableSlots = await getAvailableSlots();
    return NextResponse.json(
      { conflict: true, reason: "slot_taken", availableSlots },
      { status: 409 },
    );
  }

  const result = await finalizeCandidateBooking({
    candidatePageId: candidateId,
    candidateName: candidate.name,
    candidateEmail: candidate.email,
    slotStart,
    slotEnd,
    needsRemote: needsRemote ?? false,
  });

  return NextResponse.json({
    booked: true,
    start: slotStart,
    end: slotEnd,
    eventId: result.eventId,
    emailSent: result.emailSent,
  });
}
