import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockDatabasesRetrieve,
  mockDataSourcesQuery,
  mockPagesCreate,
  mockPagesUpdate,
  mockPagesRetrieve,
  mockBlocksChildrenList,
  mockBlocksChildrenAppend,
  mockBlocksDelete,
  MockClient,
} = vi.hoisted(() => {
  const databasesRetrieve = vi.fn();
  const dataSourcesQuery = vi.fn();
  const pagesCreate = vi.fn();
  const pagesUpdate = vi.fn();
  const pagesRetrieve = vi.fn();
  const blocksChildrenList = vi.fn();
  const blocksChildrenAppend = vi.fn();
  const blocksDelete = vi.fn();

  class ClientStub {
    databases = { retrieve: databasesRetrieve };
    dataSources = { query: dataSourcesQuery };
    pages = { create: pagesCreate, update: pagesUpdate, retrieve: pagesRetrieve };
    blocks = {
      delete: blocksDelete,
      children: { list: blocksChildrenList, append: blocksChildrenAppend },
    };
  }

  return {
    mockDatabasesRetrieve: databasesRetrieve,
    mockDataSourcesQuery: dataSourcesQuery,
    mockPagesCreate: pagesCreate,
    mockPagesUpdate: pagesUpdate,
    mockPagesRetrieve: pagesRetrieve,
    mockBlocksChildrenList: blocksChildrenList,
    mockBlocksChildrenAppend: blocksChildrenAppend,
    mockBlocksDelete: blocksDelete,
    MockClient: ClientStub,
  };
});

vi.mock("@notionhq/client", () => ({
  Client: MockClient,
}));

import {
  syncCandidatesToNotion,
  queryCandidatesByStatus,
  updateCandidateStatus,
  getCandidateById,
  finalizeBooking,
  PENDING_INVITATION_STATUS,
  BOOKED_STATUS,
} from "./notion";
import type { NotionConfig } from "./config";

const testConfig: NotionConfig = {
  apiKey: "test-key",
  databaseId: "test-database-id",
};

beforeEach(() => {
  mockDatabasesRetrieve.mockReset();
  mockDataSourcesQuery.mockReset();
  mockPagesCreate.mockReset();
  mockPagesUpdate.mockReset();
  mockPagesRetrieve.mockReset();
  mockBlocksChildrenList.mockReset();
  mockBlocksChildrenAppend.mockReset();
  mockBlocksDelete.mockReset();
  mockDatabasesRetrieve.mockResolvedValue({
    data_sources: [{ id: "test-data-source-id" }],
  });
  mockBlocksChildrenList.mockResolvedValue({ results: [] });
  mockBlocksChildrenAppend.mockResolvedValue({ results: [] });
  mockBlocksDelete.mockResolvedValue({});
});

describe("syncCandidatesToNotion", () => {
  it("creates a new page for a candidate with no existing entry", async () => {
    mockDataSourcesQuery.mockResolvedValue({ results: [] });
    mockPagesCreate.mockResolvedValue({ id: "new-page-id" });

    const result = await syncCandidatesToNotion(
      [{ sourceRowIndex: 2, name: "Alice", email: "alice@example.com", reason: "matches", answers: {} }],
      testConfig,
    );

    expect(result).toEqual({ created: 1, updated: 0, failed: [] });
    expect(mockPagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: { data_source_id: "test-data-source-id", type: "data_source_id" },
        properties: expect.objectContaining({
          Status: { status: { name: PENDING_INVITATION_STATUS } },
        }),
      }),
    );
  });

  it("updates the existing page instead of creating a duplicate", async () => {
    mockDataSourcesQuery.mockResolvedValue({ results: [{ id: "existing-page-id" }] });
    mockPagesUpdate.mockResolvedValue({ id: "existing-page-id" });

    const result = await syncCandidatesToNotion(
      [{ sourceRowIndex: 2, name: "Alice", email: "alice@example.com", reason: "matches", answers: {} }],
      testConfig,
    );

    expect(result).toEqual({ created: 0, updated: 1, failed: [] });
    expect(mockPagesCreate).not.toHaveBeenCalled();
    expect(mockPagesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ page_id: "existing-page-id" }),
    );
  });

  it("reports a per-candidate sync failure while completing the rest", async () => {
    mockDataSourcesQuery
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    mockPagesCreate
      .mockRejectedValueOnce(new Error("notion down"))
      .mockResolvedValueOnce({ id: "page-2" });

    const result = await syncCandidatesToNotion(
      [
        { sourceRowIndex: 2, name: "Alice", email: "a@example.com", reason: "r", answers: {} },
        { sourceRowIndex: 3, name: "Bob", email: "b@example.com", reason: "r", answers: {} },
      ],
      testConfig,
    );

    expect(result.created).toBe(1);
    expect(result.failed).toEqual([{ sourceRowIndex: 2, error: "notion down" }]);
  });
});

