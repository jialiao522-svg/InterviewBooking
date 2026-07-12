import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeTool, TOOL_DEFINITIONS, ToolDeps } from "./tools";

describe("TOOL_DEFINITIONS", () => {
  it("defines the three expected tools", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "get_sheet_rows",
      "write_tags",
      "sync_to_notion",
    ]);
  });

  it("marks write_tags and sync_to_notion as strict schemas", () => {
    const writeTags = TOOL_DEFINITIONS.find((tool) => tool.name === "write_tags");
    const syncToNotion = TOOL_DEFINITIONS.find((tool) => tool.name === "sync_to_notion");
    expect(writeTags?.strict).toBe(true);
    expect(syncToNotion?.strict).toBe(true);
  });

  it("accepts an optional sheet_name on sync_to_notion, matching get_sheet_rows/write_tags", () => {
    const syncToNotion = TOOL_DEFINITIONS.find((tool) => tool.name === "sync_to_notion");
    const schema = syncToNotion?.input_schema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.properties).toHaveProperty("sheet_name");
    expect(schema.required).not.toContain("sheet_name");
  });
});

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSheetRows: vi.fn().mockResolvedValue([]),
    writeSheetTags: vi.fn(),
    syncCandidatesToNotion: vi.fn(),
    getSheetsConfig: vi.fn().mockReturnValue({
      serviceAccountKeyPath: "test-key.json",
      sheetId: "test-sheet-id",
      sheetRange: "Sheet1!A1:Z1000",
      tagColumnHeader: "Tag",
      reasonColumnHeader: "Reason",
    }),
    confirm: vi.fn(),
    ...overrides,
  } as ToolDeps;
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("executeTool: get_sheet_rows", () => {
  it("returns the rows from readSheetRows as JSON", async () => {
    const rows = [{ row_index: 2, columns: { Name: "Alice" }, current_tag: null }];
    const deps = makeDeps({ readSheetRows: vi.fn().mockResolvedValue(rows) });

    const result = await executeTool("get_sheet_rows", {}, deps);

    expect(JSON.parse(result)).toEqual(rows);
  });

  it("passes sheet_name through to readSheetRows when provided", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ readSheetRows });

    await executeTool("get_sheet_rows", { sheet_name: "工作表2" }, deps);

    expect(readSheetRows).toHaveBeenCalledWith(undefined, "工作表2");
  });

  it("omits sheet_name when the caller does not specify one", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ readSheetRows });

    await executeTool("get_sheet_rows", {}, deps);

    expect(readSheetRows).toHaveBeenCalledWith(undefined, undefined);
  });
});

describe("executeTool: write_tags", () => {
  it("does not call writeSheetTags when the user declines confirmation", async () => {
    const writeSheetTags = vi.fn();
    const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(false), writeSheetTags });

    const result = await executeTool(
      "write_tags",
      { rows: [{ row_index: 2, tag: true, reason: "matches" }] },
      deps,
    );

    expect(writeSheetTags).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toEqual({
      confirmed: false,
      message: "使用者拒絕回寫，未呼叫 Google Sheets API",
    });
  });

  it("calls writeSheetTags with the rows when the user confirms", async () => {
    const writeSheetTags = vi.fn().mockResolvedValue({ succeeded: [2], failed: [] });
    const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(true), writeSheetTags });

    const rows = [{ row_index: 2, tag: true, reason: "matches" }];
    const result = await executeTool("write_tags", { rows }, deps);

    expect(writeSheetTags).toHaveBeenCalledWith(rows, undefined, undefined);
    expect(JSON.parse(result)).toEqual({ confirmed: true, succeeded: [2], failed: [] });
  });

  it("passes the same sheet_name used for reading through to the write-back", async () => {
    const writeSheetTags = vi.fn().mockResolvedValue({ succeeded: [2], failed: [] });
    const deps = makeDeps({ confirm: vi.fn().mockResolvedValue(true), writeSheetTags });

    const rows = [{ row_index: 2, tag: true }];
    await executeTool("write_tags", { rows, sheet_name: "工作表2" }, deps);

    expect(writeSheetTags).toHaveBeenCalledWith(rows, undefined, "工作表2");
  });
});

describe("executeTool: sync_to_notion", () => {
  it("maps candidate input to the shared-integrations shape, attaching questionnaire answers minus the Tag/Reason columns", async () => {
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const readSheetRows = vi.fn().mockResolvedValue([
      {
        row_index: 2,
        columns: {
          Name: "Alice",
          Email: "alice@example.com",
          Tag: "TRUE",
          Reason: "matches",
          "為什麼想參加這次訪談？": "想了解使用者研究方法",
        },
        current_tag: true,
      },
    ]);
    const deps = makeDeps({ syncCandidatesToNotion, readSheetRows });

    const result = await executeTool(
      "sync_to_notion",
      {
        candidates: [
          { row_index: 2, name: "Alice", email: "alice@example.com", reason: "matches" },
        ],
      },
      deps,
    );

    expect(syncCandidatesToNotion).toHaveBeenCalledWith([
      {
        sourceRowIndex: 2,
        name: "Alice",
        email: "alice@example.com",
        reason: "matches",
        answers: {
          Name: "Alice",
          Email: "alice@example.com",
          "為什麼想參加這次訪談？": "想了解使用者研究方法",
        },
      },
    ]);
    expect(JSON.parse(result)).toEqual({ created: 1, updated: 0, failed: [] });
  });

  it("passes sheet_name through to readSheetRows when provided", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 2, columns: { Name: "Alice" }, current_tag: true },
    ]);
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const deps = makeDeps({ readSheetRows, syncCandidatesToNotion });

    await executeTool(
      "sync_to_notion",
      {
        candidates: [
          { row_index: 2, name: "Alice", email: "alice@example.com", reason: "r" },
        ],
        sheet_name: "工作表2",
      },
      deps,
    );

    expect(readSheetRows).toHaveBeenCalledWith(undefined, "工作表2");
  });

  it("omits sheet_name when the caller does not specify one", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 2, columns: { Name: "Alice" }, current_tag: true },
    ]);
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const deps = makeDeps({ readSheetRows, syncCandidatesToNotion });

    await executeTool(
      "sync_to_notion",
      {
        candidates: [
          { row_index: 2, name: "Alice", email: "alice@example.com", reason: "r" },
        ],
      },
      deps,
    );

    expect(readSheetRows).toHaveBeenCalledWith(undefined, undefined);
  });

  it("reports a candidate as failed when its row can no longer be found on the sheet, without blocking others", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 3, columns: { Name: "Bob", Tag: "TRUE", Reason: "r" }, current_tag: true },
    ]);
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const deps = makeDeps({ readSheetRows, syncCandidatesToNotion });

    const result = await executeTool(
      "sync_to_notion",
      {
        candidates: [
          { row_index: 2, name: "Alice", email: "a@example.com", reason: "r" },
          { row_index: 3, name: "Bob", email: "b@example.com", reason: "r" },
        ],
      },
      deps,
    );

    expect(syncCandidatesToNotion).toHaveBeenCalledWith([
      {
        sourceRowIndex: 3,
        name: "Bob",
        email: "b@example.com",
        reason: "r",
        answers: { Name: "Bob" },
      },
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.created).toBe(1);
    expect(parsed.failed).toEqual([
      { sourceRowIndex: 2, error: "找不到列 2，可能已從 Sheet 移除" },
    ]);
  });
});

describe("executeTool: unknown tool", () => {
  it("throws for an unrecognized tool name", async () => {
    await expect(executeTool("does_not_exist", {}, makeDeps())).rejects.toThrow(
      /Unknown tool/,
    );
  });
});
