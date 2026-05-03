import assert from "node:assert/strict";

import {
  cancelScoutRun,
  cleanupStaleScoutRuns,
  retryScoutRun,
  submitScoutRun
} from "../apps/webapp/src/lib/server/scout-runner.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const sql = getPostgresClient();
const runIds: string[] = [];

try {
  await applyScoutSchema();

  const run = await submitScoutRun({
    rawQuery: "run control verification in Winston-Salem, NC"
  });
  runIds.push(run.runId);

  assert.equal(run.status, "queued");
  assert.equal(run.execution.stage, "queued");
  assert.equal(run.selectedCandidates.length, 0);
  assert.equal(run.shortlist.length, 0);

  const canceled = await cancelScoutRun(run.runId);
  assert(canceled);
  assert.equal(canceled.status, "failed");
  assert.equal(canceled.execution.stage, "failed");
  assert.equal(canceled.execution.lastErrorMessage, "Run canceled by operator.");

  const retried = await retryScoutRun(run.runId);
  assert(retried);
  assert.equal(retried.status, "queued");
  assert.equal(retried.execution.stage, "queued");
  assert.equal(retried.execution.attemptCount, 0);
  assert.equal(retried.execution.workerNote, "Run manually re-queued by operator.");
  assert.equal(retried.acquisition, null);
  assert.equal(retried.businessResults, null);
  assert.deepEqual(retried.selectedCandidates, []);
  assert.deepEqual(retried.shortlist, []);

  await sql`
    update scout_runs
    set
      status = 'running',
      updated_at = now() - interval '45 days',
      started_at = now() - interval '45 days',
      heartbeat_at = now() - interval '45 days',
      attempt_count = 1,
      worker_stage = 'auditing_websites',
      worker_id = 'verify-run-controls-worker',
      worker_note = 'Run control verification is simulating a stale worker.'
    where run_id = ${run.runId}
  `;

  const requeuedCount = await cleanupStaleScoutRuns(30 * 24 * 60 * 60 * 1000);
  assert(requeuedCount >= 1);

  const [staleRecovery] = await sql<
    Array<{
      status: string;
      worker_stage: string | null;
      worker_id: string | null;
      worker_note: string | null;
      last_error_message: string | null;
    }>
  >`
    select status, worker_stage, worker_id, worker_note, last_error_message
    from scout_runs
    where run_id = ${run.runId}
  `;
  assert(staleRecovery);
  assert.equal(staleRecovery.status, "queued");
  assert.equal(staleRecovery.worker_stage, "queued");
  assert.equal(staleRecovery.worker_id, null);
  assert.match(staleRecovery.worker_note ?? "", /re-queued/);
  assert.match(staleRecovery.last_error_message ?? "", /re-queued/);

  const rerun = await submitScoutRun(retried.input);
  runIds.push(rerun.runId);
  assert.equal(rerun.status, "queued");
  assert.equal(rerun.input.rawQuery, retried.input.rawQuery);
  assert.notEqual(rerun.runId, run.runId);

  console.log("Run controls verification passed.");
} finally {
  if (runIds.length > 0) {
    await sql`delete from scout_runs where run_id = any(${sql.array(runIds)})`;
  }

  await closeScoutSchemaClient();
}
