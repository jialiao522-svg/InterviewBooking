import * as readline from "readline/promises";
import type Anthropic from "@anthropic-ai/sdk";
import {
  readSheetRows,
  writeSheetTags,
  syncCandidatesToNotion,
  getSheetsConfig,
} from "@interview-platform/shared-integrations";

export interface ToolDeps {
  readSheetRows: typeof readSheetRows;
  writeSheetTags: typeof writeSheetTags;
  syncCandidatesToNotion: typeof syncCandidatesToNotion;
  getSheetsConfig: typeof getSheetsConfig;
  confirm: (message: string) => Promise<boolean>;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} (y/n) `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export const defaultToolDeps: ToolDeps = {
  readSheetRows,
  writeSheetTags,
  syncCandidatesToNotion,
  getSheetsConfig,
  confirm: defaultConfirm,
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_sheet_rows",
    description:
      "讀取 Google Sheet 上所有原始名單列，包含每列的欄位值與目前的標記狀態。唯讀操作，可隨時呼叫，不需要使用者確認。若使用者在對話中提到特定的工作表（分頁）名稱，帶入 sheet_name；沒有提到時不要帶這個參數，會使用預設設定的工作表。",
    input_schema: {
      type: "object",
      properties: {
        sheet_name: {
          type: "string",
          description: "要讀取的 Google Sheet 工作表（分頁）名稱。省略時使用預設設定的工作表。",
        },
      },
      required: [],
    },
  },
  {
    name: "write_tags",
    description:
      "將標記決定（是否為主要招募對象）回寫到 Google Sheet 的標記欄位。只有在使用者明確要求回寫/確認時才呼叫。呼叫時會先向使用者顯示預覽並要求 y/n 確認，使用者拒絕時不會實際寫入。若本次對話是透過 sheet_name 讀取特定工作表的資料，回寫時務必帶入相同的 sheet_name，避免寫到錯誤的分頁。",
    input_schema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              row_index: { type: "integer", description: "Sheet 上的列號" },
              tag: { type: "boolean", description: "是否為主要招募對象" },
              reason: { type: "string", description: "標記理由" },
            },
            required: ["row_index", "tag"],
            additionalProperties: false,
          },
        },
        sheet_name: {
          type: "string",
          description: "要回寫的 Google Sheet 工作表（分頁）名稱，應與讀取時使用的 sheet_name 一致。省略時使用預設設定的工作表。",
        },
      },
      required: ["rows"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "sync_to_notion",
    description:
      "將標記為主要招募對象的候選人同步到 Notion 資料庫，會建立新頁面或更新既有頁面，並把候選人在 Sheet 上填寫的問卷回答整理寫入該頁面內文。只有在使用者明確要求同步時才呼叫。若本次對話是透過 sheet_name 讀取特定工作表的資料，同步時務必帶入相同的 sheet_name，避免讀到錯誤分頁的問卷回答。",
    input_schema: {
      type: "object",
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              row_index: { type: "integer", description: "Sheet 上的列號" },
              name: { type: "string" },
              email: { type: "string" },
              reason: { type: "string", description: "標記理由" },
            },
            required: ["row_index", "name", "email", "reason"],
            additionalProperties: false,
          },
        },
        sheet_name: {
          type: "string",
          description: "要重新讀取問卷回答的 Google Sheet 工作表（分頁）名稱，應與讀取時使用的 sheet_name 一致。省略時使用預設設定的工作表。",
        },
      },
      required: ["candidates"],
      additionalProperties: false,
    },
    strict: true,
  },
];

interface GetSheetRowsInput {
  sheet_name?: string;
}

interface WriteTagsInput {
  rows: { row_index: number; tag: boolean; reason?: string }[];
  sheet_name?: string;
}

interface SyncToNotionInput {
  candidates: { row_index: number; name: string; email: string; reason: string }[];
  sheet_name?: string;
}

export async function executeTool(
  name: string,
  input: unknown,
  deps: ToolDeps = defaultToolDeps,
): Promise<string> {
  switch (name) {
    case "get_sheet_rows": {
      const { sheet_name: sheetName } = (input ?? {}) as GetSheetRowsInput;
      const rows = await deps.readSheetRows(undefined, sheetName);
      return JSON.stringify(rows);
    }

    case "write_tags": {
      const { rows, sheet_name: sheetName } = input as WriteTagsInput;

      // eslint-disable-next-line no-console
      console.log("\n即將回寫以下標記到 Google Sheet：");
      for (const row of rows) {
        const label = row.tag ? "符合" : "不符合";
        const reasonSuffix = row.reason ? `（${row.reason}）` : "";
        // eslint-disable-next-line no-console
        console.log(`  列 ${row.row_index}：${label}${reasonSuffix}`);
      }

      const confirmed = await deps.confirm("確定要回寫這些標記嗎？");
      if (!confirmed) {
        return JSON.stringify({
          confirmed: false,
          message: "使用者拒絕回寫，未呼叫 Google Sheets API",
        });
      }

      const result = await deps.writeSheetTags(rows, undefined, sheetName);
      return JSON.stringify({ confirmed: true, ...result });
    }

    case "sync_to_notion": {
      const { candidates, sheet_name: sheetName } = input as SyncToNotionInput;

      const { tagColumnHeader, reasonColumnHeader } = deps.getSheetsConfig();
      const rows = await deps.readSheetRows(undefined, sheetName);
      const rowsByIndex = new Map(rows.map((row) => [row.row_index, row]));

      const syncInputs: Parameters<typeof deps.syncCandidatesToNotion>[0] = [];
      const missingRowFailures: { sourceRowIndex: number; error: string }[] = [];

      for (const candidate of candidates) {
        const row = rowsByIndex.get(candidate.row_index);
        if (!row) {
          missingRowFailures.push({
            sourceRowIndex: candidate.row_index,
            error: `找不到列 ${candidate.row_index}，可能已從 Sheet 移除`,
          });
          continue;
        }

        const answers: Record<string, string> = {};
        for (const [header, value] of Object.entries(row.columns)) {
          if (header === tagColumnHeader || header === reasonColumnHeader) {
            continue;
          }
          answers[header] = value;
        }

        syncInputs.push({
          sourceRowIndex: candidate.row_index,
          name: candidate.name,
          email: candidate.email,
          reason: candidate.reason,
          answers,
        });
      }

      const result = await deps.syncCandidatesToNotion(syncInputs);
      return JSON.stringify({
        ...result,
        failed: [...result.failed, ...missingRowFailures],
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