describe("syncCandidatesToNotion: questionnaire section", () => {
  it("creates a new 問卷回答 toggle heading with the candidate's answers when the page has no existing section", async () => {
    mockDataSourcesQuery.mockResolvedValue({ results: [] });
    mockPagesCreate.mockResolvedValue({ id: "new-page-id" });
    mockBlocksChildrenList.mockResolvedValue({ results: [] });

    const result = await syncCandidatesToNotion(
      [
        {
          sourceRowIndex: 2,
          name: "Alice",
          email: "alice@example.com",
          reason: "matches",
          answers: { "為什麼想參加這次訪談？": "想了解使用者研究方法" },
        },
      ],
      testConfig,
    );

    expect(result).toEqual({ created: 1, updated: 0, failed: [] });
    expect(mockBlocksChildrenList).toHaveBeenCalledWith({ block_id: "new-page-id" });
    expect(mockBlocksChildrenAppend).toHaveBeenCalledWith({
      block_id: "new-page-id",
      children: [
        {
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "問卷回答" } }],
            is_toggleable: true,
            children: [
              {
                type: "paragraph",
                paragraph: {
                  rich_text: [
                    {
                      type: "text",
                      text: { content: "為什麼想參加這次訪談？" },
                      annotations: { bold: true },
                    },
                    { type: "text", text: { content: "\n想了解使用者研究方法" } },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
    expect(mockBlocksDelete).not.toHaveBeenCalled();
  });

  it("replaces only the existing 問卷回答 section's children on re-sync, without touching the rest of the page", async () => {
    mockDataSourcesQuery.mockResolvedValue({ results: [{ id: "existing-page-id" }] });
    mockPagesUpdate.mockResolvedValue({ id: "existing-page-id" });
    mockBlocksChildrenList
      .mockResolvedValueOnce({
        results: [
          {
            id: "heading-1",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "問卷回答" }], is_toggleable: true },
          },
        ],
      })
      .mockResolvedValueOnce({
        results: [{ id: "old-child-1" }, { id: "old-child-2" }],
      });

    const result = await syncCandidatesToNotion(
      [
        {
          sourceRowIndex: 2,
          name: "Alice",
          email: "alice@example.com",
          reason: "matches",
          answers: { "產業背景？": "軟體工程" },
        },
      ],
      testConfig,
    );

    expect(result).toEqual({ created: 0, updated: 1, failed: [] });
    expect(mockBlocksDelete).toHaveBeenCalledTimes(2);
    expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: "old-child-1" });
    expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: "old-child-2" });
    expect(mockBlocksChildrenAppend).toHaveBeenCalledTimes(1);
    expect(mockBlocksChildrenAppend).toHaveBeenCalledWith({
      block_id: "heading-1",
      children: [
        {
          type: "paragraph",
          paragraph: {
            rich_text: [
              { type: "text", text: { content: "產業背景？" }, annotations: { bold: true } },
              { type: "text", text: { content: "\n軟體工程" } },
            ],
          },
        },
      ],
    });
  });

  it("treats a questionnaire-section write failure as a per-candidate sync failure without blocking other candidates", async () => {
    mockDataSourcesQuery
      .mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ results: [] });
    mockPagesCreate
      .mockResolvedValueOnce({ id: "page-1" })
      .mockResolvedValueOnce({ id: "page-2" });
    mockBlocksChildrenList
      .mockRejectedValueOnce(new Error("blocks API down"))
      .mockResolvedValueOnce({ results: [] });

    const result = await syncCandidatesToNotion(
      [
        {
          sourceRowIndex: 2,
          name: "Alice",
          email: "a@example.com",
          reason: "r",
          answers: { Q: "A" },
        },
        {
          sourceRowIndex: 3,
          name: "Bob",
          email: "b@example.com",
          reason: "r",
          answers: { Q: "A" },
        },
      ],
      testConfig,
    );

    expect(result.created).toBe(1);
    expect(result.failed).toEqual([{ sourceRowIndex: 2, error: "blocks API down" }]);
  });
});

