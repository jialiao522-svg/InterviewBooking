import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "./loop";
import type { ToolDeps } from "./tools";

function makeDeps(overrides: Partial<ToolDeps> = {}): ToolDeps {
  return {
    readSheetRows: vi.fn().mockResolvedValue([]),
    writeSheetTags: vi.fn(),
    syncCandidatesToNotion: vi.fn(),
    confirm: vi.fn(),
    ...overrides,
  } as ToolDeps;
}

function fakeClient(responses: unknown[]): Anthropic {
  const create = vi.fn();
  responses.forEach((response) => create.mockResolvedValueOnce(response));
  return { messages: { create } } as unknown as Anthropic;
}

describe("runTurn", () => {
  it("returns immediately when the first response is not a tool call", async () => {
    const client = fakeClient([
      {
        content: [{ type: "text", text: "沒有符合條件的名單" }],
        stop_reason: "end_turn",
      },
    ]);

    const result = await runTurn(client, [], "篩選台大資工系的候選人", makeDeps());

    expect(result.responseText).toBe("沒有符合條件的名單");
    // user turn + final assistant turn
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      role: "user",
      content: "篩選台大資工系的候選人",
    });
  });

  it("executes a tool call and continues the loop until a text response arrives", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 2, columns: { Name: "Alice" }, current_tag: null },
    ]);

    const client = fakeClient([
      {
        content: [
          { type: "tool_use", id: "toolu_1", name: "get_sheet_rows", input: {} },
        ],
        stop_reason: "tool_use",
      },
      {
        content: [{ type: "text", text: "已讀取 1 筆資料" }],
        stop_reason: "end_turn",
      },
    ]);

    const result = await runTurn(client, [], "看看目前的名單", makeDeps({ readSheetRows }));

    expect(readSheetRows).toHaveBeenCalledOnce();
    expect(result.responseText).toBe("已讀取 1 筆資料");

    const toolResultMessage = result.messages.find(
      (message) =>
        message.role === "user" &&
        Array.isArray(message.content) &&
        message.content[0]?.type === "tool_result",
    );
    expect(toolResultMessage).toBeDefined();
  });

  it("does not call write_tags when the assistant summarizes tag decisions and asks for confirmation instead of writing back", async () => {
    const readSheetRows = vi.fn().mockResolvedValue([
      { row_index: 2, columns: { Name: "Alice" }, current_tag: null },
    ]);
    const writeSheetTags = vi.fn();

    const client = fakeClient([
      {
        content: [
          { type: "tool_use", id: "toolu_1", name: "get_sheet_rows", input: {} },
        ],
        stop_reason: "tool_use",
      },
      {
        content: [
          { type: "text", text: "符合 1 筆、不符合 0 筆。你對這個結果滿意嗎？" },
        ],
        stop_reason: "end_turn",
      },
    ]);

    const result = await runTurn(
      client,
      [],
      "篩選台大資工系的候選人",
      makeDeps({ readSheetRows, writeSheetTags }),
    );

    expect(result.responseText).toBe("符合 1 筆、不符合 0 筆。你對這個結果滿意嗎？");
    expect(writeSheetTags).not.toHaveBeenCalled();
  });
});
