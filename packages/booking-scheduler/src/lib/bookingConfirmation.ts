import * as fs from "fs";
import * as path from "path";
import {
  createCalendarEvent,
  finalizeBooking,
  sendEmail,
} from "@interview-platform/shared-integrations";

const TEMPLATES_DIR = path.join(process.cwd(), "templates");

function renderTemplate(templateName: string, tokens: Record<string, string>): string {
  let content = fs.readFileSync(path.join(TEMPLATES_DIR, templateName), "utf-8");
  for (const [key, value] of Object.entries(tokens)) {
    content = content.split(`{{${key}}}`).join(value);
  }
  return content;
}

function formatSlotForDisplay(iso: string): string {
  return iso.replace("T", " ").replace(/\+08:00$/, "");
}

function buildConfirmationEmailBody(input: {
  candidateName: string;
  slotStart: string;
  slotEnd: string;
  needsRemote: boolean;
}): string {
  const remoteNote = input.needsRemote ? renderTemplate("remote-note.txt", {}) : "";
  return renderTemplate("confirmation-email.txt", {
    candidateName: input.candidateName,
    slotStart: formatSlotForDisplay(input.slotStart),
    slotEnd: formatSlotForDisplay(input.slotEnd),
    remoteNote,
  });
}

export interface FinalizeBookingInput {
  candidatePageId: string;
  candidateName: string;
  candidateEmail: string;
  slotStart: string;
  slotEnd: string;
  needsRemote: boolean;
}

export interface FinalizeBookingResult {
  eventId: string;
  emailSent: boolean;
  emailError?: string;
}

/**
 * Creates the Calendar event and updates Notion first, then attempts the
 * confirmation email as a best-effort last step. A failed email is recorded
 * (logged) but never rolls back the already-finalized booking — the native
 * Calendar invite sent to the candidate as an attendee is the fallback
 * notification channel.
 */
export async function finalizeCandidateBooking(
  input: FinalizeBookingInput,
): Promise<FinalizeBookingResult> {
  const { eventId } = await createCalendarEvent({
    start: input.slotStart,
    end: input.slotEnd,
    attendeeEmail: input.candidateEmail,
  });

  await finalizeBooking(input.candidatePageId, {
    start: input.slotStart,
    end: input.slotEnd,
    calendarEventId: eventId,
    needsRemote: input.needsRemote,
  });

  try {
    await sendEmail({
      to: input.candidateEmail,
      subject: "訪談時間確認",
      body: buildConfirmationEmailBody(input),
    });
    return { eventId, emailSent: true };
  } catch (error) {
    const emailError = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(
      `確認信寄送失敗（候選人 ${input.candidatePageId}，Calendar 事件與 Notion 狀態維持不變）：${emailError}`,
    );
    return { eventId, emailSent: false, emailError };
  }
}
