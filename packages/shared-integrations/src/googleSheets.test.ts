import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockValuesGet, mockBatchUpdate, mockGetClient, MockGoogleAuth } = vi.hoisted(() => {
  const getClient = vi.fn().mockResolvedValue({});
  class GoogleAuthStub {
    getClient = getClient;
  }
  return {
    mockValuesGet: vi.fn(),
    mockBatchUpdate: vi.fn(),
    mockGetClient: getClient,
    MockGoogleAuth: GoogleAuthStub,
  };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: MockGoogleAuth,
    },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        values: {
          get: mockValuesGet,
          batchUpdate: mockBatchUpdate,
        },
      },
    }),
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue(
      JSON.stringify({ client_email: "test-service-account@example.iam.gserviceaccount.com" }),
    ),
  };
});

import { readSheetRows, writeSheetTags, SheetAccessDeniedError } from "./googleSheets";
import type { SheetsConfig } from "./config";

const testConfig: SheetsConfig = {
  serviceAccountKeyPath: "/fake/key.json",
  sheetId: "test-sheet-id",
  sheetRange: "Sheet1!A1:Z1000",
  tagColumnHeader: "Tag",
  reasonColumnHeader: "Reason",
};

beforeEach(() => {
  mockValuesGet.mockReset();
  mockBatchUpdate.mockReset();
});

describe("readSheetRows", () => {
  it("parses header row into column names and rows into SheetRow objects", async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        values: [
          ["Name", "Email", "Tag"],
          ["Alice", "alice@example.com", "TRUE"],
          ["Bob", "bob@example.com", ""],
        ],
      },
    });

    const rows = await readSheetRows(testConfig);

    expect(rows).toEqual([
      {
        row_index: 2,
        columns: { Name: "Alice", Email: "alice@example.com", Tag: "TRUE" },
        current_tag: true,
      },
      {
        row_index: 3,
        columns: { Name: "Bob", Email: "bob@example.com", Tag: "" },
        current_tag: null,
      },
    ]);
  });

  it("throws SheetAccessDeniedError when the sheet is not shared with the service account", async () => {
    mockValuesGet.mockRejectedValue({ code: 403 });

    await expect(readSheetRows(testConfig)).rejects.toBeInstanceOf(SheetAccessDeniedError);
    await expect(readSheetRows(testConfig)).rejects.toThrow(
      /test-service-account@example.iam.gserviceaccount.com/,
    );
  });

  it("reads from an explicitly requested sheet name instead of the configured default", async () => {
    mockValuesGet.mockResolvedValue({ data: { values: [["Name"], ["Alice"]] } });

    await readSheetRows(testConfig, "工作表2");

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ range: "工作表2!A1:Z1000" }),
    );
  });
});

describe("writeSheetTags", () => {
  it("writes tag and reason values back for each row", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["Name", "Email", "Tag", "Reason"]] },
    });
    mockBatchUpdate.mockResolvedValue({});

    const result = await writeSheetTags(
      [{ row_index: 2, tag: true, reason: "matches criteria" }],
      testConfig,
    );

    expect(result.succeeded).toEqual([2]);
    expect(result.failed).toEqual([]);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: "test-sheet-id",
        requestBody: expect.objectContaining({
          data: [
            { range: "Sheet1!C2", values: [["TRUE"]] },
            { range: "Sheet1!D2", values: [["matches criteria"]] },
          ],
        }),
      }),
    );
  });

  it("isolates a single row's write failure from other rows", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["Name", "Email", "Tag"]] },
    });
    mockBatchUpdate
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});

    const result = await writeSheetTags(
      [
        { row_index: 2, tag: true },
        { row_index: 3, tag: false },
      ],
      testConfig,
    );

    expect(result.succeeded).toEqual([3]);
    expect(result.failed).toEqual([{ row_index: 2, error: "boom" }]);
  });

  it("writes to an explicitly requested sheet name instead of the configured default", async () => {
    mockValuesGet.mockResolvedValue({
      data: { values: [["Name", "Tag"]] },
    });
    mockBatchUpdate.mockResolvedValue({});

    await writeSheetTags([{ row_index: 2, tag: true }], testConfig, "工作表2");

    expect(mockValuesGet).toHaveBeenCalledWith(
      expect.objectContaining({ range: "工作表2!1:1" }),
    );
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          data: [{ range: "工作表2!B2", values: [["TRUE"]] }],
        }),
      }),
    );
  });
});
