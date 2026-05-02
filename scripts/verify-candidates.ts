import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";

import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import type { ScoutRunReport } from "../packages/domain/src/model.ts";

import {
  addManualCandidateToRun,
  promoteDiscardedCandidateToRun
} from "../apps/webapp/src/lib/server/candidates/candidate-additions.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-candidates-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const query = {
  rawQuery: "candidate verification shop in Winston-Salem, NC"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");

const server = createServer((request, response) => {
  const pageName = (request.url ?? "/").includes("promoted")
    ? "Promoted Verification Shop"
    : "Manual Verification Shop";

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <html lang="en">
      <body>
        <main>
          <h1>${pageName}</h1>
          <p>Local candidate verification target.</p>
          <a href="/contact">Contact</a>
          <a href="mailto:owner@candidate-verification.example">Email us</a>
          <button>Schedule service</button>
        </main>
      </body>
    </html>`);
});

await new Promise<void>((resolve, reject) => {
  server.listen(0, "127.0.0.1", () => resolve());
  server.once("error", reject);
});

const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Candidate verification server did not expose a usable port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;
acquisition.discardedCandidates = [
  {
    candidateId: "discarded-1",
    reason: "Verification discarded fixture.",
    title: "Promoted Verification Shop",
    url: `${baseUrl}/promoted`,
    domain: "127.0.0.1",
    snippet: "Promotable discarded fixture.",
    source: "verification"
  }
];
acquisition.discardedCandidateCount = 1;

try {
  await applyScoutSchema();

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
    notes: ["Candidate verification run."]
  };

  await repository.save(report);

  const withManual = await addManualCandidateToRun({
    runId,
    businessName: "Manual Verification Shop",
    url: `${baseUrl}/manual`
  });

  if (!withManual.candidates.some((candidate) => candidate.provenance === "manual")) {
    throw new Error("Manual candidate was not added to the report.");
  }

  const withPromoted = await promoteDiscardedCandidateToRun({
    runId,
    discardedCandidateId: "discarded-1"
  });

  if (
    !withPromoted.candidates.some((candidate) => candidate.provenance === "promoted_discarded")
  ) {
    throw new Error("Discarded candidate was not promoted into the report.");
  }

  if (withPromoted.summary.totalCandidates !== 2) {
    throw new Error("Candidate additions did not rebuild the report summary.");
  }

  console.log("Candidate addition verification passed.");
} finally {
  server.close();
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${runId}`;
  await rm(path.resolve("data", "evidence", runId), {
    recursive: true,
    force: true
  });
  await closeScoutSchemaClient();
}
