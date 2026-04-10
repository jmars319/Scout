import { chromium } from "playwright";

import { runScout, type ScoutRunReport } from "@scout/domain";

import { createPlaywrightAuditor } from "../audit/playwright-auditor.ts";
import { detectPresence } from "../search/presence-detector.ts";
import { createSearchProvider } from "../search/provider.ts";
import { createEvidenceStorage } from "../storage/evidence-storage.ts";
import {
  normalizePersistedIntent,
  type PersistedRunRecord
} from "../storage/persisted-run-record.ts";

export async function executeScoutRunRecord(
  record: Pick<PersistedRunRecord, "runId" | "createdAt" | "input" | "intent">
): Promise<ScoutRunReport> {
  const createdAt = new Date(record.createdAt);
  const evidenceStorage = createEvidenceStorage();
  const searchProvider = createSearchProvider();
  const browser = await chromium.launch({ headless: true });

  try {
    const auditor = createPlaywrightAuditor({
      browser,
      evidenceStorage,
      runId: record.runId
    });

    return await runScout(record.input, {
      resolveIntent: () => normalizePersistedIntent(record.intent),
      searchCandidates: (intent) => searchProvider.search(intent),
      detectPresence,
      auditPresence: (presence, intent) => auditor.auditPresence(presence, intent),
      now: () => createdAt,
      generateRunId: () => record.runId
    });
  } finally {
    await browser.close();
  }
}
