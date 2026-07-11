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
});

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSheetRows: vi.fn(),
    writeSheetTags: vi.fn(),
    syncCandidatesToNotion: vi.fn(),
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
  it("maps candidate input to the shared-integrations shape", async () => {
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const deps = makeDeps({ syncCandidatesToNotion });

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
      { sourceRowIndex: 2, name: "Alice", email: "alice@example.com", reason: "matches" },
    ]);
    expect(JSON.parse(result)).toEqual({ created: 1, updated: 0, failed: [] });
  });
});

describe("executeTool: unknown tool", () => {
  it("throws for an unrecognized tool name", async () => {
    await expect(executeTool("does_not_exist", {}, makeDeps())).rejects.toThrow(
      /Unknown tool/,
    );
  });
});
