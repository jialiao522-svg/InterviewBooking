import {
  readSheetRows,
  writeSheetTags,
  syncCandidatesToNotion,
  getSheetsConfig,
  SheetRow,
  TagWrite,
} from "@interview-platform/shared-integrations";

export interface CliDeps {
  readSheetRows: typeof readSheetRows;
  writeSheetTags: typeof writeSheetTags;
  syncCandidatesToNotion: typeof syncCandidatesToNotion;
  getSheetsConfig: typeof getSheetsConfig;
}

export const defaultCliDeps: CliDeps = {
  readSheetRows,
  writeSheetTags,
  syncCandidatesToNotion,
  getSheetsConfig,
};

export interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

interface SyncCandidateInput {
  row_index: number;
  name: string;
  email: string;
  reason: string;
}

function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function errorResult(error: unknown): CliResult {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 1, stderr: JSON.stringify({ error: message }) };
}

function parseJsonFlag<T>(args: string[], flag: string): { value: T } | { error: CliResult } {
  const raw = getFlag(args, flag);
  if (raw === undefined) {
    return { error: { exitCode: 1, stderr: JSON.stringify({ error: `Missing required flag: ${flag}` }) } };
  }
  try {
    return { value: JSON.parse(raw) as T };
  } catch {
    return { error: { exitCode: 1, stderr: JSON.stringify({ error: `Invalid JSON for ${flag}` }) } };
  }
}

async function runReadRows(args: string[], deps: CliDeps): Promise<CliResult> {
  const sheetName = getFlag(args, "--sheet-name");
  try {
    const rows = await deps.readSheetRows(undefined, sheetName);
    return { exitCode: 0, stdout: JSON.stringify(rows) };
  } catch (error) {
    return errorResult(error);
  }
}

async function runWriteTags(args: string[], deps: CliDeps): Promise<CliResult> {
  const parsed = parseJsonFlag<TagWrite[]>(args, "--rows");
  if ("error" in parsed) {
    return parsed.error;
  }

  const sheetName = getFlag(args, "--sheet-name");
  try {
    const result = await deps.writeSheetTags(parsed.value, undefined, sheetName);
    return { exitCode: 0, stdout: JSON.stringify(result) };
  } catch (error) {
    return errorResult(error);
  }
}

async function runSyncNotion(args: string[], deps: CliDeps): Promise<CliResult> {
  const parsed = parseJsonFlag<SyncCandidateInput[]>(args, "--candidates");
  if ("error" in parsed) {
    return parsed.error;
  }

  const sheetName = getFlag(args, "--sheet-name");
  try {
    const { tagColumnHeader, reasonColumnHeader } = deps.getSheetsConfig();
    const rows = await deps.readSheetRows(undefined, sheetName);
    const rowsByIndex = new Map<number, SheetRow>(rows.map((row) => [row.row_index, row]));

    const syncInputs: Parameters<typeof deps.syncCandidatesToNotion>[0] = [];
    const missingRowFailures: { sourceRowIndex: number; error: string }[] = [];

    for (const candidate of parsed.value) {
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
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        ...result,
        failed: [...result.failed, ...missingRowFailures],
      }),
    };
  } catch (error) {
    return errorResult(error);
  }
}

export async function runCli(argv: string[], deps: CliDeps = defaultCliDeps): Promise<CliResult> {
  const [command, ...args] = argv;

  switch (command) {
    case "read-rows":
      return runReadRows(args, deps);
    case "write-tags":
      return runWriteTags(args, deps);
    case "sync-notion":
      return runSyncNotion(args, deps);
    default:
      return { exitCode: 1, stderr: JSON.stringify({ error: `Unknown command: ${String(command)}` }) };
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((result) => {
    if (result.stdout !== undefined) {
      // eslint-disable-next-line no-console
      console.log(result.stdout);
    }
    if (result.stderr !== undefined) {
      // eslint-disable-next-line no-console
      console.error(result.stderr);
    }
    process.exitCode = result.exitCode;
  });
}
