import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import type { ScoutRunReport } from "../packages/domain/src/model.ts";

import { saveOutreachDraftEdit, getOutreachWorkspaceState } from "../apps/webapp/src/lib/server/outreach/outreach-service.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-outreach-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const query = {
  rawQuery: "outreach verification shop in Winston-Salem, NC"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");

const candidate = {
  candidateId: "lead-1",
  rank: 1,
  title: "Outreach Verification Shop",
  url: "https://verification.example.com/",
  domain: "verification.example.com",
  snippet: "Verification-owned website.",
  source: "verification"
} as const;

try {
  await applyScoutSchema();

  await repository.createQueuedRun({
    runId,
    createdAt: createdAt.toISOString(),
    input: query,
    intent
  });

  const report: ScoutRunReport = {
    schemaVersion: 2,
    runId,
    status: "completed",
    createdAt: createdAt.toISOString(),
    query,
    intent,
    acquisition,
    searchSource: "verification",
    candidates: [candidate],
    presences: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        domain: candidate.domain,
        searchRank: 1,
        presenceType: "owned_website",
        auditEligible: true,
        secondaryUrls: [],
        detectionNotes: ["Owned website verified for outreach persistence smoke coverage."]
      }
    ],
    findings: [
      {
        id: "finding-1",
        candidateId: candidate.candidateId,
        pageUrl: candidate.url,
        pageLabel: "homepage",
        viewport: "desktop",
        issueType: "missing_contact_path",
        severity: "high",
        confidence: "confirmed",
        message: "The homepage makes it hard to find a clear contact path.",
        reproductionNote: "Primary navigation lacked a visible contact or booking path."
      }
    ],
    classifications: [
      {
        candidateId: candidate.candidateId,
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        rationale: ["Deterministic verification rationale."]
      }
    ],
    businessBreakdowns: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        searchRank: 1,
        presenceType: "owned_website",
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        findingCount: 1,
        highSeverityFindings: 1,
        audited: true,
        auditStatus: "audited",
        topIssues: ["missing_contact_path"],
        secondaryUrls: [],
        detectionNotes: ["Homepage contact path issue confirmed."]
      }
    ],
    shortlist: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        presenceType: "owned_website",
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        priorityScore: 120,
        reasons: [
          "Confirmed browser and navigation friction make the site worth repair work.",
          "The current site leaves contact or conversion intent harder to find than it should."
        ]
      }
    ],
    summary: {
      totalCandidates: 1,
      auditedPresences: 1,
      skippedPresences: 0,
      sampleQuality: acquisition.sampleQuality,
      presenceBreakdown: {
        owned_website: 1,
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
        broken: 1,
        strong: 0
      },
      commonIssues: [
        {
          issueType: "missing_contact_path",
          count: 1
        }
      ]
    },
    notes: ["Outreach verification run."]
  };

  await repository.save(report);

  const saved = await saveOutreachDraftEdit({
    runId,
    candidateId: candidate.candidateId,
    tone: "calm",
    length: "brief",
    subjectLine: "A quick website note for Outreach Verification Shop",
    body: "I took a look at your site and noticed it may be harder than it should be for visitors to find a clear contact path from the homepage. If helpful, I can share a couple concrete fixes that would make that path easier to spot and act on."
  });

  if (saved.draft.candidateId !== candidate.candidateId) {
    throw new Error("Scout did not save the outreach draft for the expected candidate.");
  }

  const workspace = await getOutreachWorkspaceState(runId);
  if (!workspace.drafts.some((draft) => draft.candidateId === candidate.candidateId)) {
    throw new Error("Scout outreach workspace did not return the saved local draft.");
  }

  console.log("Outreach persistence verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_outreach_drafts where run_id = ${runId}`;
  await sql`delete from scout_runs where run_id = ${runId}`;
  await closeScoutSchemaClient();
}
