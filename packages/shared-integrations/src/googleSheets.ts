import * as fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { getSheetsConfig, SheetsConfig } from "./config";

export interface SheetRow {
  row_index: number;
  columns: Record<string, string>;
  current_tag: boolean | null;
}

export interface TagWrite {
  row_index: number;
  tag: boolean;
  reason?: string;
}

export interface TagWriteResult {
  succeeded: number[];
  failed: { row_index: number; error: string }[];
}

export class SheetAccessDeniedError extends Error {
  constructor(public readonly serviceAccountEmail: string, sheetId: string) {
    super(
      `Google Sheet ${sheetId} is not shared with the service account. ` +
        `Share the sheet with ${serviceAccountEmail} (Editor access) and try again.`,
    );
    this.name = "SheetAccessDeniedError";
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

function sheetNameOf(range: string): string {
  return range.split("!")[0];
}

function columnRangeOf(range: string): string {
  return range.split("!")[1] ?? "A1:Z1000";
}

/**
 * Builds the effective A1 range for a request: the configured column range
 * (e.g. "A1:AZ1000") combined with either the caller-supplied sheet/tab name
 * or the configured default. Lets a single conversation target a different
 * tab without needing a matching GOOGLE_SHEET_RANGE env var.
 */
function resolveRange(config: SheetsConfig, sheetName?: string): string {
  const name = sheetName ?? sheetNameOf(config.sheetRange);
  return `${name}!${columnRangeOf(config.sheetRange)}`;
}

export async function getSheetsClient(
  config: SheetsConfig = getSheetsConfig(),
): Promise<sheets_v4.Sheets> {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.serviceAccountKeyPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client as never });
}

function parseTag(cell: string | undefined): boolean | null {
  if (cell === undefined || cell === "") {
    return null;
  }
  return cell.trim().toLowerCase() === "true";
}

export async function readSheetRows(
  config: SheetsConfig = getSheetsConfig(),
  sheetName?: string,
): Promise<SheetRow[]> {
  const client = await getSheetsClient(config);

  let response;
  try {
    response = await client.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range: resolveRange(config, sheetName),
    });
  } catch (error) {
    if (isPermissionDenied(error)) {
      const email = await getServiceAccountEmail(config.serviceAccountKeyPath);
      throw new SheetAccessDeniedError(email, config.sheetId);
    }
    throw error;
  }

  const values = response.data.values ?? [];
  if (values.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = values;
  const headers = headerRow.map((header) => String(header ?? ""));
  const tagColumnIndex = headers.indexOf(config.tagColumnHeader);

  return dataRows.map((row, index) => {
    const columns: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      columns[header] = String(row[columnIndex] ?? "");
    });

    const rawTag = tagColumnIndex >= 0 ? String(row[tagColumnIndex] ?? "") : undefined;

    return {
      row_index: index + 2, // header occupies row 1; data starts at row 2
      columns,
      current_tag: parseTag(rawTag),
    };
  });
}

async function resolveTagColumnLetter(
  client: sheets_v4.Sheets,
  config: SheetsConfig,
  sheetName: string,
): Promise<{ tagColumn: string; reasonColumn: string | null }> {
  const headerResponse = await client.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = (headerResponse.data.values?.[0] ?? []).map((h) => String(h ?? ""));
  const tagIndex = headers.indexOf(config.tagColumnHeader);
  const reasonIndex = headers.indexOf(config.reasonColumnHeader);

  if (tagIndex < 0) {
    throw new Error(
      `Tag column "${config.tagColumnHeader}" not found in sheet header row`,
    );
  }

  return {
    tagColumn: columnIndexToLetter(tagIndex),
    reasonColumn: reasonIndex >= 0 ? columnIndexToLetter(reasonIndex) : null,
  };
}

function columnIndexToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

export async function writeSheetTags(
  writes: TagWrite[],
  config: SheetsConfig = getSheetsConfig(),
  sheetName?: string,
): Promise<TagWriteResult> {
  const client = await getSheetsClient(config);
  const resolvedSheetName = sheetName ?? sheetNameOf(config.sheetRange);
  const { tagColumn, reasonColumn } = await resolveTagColumnLetter(
    client,
    config,
    resolvedSheetName,
  );

  const result: TagWriteResult = { succeeded: [], failed: [] };

  for (const write of writes) {
    try {
      const data: sheets_v4.Schema$ValueRange[] = [
        {
          range: `${resolvedSheetName}!${tagColumn}${write.row_index}`,
          values: [[write.tag ? "TRUE" : "FALSE"]],
        },
      ];
      if (reasonColumn && write.reason !== undefined) {
        data.push({
          range: `${resolvedSheetName}!${reasonColumn}${write.row_index}`,
          values: [[write.reason]],
        });
      }

      await client.spreadsheets.values.batchUpdate({
        spreadsheetId: config.sheetId,
        requestBody: {
          valueInputOption: "RAW",
          data,
        },
      });
      result.succeeded.push(write.row_index);
    } catch (error) {
      result.failed.push({
        row_index: write.row_index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
