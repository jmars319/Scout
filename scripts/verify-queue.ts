import assert from "node:assert/strict";

import type { ScoutRunReport } from "../packages/domain/src/model.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";
import { processNextQueuedRun } from "../apps/webapp/src/lib/server/worker/scout-worker.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

function buildVerificationReport(runId: string, createdAt: string): ScoutRunReport {
  const query = {
    rawQuery: "queue verification"
  };
  const intent = resolveMarketIntent(query);

  return {
    schemaVersion: 2,
    runId,
    status: "completed",
    createdAt,
    query,
    intent,
    acquisition: {
      provider: "verification",
      fallbackUsed: false,
      rawCandidateCount: 0,
      selectedCandidateCount: 0,
      liveCandidateCount: 0,
      fallbackCandidateCount: 0,
      mergedDuplicateCount: 0,
      discardedCandidateCount: 0,
      sampleQuality: "weak_sample",
      queryVariants: [],
      mergedDuplicates: [],
      discardedCandidates: [],
      notes: []
    },
    searchSource: "verification",
    candidates: [],
    presences: [],
    findings: [],
    classifications: [],
    businessBreakdowns: [],
    shortlist: [],
    summary: {
      totalCandidates: 0,
      auditedPresences: 0,
      skippedPresences: 0,
      sampleQuality: "weak_sample",
      presenceBreakdown: {
        owned_website: 0,
        facebook_only: 0,
        yelp_only: 0,
        directory_only: 0,
        marketplace: 0,
        dead: 0,
        blocked: 0,
        unknown: 0
      },
      qualityBreakdown: {
        none: 0,
        weak: 0,
        functional: 0,
        broken: 0,
        strong: 0
      },
      commonIssues: []
    },
    notes: ["Queue verification run."]
  };
}

const repository = createRunRepository();
const createdAt = new Date();
const firstRunId = `verify-queue-success-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const secondRunId = `verify-queue-failure-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const query = {
  rawQuery: "queue verification"
};
const intent = resolveMarketIntent(query);

try {
  await applyScoutSchema();

  await repository.createQueuedRun({
    runId: firstRunId,
    createdAt: createdAt.toISOString(),
    input: query,
    intent
  });

  const queuedRecord = await repository.getRecord(firstRunId);
  assert(queuedRecord);
  assert.equal(queuedRecord.status, "queued");
  assert.equal(queuedRecord.execution.attemptCount, 0);

  await processNextQueuedRun({
    workerId: "verify-queue-worker",
    repository,
    executeRun: (record) => Promise.resolve(buildVerificationReport(record.runId, record.createdAt))
  });

  const completedRecord = await repository.getRecord(firstRunId);
  assert(completedRecord);
  assert.equal(completedRecord.status, "completed");
  assert.equal(completedRecord.execution.attemptCount, 1);
  assert(completedRecord.execution.startedAt);
  assert(completedRecord.execution.finishedAt);

  await repository.createQueuedRun({
    runId: secondRunId,
    createdAt: new Date(createdAt.getTime() + 1_000).toISOString(),
    input: query,
    intent
  });

  await processNextQueuedRun({
    workerId: "verify-queue-worker",
    repository,
    executeRun: () => Promise.reject(new Error("Queue verification failure."))
  });

  const failedRecord = await repository.getRecord(secondRunId);
  assert(failedRecord);
  assert.equal(failedRecord.status, "failed");
  assert.equal(failedRecord.execution.attemptCount, 1);
  assert.equal(failedRecord.execution.lastErrorMessage, "Queue verification failure.");

  console.log("Queue verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${firstRunId} or run_id = ${secondRunId}`;
  await closeScoutSchemaClient();
}
