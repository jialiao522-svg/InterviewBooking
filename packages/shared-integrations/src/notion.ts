import { Client } from "@notionhq/client";
import { getNotionConfig, NotionConfig } from "./config";

export const PENDING_INVITATION_STATUS = "已篩選待邀請";
export const INVITED_STATUS = "已邀請";

export interface CandidateSyncInput {
  sourceRowIndex: number;
  name: string;
  email: string;
  reason: string;
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

interface NotionPropertyValue {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  email?: string | null;
  number?: number | null;
  status?: { name: string } | null;
}

interface NotionPageResult {
  id: string;
  properties?: Record<string, NotionPropertyValue>;
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

      if (existingPageId) {
        await client.pages.update({
          page_id: existingPageId,
          properties: candidatePropertiesPayload(candidate),
        });
        result.updated += 1;
      } else {
        await client.pages.create({
          parent: { data_source_id: dataSourceId, type: "data_source_id" },
          properties: {
            ...candidatePropertiesPayload(candidate),
            Status: { status: { name: PENDING_INVITATION_STATUS } },
          },
        });
        result.created += 1;
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
