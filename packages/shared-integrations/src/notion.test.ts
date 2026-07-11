import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockDatabasesRetrieve,
  mockDataSourcesQuery,
  mockPagesCreate,
  mockPagesUpdate,
  MockClient,
} = vi.hoisted(() => {
  const databasesRetrieve = vi.fn();
  const dataSourcesQuery = vi.fn();
  const pagesCreate = vi.fn();
  const pagesUpdate = vi.fn();

  class ClientStub {
    databases = { retrieve: databasesRetrieve };
    dataSources = { query: dataSourcesQuery };
    pages = { create: pagesCreate, update: pagesUpdate };
  }

  return {
    mockDatabasesRetrieve: databasesRetrieve,
    mockDataSourcesQuery: dataSourcesQuery,
    mockPagesCreate: pagesCreate,
    mockPagesUpdate: pagesUpdate,
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
  PENDING_INVITATION_STATUS,
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
  mockDatabasesRetrieve.mockResolvedValue({
    data_sources: [{ id: "test-data-source-id" }],
  });
});

describe("syncCandidatesToNotion", () => {
  it("creates a new page for a candidate with no existing entry", async () => {
    mockDataSourcesQuery.mockResolvedValue({ results: [] });
    mockPagesCreate.mockResolvedValue({ id: "new-page-id" });

    const result = await syncCandidatesToNotion(
      [{ sourceRowIndex: 2, name: "Alice", email: "alice@example.com", reason: "matches" }],
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
      [{ sourceRowIndex: 2, name: "Alice", email: "alice@example.com", reason: "matches" }],
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
        { sourceRowIndex: 2, name: "Alice", email: "a@example.com", reason: "r" },
        { sourceRowIndex: 3, name: "Bob", email: "b@example.com", reason: "r" },
      ],
      testConfig,
    );

    expect(result.created).toBe(1);
    expect(result.failed).toEqual([{ sourceRowIndex: 2, error: "notion down" }]);
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
