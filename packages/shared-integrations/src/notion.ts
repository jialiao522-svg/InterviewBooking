import { Client } from "@notionhq/client";
import { getNotionConfig, NotionConfig } from "./config";

export const PENDING_INVITATION_STATUS = "已篩選待邀請";
export const INVITED_STATUS = "已邀請";
export const BOOKED_STATUS = "已預約";

export interface CandidateSyncInput {
  sourceRowIndex: number;
  name: string;
  email: string;
  reason: string;
  answers: Record<string, string>;
}

export interface SyncResult {
  created: number;
  updated: number;
  failed: { sourceRowIndex: number; error: string }[];
}

export interface NotionCandidate {
  pageId: string;
  name: string;
  email: string;
  status: string;
}

export interface BookingDetails {
  start: string;
  end: string;
}

export interface NotionCandidateDetail extends NotionCandidate {
  bookedTime: BookingDetails | null;
  needsRemote: boolean;
}

interface NotionPropertyValue {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  email?: string | null;
  number?: number | null;
  status?: { name: string } | null;
  date?: { start: string; end: string | null } | null;
  checkbox?: boolean;
}

interface NotionPageResult {
  id: string;
  properties?: Record<string, NotionPropertyValue>;
}

const QUESTIONNAIRE_SECTION_HEADING = "問卷回答";

interface NotionBlockResult {
  id: string;
  type: string;
  heading_2?: { rich_text?: { plain_text: string }[]; is_toggleable?: boolean };
}

function isQuestionnaireHeadingBlock(block: NotionBlockResult): boolean {
  if (block.type !== "heading_2" || block.heading_2?.is_toggleable !== true) {
    return false;
  }
  const headingText = (block.heading_2.rich_text ?? [])
    .map((segment) => segment.plain_text)
    .join("");
  return headingText === QUESTIONNAIRE_SECTION_HEADING;
}

function questionAnswerBlocks(answers: Record<string, string>) {
  return Object.entries(answers).map(([question, answer]) => ({
    type: "paragraph" as const,
    paragraph: {
      rich_text: [
        {
          type: "text" as const,
          text: { content: question },
          annotations: { bold: true },
        },
        { type: "text" as const, text: { content: `\n${answer}` } },
      ],
    },
  }));
}

/**
 * Writes a candidate's questionnaire answers into a dedicated toggleable
 * heading section on their Notion page body. Re-syncing replaces only the
 * children under that heading, leaving the rest of the page (e.g. manually
 * added interview notes) untouched.
 */
async function writeQuestionnaireSection(
  client: Client,
  pageId: string,
  answers: Record<string, string>,
): Promise<void> {
  const pageChildren = (await client.blocks.children.list({ block_id: pageId })) as {
    results: NotionBlockResult[];
  };
  const existingHeading = pageChildren.results.find(isQuestionnaireHeadingBlock);

  if (!existingHeading) {
    await client.blocks.children.append({
      block_id: pageId,
      children: [
        {
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: QUESTIONNAIRE_SECTION_HEADING } }],
            is_toggleable: true,
            children: questionAnswerBlocks(answers),
          },
        },
      ],
    });
    return;
  }

  const existingSectionChildren = (await client.blocks.children.list({
    block_id: existingHeading.id,
  })) as { results: { id: string }[] };

  for (const child of existingSectionChildren.results) {
    await client.blocks.delete({ block_id: child.id });
  }

  await client.blocks.children.append({
    block_id: existingHeading.id,
    children: questionAnswerBlocks(answers),
  });
}

export function getNotionClient(config: NotionConfig = getNotionConfig()): Client {
  return new Client({ auth: config.apiKey });
}

const dataSourceIdCache = new Map<string, string>();

export async function getDataSourceId(
  client: Client,
  databaseId: string,
): Promise<string> {
  const cached = dataSourceIdCache.get(databaseId);
  if (cached) {
    return cached;
  }

  const database = (await client.databases.retrieve({
    database_id: databaseId,
  })) as { data_sources?: { id: string }[] };

  const dataSources = database.data_sources;
  if (!dataSources || dataSources.length === 0) {
    throw new Error(`Notion database ${databaseId} has no data sources`);
  }

  dataSourceIdCache.set(databaseId, dataSources[0].id);
  return dataSources[0].id;
}

async function findPageBySourceRowIndex(
  client: Client,
  dataSourceId: string,
  sourceRowIndex: number,
): Promise<string | null> {
  const response = await client.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "SourceRowIndex",
      number: { equals: sourceRowIndex },
    },
  });
  const page = response.results[0] as NotionPageResult | undefined;
  return page ? page.id : null;
}

