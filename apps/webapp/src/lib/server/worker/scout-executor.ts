import { chromium } from "playwright";

import {
  runScout,
  type RunExecutionStage,
  type ScoutRunReport
} from "@scout/domain";

import { createPlaywrightAuditor } from "../audit/playwright-auditor.ts";
import { buildFailedReport } from "../report/failed-report.ts";
import { detectPresence } from "../search/presence-detector.ts";
import { ScoutAcquisitionFailure, createSearchProvider } from "../search/provider.ts";
import { createEvidenceStorage } from "../storage/evidence-storage.ts";
import {
  normalizePersistedIntent,
  type PersistedRunRecord
} from "../storage/persisted-run-record.ts";

export async function executeScoutRunRecord(
  record: Pick<PersistedRunRecord, "runId" | "createdAt" | "input" | "intent">,
  onProgress?: (update: {
    stage: RunExecutionStage;
    workerNote: string;
  }) => Promise<void>
): Promise<ScoutRunReport> {
  const createdAt = new Date(record.createdAt);
  const evidenceStorage = createEvidenceStorage();
  const searchProvider = createSearchProvider();
  const browser = await chromium.launch({ headless: true });

  try {
    await onProgress?.({
      stage: "starting",
      workerNote: "Preparing Scout browser and storage dependencies."
    });
    const auditor = createPlaywrightAuditor({
      browser,
      evidenceStorage,
      runId: record.runId
    });

    try {
      return await runScout(record.input, {
        resolveIntent: () => normalizePersistedIntent(record.intent),
        searchCandidates: (intent) =>
          searchProvider.search(intent, (workerNote) =>
            onProgress?.({
              stage: "acquiring_candidates",
              workerNote
            })
          ),
        detectPresence,
        auditPresence: (presence, intent) => auditor.auditPresence(presence, intent),
        ...(onProgress ? { onProgress } : {}),
        now: () => createdAt,
        generateRunId: () => record.runId
      });
    } catch (error) {
      if (error instanceof ScoutAcquisitionFailure) {
        return buildFailedReport({
          runId: record.runId,
          query: record.input,
          intent: normalizePersistedIntent(record.intent),
          createdAt,
          acquisition: error.diagnostics,
          searchSource: error.searchSource,
          notes: error.diagnostics.notes,
          errorMessage: error.message
        });
      }

      throw error;
    } finally {
      await searchProvider.dispose?.();
    }
  } finally {
    await browser.close();
  }
}
