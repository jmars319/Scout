import type { ScoutRunReport } from "@scout/domain";

import { readLegacyRunRecord } from "./legacy-local-runs.ts";
import {
  createPostgresRunRepository,
  type RecentRunSummary,
  type SavedMarketSummary
} from "./postgres-run-repository.ts";
import {
  type PersistedRunRecord,
  type PersistenceMetadataInput,
  type QueuedRunRecordInput,
  toScoutRunReport
} from "./persisted-run-record.ts";

export type { PersistedRunRecord, RecentRunSummary, SavedMarketSummary };

export interface RunRepository {
  createQueuedRun: (input: QueuedRunRecordInput) => Promise<PersistedRunRecord>;
  claimNextQueuedRun: (workerId: string) => Promise<PersistedRunRecord | null>;
  requeueStaleRuns: (staleRunMs: number) => Promise<number>;
  updateProgress: (
    runId: string,
    progress: {
      stage?: PersistedRunRecord["execution"]["stage"];
      workerNote?: string;
    }
  ) => Promise<PersistedRunRecord | null>;
  save: (
    report: ScoutRunReport,
    persistence?: PersistenceMetadataInput
  ) => Promise<PersistedRunRecord>;
  upsertRecord: (record: PersistedRunRecord) => Promise<PersistedRunRecord>;
  get: (runId: string) => Promise<ScoutRunReport | null>;
  getRecord: (runId: string) => Promise<PersistedRunRecord | null>;
  listRecent: (limit?: number) => Promise<RecentRunSummary[]>;
  listSavedMarkets: (limit?: number) => Promise<SavedMarketSummary[]>;
}

export function createRunRepository(): RunRepository {
  const postgresRepository = createPostgresRunRepository();

  async function getRecord(runId: string): Promise<PersistedRunRecord | null> {
    const record = await postgresRepository.getRecord(runId);

    if (record) {
      return record;
    }

    const legacyRecord = await readLegacyRunRecord(runId);
    if (!legacyRecord) {
      return null;
    }

    return postgresRepository.upsertRecord(legacyRecord);
  }

  return {
    createQueuedRun: (input) => postgresRepository.createQueuedRun(input),
    claimNextQueuedRun: (workerId) => postgresRepository.claimNextQueuedRun(workerId),
    requeueStaleRuns: (staleRunMs) => postgresRepository.requeueStaleRuns(staleRunMs),
    updateProgress: (runId, progress) => postgresRepository.updateProgress(runId, progress),
    save: (report, persistence) => postgresRepository.save(report, persistence),
    upsertRecord: (record) => postgresRepository.upsertRecord(record),

    async get(runId) {
      const record = await getRecord(runId);
      return record ? toScoutRunReport(record) : null;
    },

    getRecord,
    listRecent: (limit) => postgresRepository.listRecent(limit),
    listSavedMarkets: (limit) => postgresRepository.listSavedMarkets(limit)
  };
}
