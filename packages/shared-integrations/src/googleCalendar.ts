import * as fs from "fs";
import { google, calendar_v3 } from "googleapis";
import { getCalendarConfig, CalendarConfig, getGmailOAuthConfig, GmailOAuthConfig } from "./config";
import { getAuthorizedOAuthClient } from "./googleOAuth";

export interface BusyPeriod {
  start: string;
  end: string;
}

export interface CreateEventInput {
  start: string;
  end: string;
  attendeeEmail: string;
}

export class CalendarAccessDeniedError extends Error {
  constructor(public readonly serviceAccountEmail: string, calendarId: string) {
    super(
      `Google Calendar ${calendarId} is not shared with the service account. ` +
        `Share the calendar with ${serviceAccountEmail} ("Make changes to events") and try again.`,
    );
    this.name = "CalendarAccessDeniedError";
  }
}

function isPermissionDenied(error: unknown): boolean {
  const status = (error as { code?: number; response?: { status?: number } })
    ?.code ?? (error as { response?: { status?: number } })?.response?.status;
  return status === 403 || status === 404;
}

async function getServiceAccountEmail(keyPath: string): Promise<string> {
  const keyFile = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return keyFile.client_email as string;
}

export async function getCalendarClient(
  config: CalendarConfig = getCalendarConfig(),
): Promise<calendar_v3.Calendar> {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.serviceAccountKeyPath,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const client = await auth.getClient();
  return google.calendar({ version: "v3", auth: client as never });
}

export async function queryFreeBusy(
  timeMin: string,
  timeMax: string,
  config: CalendarConfig = getCalendarConfig(),
): Promise<BusyPeriod[]> {
  const client = await getCalendarClient(config);

  let response;
  try {
    response = await client.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: config.calendarId }],
      },
    });
  } catch (error) {
    if (isPermissionDenied(error)) {
      const email = await getServiceAccountEmail(config.serviceAccountKeyPath);
      throw new CalendarAccessDeniedError(email, config.calendarId);
    }
    throw error;
  }

  const calendarBusy = response.data.calendars?.[config.calendarId];
  if (calendarBusy?.errors && calendarBusy.errors.length > 0) {
    const email = await getServiceAccountEmail(config.serviceAccountKeyPath);
    throw new CalendarAccessDeniedError(email, config.calendarId);
  }

  return (calendarBusy?.busy ?? []).map((period) => ({
    start: period.start as string,
    end: period.end as string,
  }));
}

/**
 * Creates the event as the real Google account behind the Gmail OAuth
 * credentials, not the Calendar service account: Google rejects attendee
 * invites from a bare service account without Workspace Domain-Wide
 * Delegation, which a personal (non-Workspace) Google account can never
 * grant.
 */
export async function createCalendarEvent(
  input: CreateEventInput,
  config: CalendarConfig = getCalendarConfig(),
  oauthConfig: GmailOAuthConfig = getGmailOAuthConfig(),
): Promise<{ eventId: string }> {
  const auth = await getAuthorizedOAuthClient(oauthConfig);
  const client = google.calendar({ version: "v3", auth });

  const event = await client.events.insert({
    calendarId: config.calendarId,
    sendUpdates: "all",
    requestBody: {
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: [{ email: input.attendeeEmail }],
    },
  });

  return { eventId: event.data.id as string };
}
