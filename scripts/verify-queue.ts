import assert from "node:assert/strict";

import type { ScoutRunReport } from "../packages/domain/src/model.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
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
    acquisition: createEmptyAcquisitionDiagnostics("verification"),
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
  assert.equal(queuedRecord.execution.stage, "queued");
  assert.equal(queuedRecord.execution.workerNote, "Run stored and waiting for a worker.");
  assert(queuedRecord.execution.heartbeatAt);

  let observedRunningStatus: string | null = null;
  let observedRunningStage: string | null = null;
  let observedRunningNote: string | null = null;
  let observedRunningStartedAt: string | null = null;
  let observedRunningHeartbeatAt: string | null = null;

  await processNextQueuedRun({
    workerId: "verify-queue-worker",
    repository,
    executeRun: async (record, onProgress) => {
      await onProgress?.({
        stage: "acquiring_candidates",
        workerNote: "Queue verification is simulating live acquisition."
      });
      const runningRecord = await repository.getRecord(record.runId);
      if (!runningRecord) {
        throw new Error("Queue verification could not reload the running record.");
      }
      observedRunningStatus = runningRecord.status;
      observedRunningStage = runningRecord.execution.stage ?? null;
      observedRunningNote = runningRecord.execution.workerNote ?? null;
      observedRunningStartedAt = runningRecord.execution.startedAt ?? null;
      observedRunningHeartbeatAt = runningRecord.execution.heartbeatAt ?? null;
      return buildVerificationReport(record.runId, record.createdAt);
    }
  });

  assert.equal(observedRunningStatus, "running");
  assert.equal(observedRunningStage, "acquiring_candidates");
  assert.equal(observedRunningNote, "Queue verification is simulating live acquisition.");
  assert(observedRunningStartedAt);
  assert(observedRunningHeartbeatAt);

  const completedRecord = await repository.getRecord(firstRunId);
  assert(completedRecord);
  assert.equal(completedRecord.status, "completed");
  assert.equal(completedRecord.execution.attemptCount, 1);
  assert.equal(completedRecord.execution.stage, "completed");
  assert.equal(completedRecord.execution.workerNote, "Run completed and report saved.");
  assert(completedRecord.execution.startedAt);
  assert(completedRecord.execution.finishedAt);
  assert(completedRecord.execution.heartbeatAt);

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
  assert.equal(failedRecord.execution.stage, "failed");
  assert.equal(failedRecord.execution.workerNote, "Queue verification failure.");
  assert.equal(failedRecord.execution.lastErrorMessage, "Queue verification failure.");

  console.log("Queue verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${firstRunId} or run_id = ${secondRunId}`;
  await closeScoutSchemaClient();
}
