import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import type { ScoutRunReport } from "../packages/domain/src/model.ts";

import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-postgres-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const query = {
  rawQuery: "persistence smoke check"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");

try {
  await applyScoutSchema();

  await repository.createQueuedRun({
    runId,
    createdAt: createdAt.toISOString(),
    input: query,
    intent
  });

  const createdRecord = await repository.getRecord(runId);
  if (!createdRecord || createdRecord.status !== "queued") {
    throw new Error("Failed to create a queued Scout run record in Postgres.");
  }

  const report: ScoutRunReport = {
    schemaVersion: 2,
    runId,
    status: "completed",
    createdAt: createdAt.toISOString(),
    query,
    intent,
    acquisition,
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
      sampleQuality: acquisition.sampleQuality,
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
    notes: ["Persistence verification run."]
  };

  await repository.save(report);

  const savedReport = await repository.get(runId);
  if (!savedReport || savedReport.runId !== runId || savedReport.status !== "completed") {
    throw new Error("Failed to round-trip a completed Scout run report through Postgres.");
  }

  const recentRuns = await repository.listRecent(5);
  if (!recentRuns.some((recentRun) => recentRun.runId === runId)) {
    throw new Error("Recent Scout runs did not include the verification record.");
  }

  console.log("Postgres persistence verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${runId}`;
  await closeScoutSchemaClient();
}
