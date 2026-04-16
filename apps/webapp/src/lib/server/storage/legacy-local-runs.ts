import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRunFileName } from "@scout/privacy";

import {
  type PersistedRunRecord,
  upgradeLegacyLocalRecord
} from "./persisted-run-record.ts";

function getRuntimeRoot(): string {
  const configuredRoot = process.env.SCOUT_RUNTIME_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
}

export interface LegacyRunImportCandidate {
  filePath: string;
  fileName: string;
  record: PersistedRunRecord;
}

export function getLegacyRunsDir(): string {
  return path.resolve(getRuntimeRoot(), "data/runs");
}

async function readLegacyRunRecordFromFile(filePath: string): Promise<PersistedRunRecord | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const record = upgradeLegacyLocalRecord(JSON.parse(raw), filePath);

    if (!record) {
      return null;
    }

    return {
      ...record,
      persistence: {
        ...record.persistence,
        importedFromLegacyLocal: true,
        importSourcePath: filePath,
        importedAt: record.persistence.importedAt ?? new Date().toISOString()
      }
    };
  } catch {
    return null;
  }
}

export async function readLegacyRunRecord(runId: string): Promise<PersistedRunRecord | null> {
  const filePath = path.resolve(getLegacyRunsDir(), buildRunFileName(runId));
  return readLegacyRunRecordFromFile(filePath);
}

export async function listLegacyRunImportCandidates(): Promise<LegacyRunImportCandidate[]> {
  try {
    const entries = await readdir(getLegacyRunsDir(), { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const filePath = path.resolve(getLegacyRunsDir(), entry.name);
          const record = await readLegacyRunRecordFromFile(filePath);

          if (!record) {
            return null;
          }

          return {
            filePath,
            fileName: entry.name,
            record
          } satisfies LegacyRunImportCandidate;
        })
    );

    return candidates.filter((candidate): candidate is LegacyRunImportCandidate => Boolean(candidate));
  } catch {
    return [];
  }
}
