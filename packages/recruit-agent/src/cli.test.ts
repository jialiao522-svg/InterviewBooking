import { describe, it, expect, vi } from "vitest";
import { runCli, CliDeps } from "./cli";

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
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
    ...overrides,
  } as CliDeps;
}

describe("runCli: read-rows", () => {
  it("prints the rows from readSheetRows as JSON on stdout with exit code 0", async () => {
    const rows = [{ row_index: 2, columns: { Name: "Alice" }, current_tag: null }];
    const deps = makeDeps({ readSheetRows: vi.fn().mockResolvedValue(rows) });

    const result = await runCli(["read-rows"], deps);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "")).toEqual(rows);
  });

  it("passes --sheet-name through to readSheetRows", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({ readSheetRows });

    await runCli(["read-rows", "--sheet-name", "工作表2"], deps);

    expect(readSheetRows).toHaveBeenCalledWith(undefined, "工作表2");
  });

  it("returns a non-zero exit code with an error message when readSheetRows throws", async () => {
    const deps = makeDeps({
      readSheetRows: vi.fn().mockRejectedValue(new Error("sheet not shared")),
    });

    const result = await runCli(["read-rows"], deps);

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toEqual({ error: "sheet not shared" });
  });
});

describe("runCli: write-tags", () => {
  it("parses --rows and calls writeSheetTags with the parsed rows", async () => {
    const writeSheetTags = vi.fn().mockResolvedValue({ succeeded: [2], failed: [] });
    const deps = makeDeps({ writeSheetTags });
    const rows = [{ row_index: 2, tag: true, reason: "matches" }];

    const result = await runCli(["write-tags", "--rows", JSON.stringify(rows)], deps);

    expect(writeSheetTags).toHaveBeenCalledWith(rows, undefined, undefined);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "")).toEqual({ succeeded: [2], failed: [] });
  });

  it("passes --sheet-name through to writeSheetTags", async () => {
    const writeSheetTags = vi.fn().mockResolvedValue({ succeeded: [], failed: [] });
    const deps = makeDeps({ writeSheetTags });
    const rows = [{ row_index: 2, tag: true }];

    await runCli(["write-tags", "--rows", JSON.stringify(rows), "--sheet-name", "工作表2"], deps);

    expect(writeSheetTags).toHaveBeenCalledWith(rows, undefined, "工作表2");
  });

  it("returns a non-zero exit code and does not call writeSheetTags when --rows is malformed JSON", async () => {
    const writeSheetTags = vi.fn();
    const deps = makeDeps({ writeSheetTags });

    const result = await runCli(["write-tags", "--rows", "{not valid json"], deps);

    expect(writeSheetTags).not.toHaveBeenCalled();
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toHaveProperty("error");
  });

  it("returns a non-zero exit code with an error message when writeSheetTags throws", async () => {
    const deps = makeDeps({
      writeSheetTags: vi.fn().mockRejectedValue(new Error("quota exceeded")),
    });

    const result = await runCli(
      ["write-tags", "--rows", JSON.stringify([{ row_index: 2, tag: true }])],
      deps,
    );

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toEqual({ error: "quota exceeded" });
  });
});

describe("runCli: sync-notion", () => {
  it("maps candidate input to the shared-integrations shape, excluding the Tag/Reason columns from answers", async () => {
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

    const candidates = [
      { row_index: 2, name: "Alice", email: "alice@example.com", reason: "matches" },
    ];
    const result = await runCli(
      ["sync-notion", "--candidates", JSON.stringify(candidates)],
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
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "")).toEqual({ created: 1, updated: 0, failed: [] });
  });

  it("reports a candidate as failed when its row can no longer be found, without blocking others", async () => {
    const syncCandidatesToNotion = vi
      .fn()
      .mockResolvedValue({ created: 1, updated: 0, failed: [] });
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 3, columns: { Name: "Bob", Tag: "TRUE", Reason: "r" }, current_tag: true },
    ]);
    const deps = makeDeps({ syncCandidatesToNotion, readSheetRows });

    const candidates = [
      { row_index: 2, name: "Alice", email: "a@example.com", reason: "r" },
      { row_index: 3, name: "Bob", email: "b@example.com", reason: "r" },
    ];
    const result = await runCli(
      ["sync-notion", "--candidates", JSON.stringify(candidates)],
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
    const parsed = JSON.parse(result.stdout ?? "");
    expect(parsed.created).toBe(1);
    expect(parsed.failed).toEqual([
      { sourceRowIndex: 2, error: "找不到列 2，可能已從 Sheet 移除" },
    ]);
  });

  it("returns a non-zero exit code and does not call syncCandidatesToNotion when --candidates is malformed JSON", async () => {
    const syncCandidatesToNotion = vi.fn();
    const deps = makeDeps({ syncCandidatesToNotion });

    const result = await runCli(["sync-notion", "--candidates", "{not valid json"], deps);

    expect(syncCandidatesToNotion).not.toHaveBeenCalled();
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toHaveProperty("error");
  });

  it("returns a non-zero exit code with an error message when syncCandidatesToNotion throws", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 2, columns: { Name: "Alice" }, current_tag: true },
    ]);
    const deps = makeDeps({
      readSheetRows,
      syncCandidatesToNotion: vi.fn().mockRejectedValue(new Error("notion api down")),
    });

    const result = await runCli(
      [
        "sync-notion",
        "--candidates",
        JSON.stringify([{ row_index: 2, name: "Alice", email: "a@example.com", reason: "r" }]),
      ],
      deps,
    );

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toEqual({ error: "notion api down" });
  });
});

describe("runCli: unknown command", () => {
  it("returns a non-zero exit code for an unrecognized command", async () => {
    const result = await runCli(["does-not-exist"], makeDeps());

    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stderr ?? "")).toHaveProperty("error");
  });
});