function candidatePropertiesPayload(candidate: CandidateSyncInput) {
  return {
    Name: { title: [{ text: { content: candidate.name } }] },
    Email: { email: candidate.email },
    SourceRowIndex: { number: candidate.sourceRowIndex },
    Reason: { rich_text: [{ text: { content: candidate.reason } }] },
  };
}

export async function syncCandidatesToNotion(
  candidates: CandidateSyncInput[],
  config: NotionConfig = getNotionConfig(),
): Promise<SyncResult> {
  const client = getNotionClient(config);
  const dataSourceId = await getDataSourceId(client, config.databaseId);

  const result: SyncResult = { created: 0, updated: 0, failed: [] };

  for (const candidate of candidates) {
    try {
      const existingPageId = await findPageBySourceRowIndex(
        client,
        dataSourceId,
        candidate.sourceRowIndex,
      );

      let pageId: string;
      let isNewPage: boolean;

      if (existingPageId) {
        await client.pages.update({
          page_id: existingPageId,
          properties: candidatePropertiesPayload(candidate),
        });
        pageId = existingPageId;
        isNewPage = false;
      } else {
        const page = (await client.pages.create({
          parent: { data_source_id: dataSourceId, type: "data_source_id" },
          properties: {
            ...candidatePropertiesPayload(candidate),
            Status: { status: { name: PENDING_INVITATION_STATUS } },
          },
        })) as { id: string };
        pageId = page.id;
        isNewPage = true;
      }

      await writeQuestionnaireSection(client, pageId, candidate.answers);

      if (isNewPage) {
        result.created += 1;
      } else {
        result.updated += 1;
      }
    } catch (error) {
      result.failed.push({
        sourceRowIndex: candidate.sourceRowIndex,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

function extractCandidate(page: NotionPageResult): NotionCandidate {
  const properties = page.properties ?? {};
  const name = properties.Name?.title?.[0]?.plain_text ?? "";
  const email = properties.Email?.email ?? "";
  const status = properties.Status?.status?.name ?? "";
  return { pageId: page.id, name, email, status };
}

export async function queryCandidatesByStatus(
  status: string,
  config: NotionConfig = getNotionConfig(),
): Promise<NotionCandidate[]> {
  const client = getNotionClient(config);
  const dataSourceId = await getDataSourceId(client, config.databaseId);

  const response = await client.dataSources.query({
    data_source_id: dataSourceId,
    filter: {
      property: "Status",
      status: { equals: status },
    },
  });

  return (response.results as NotionPageResult[]).map(extractCandidate);
}

export async function updateCandidateStatus(
  pageId: string,
  status: string,
  config: NotionConfig = getNotionConfig(),
): Promise<void> {
  const client = getNotionClient(config);
  await client.pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: status } },
    },
  });
}

function isNotFoundError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  return status === 404 || code === "object_not_found";
}

function extractCandidateDetail(page: NotionPageResult): NotionCandidateDetail {
  const candidate = extractCandidate(page);
  const bookedTimeProperty = page.properties?.BookedTime;
  const bookedTime = bookedTimeProperty?.date
    ? {
        start: bookedTimeProperty.date.start,
        end: bookedTimeProperty.date.end ?? bookedTimeProperty.date.start,
      }
    : null;
  const needsRemote = page.properties?.NeedsRemote?.checkbox ?? false;
  return { ...candidate, bookedTime, needsRemote };
}

/**
 * Looks up a candidate directly by their Notion page ID (the `candidateId`
 * used in booking links). Returns null for an unknown or deleted page so
 * callers can respond with a not-found result instead of a generic error.
 */
export async function getCandidateById(
  pageId: string,
  config: NotionConfig = getNotionConfig(),
): Promise<NotionCandidateDetail | null> {
  const client = getNotionClient(config);
  try {
    const page = (await client.pages.retrieve({ page_id: pageId })) as NotionPageResult;
    return extractCandidateDetail(page);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Marks a candidate's booking as finalized: status becomes "已預約", the
 * booked slot is recorded, and the created Calendar event ID is stored for
 * later lookup/debugging.
 */
export async function finalizeBooking(
  pageId: string,
  booking: BookingDetails & { calendarEventId: string; needsRemote: boolean },
  config: NotionConfig = getNotionConfig(),
): Promise<void> {
  const client = getNotionClient(config);
  await client.pages.update({
    page_id: pageId,
    properties: {
      Status: { status: { name: BOOKED_STATUS } },
      BookedTime: { date: { start: booking.start, end: booking.end } },
      CalendarEventId: { rich_text: [{ text: { content: booking.calendarEventId } }] },
      NeedsRemote: { checkbox: booking.needsRemote },
    },
  });
}