describe("queryCandidatesByStatus", () => {
  it("returns candidates matching the given status", async () => {
    mockDataSourcesQuery.mockResolvedValue({
      results: [
        {
          id: "page-1",
          properties: {
            Name: { title: [{ plain_text: "Alice" }] },
            Email: { email: "alice@example.com" },
            Status: { status: { name: PENDING_INVITATION_STATUS } },
          },
        },
      ],
    });

    const candidates = await queryCandidatesByStatus(PENDING_INVITATION_STATUS, testConfig);

    expect(candidates).toEqual([
      {
        pageId: "page-1",
        name: "Alice",
        email: "alice@example.com",
        status: PENDING_INVITATION_STATUS,
      },
    ]);
    expect(mockDataSourcesQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { property: "Status", status: { equals: PENDING_INVITATION_STATUS } },
      }),
    );
  });
});

describe("updateCandidateStatus", () => {
  it("updates the Status property on the given page", async () => {
    mockPagesUpdate.mockResolvedValue({});

    await updateCandidateStatus("page-1", "已邀請", testConfig);

    expect(mockPagesUpdate).toHaveBeenCalledWith({
      page_id: "page-1",
      properties: { Status: { status: { name: "已邀請" } } },
    });
  });
});

describe("getCandidateById", () => {
  it("returns the candidate with booked time and remote-need flag when set", async () => {
    mockPagesRetrieve.mockResolvedValue({
      id: "page-1",
      properties: {
        Name: { title: [{ plain_text: "Alice" }] },
        Email: { email: "alice@example.com" },
        Status: { status: { name: BOOKED_STATUS } },
        BookedTime: {
          date: { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
        },
        NeedsRemote: { checkbox: true },
      },
    });

    const candidate = await getCandidateById("page-1", testConfig);

    expect(candidate).toEqual({
      pageId: "page-1",
      name: "Alice",
      email: "alice@example.com",
      status: BOOKED_STATUS,
      bookedTime: { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
      needsRemote: true,
    });
  });

  it("returns null bookedTime when the candidate has not booked yet", async () => {
    mockPagesRetrieve.mockResolvedValue({
      id: "page-1",
      properties: {
        Name: { title: [{ plain_text: "Alice" }] },
        Email: { email: "alice@example.com" },
        Status: { status: { name: "已邀請" } },
      },
    });

    const candidate = await getCandidateById("page-1", testConfig);

    expect(candidate?.bookedTime).toBeNull();
  });

  it("returns null when the candidateId has no matching Notion page", async () => {
    mockPagesRetrieve.mockRejectedValue({ code: "object_not_found", status: 404 });

    const candidate = await getCandidateById("unknown-page", testConfig);

    expect(candidate).toBeNull();
  });
});

describe("finalizeBooking", () => {
  it("updates status, booked time, the calendar event id, and the remote-need flag", async () => {
    mockPagesUpdate.mockResolvedValue({});

    await finalizeBooking(
      "page-1",
      {
        start: "2026-07-13T14:00:00+08:00",
        end: "2026-07-13T15:00:00+08:00",
        calendarEventId: "event-123",
        needsRemote: true,
      },
      testConfig,
    );

    expect(mockPagesUpdate).toHaveBeenCalledWith({
      page_id: "page-1",
      properties: {
        Status: { status: { name: BOOKED_STATUS } },
        BookedTime: {
          date: { start: "2026-07-13T14:00:00+08:00", end: "2026-07-13T15:00:00+08:00" },
        },
        CalendarEventId: { rich_text: [{ text: { content: "event-123" } }] },
        NeedsRemote: { checkbox: true },
      },
    });
  });
});
