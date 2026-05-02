import assert from "node:assert/strict";

import type { ScoutRunReport } from "../packages/domain/src/model.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";

import { buildLeadExport } from "../apps/webapp/src/lib/server/leads/lead-export-service.ts";
import {
  getLeadAnnotations,
  saveLeadAnnotation
} from "../apps/webapp/src/lib/server/leads/lead-workflow-service.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-leads-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const candidateId = "lead-workflow-candidate";
const query = {
  rawQuery: "lead workflow verification shop in Winston-Salem, NC"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");

acquisition.rawCandidateCount = 1;
acquisition.selectedCandidateCount = 1;
acquisition.liveCandidateCount = 1;
acquisition.candidateSources = [
  {
    source: "verification",
    kind: "live",
    rawCandidateCount: 1,
    selectedCandidateCount: 1
  }
];

const report: ScoutRunReport = {
  schemaVersion: 2,
  runId,
  status: "completed",
  createdAt: createdAt.toISOString(),
  query,
  intent,
  acquisition,
  searchSource: "verification",
  candidates: [
    {
      candidateId,
      rank: 1,
      title: "Lead Workflow Verification Shop",
      url: "https://lead-workflow.example",
      domain: "lead-workflow.example",
      snippet: "Lead workflow verification fixture.",
      source: "verification"
    }
  ],
  presences: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      domain: "lead-workflow.example",
      searchRank: 1,
      presenceType: "owned_website",
      auditEligible: true,
      secondaryUrls: [],
      detectionNotes: ["Owned website fixture for lead workflow verification."]
    }
  ],
  findings: [
    {
      id: "lead-workflow-finding",
      candidateId,
      pageUrl: "https://lead-workflow.example",
      pageLabel: "homepage",
      viewport: "desktop",
      issueType: "missing_contact_path",
      severity: "high",
      confidence: "confirmed",
      message: "Contact path is not visible.",
      reproductionNote: "The fixture records a deterministic contact gap."
    }
  ],
  classifications: [
    {
      candidateId,
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      rationale: ["Verification fixture should rank as a lead."]
    }
  ],
  businessBreakdowns: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      searchRank: 1,
      presenceType: "owned_website",
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      findingCount: 1,
      highSeverityFindings: 1,
      audited: true,
      auditStatus: "audited",
      topIssues: ["missing_contact_path"],
      secondaryUrls: [],
      detectionNotes: ["Owned website fixture for lead workflow verification."]
    }
  ],
  shortlist: [
    {
      candidateId,
      businessName: "Lead Workflow Verification Shop",
      primaryUrl: "https://lead-workflow.example",
      presenceType: "owned_website",
      presenceQuality: "weak",
      opportunityTypes: ["rebuild"],
      confidence: "confirmed",
      priorityScore: 84,
      reasons: ["Contact path is not visible."]
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
      weak: 1,
      functional: 0,
      broken: 0,
      strong: 0
    },
    commonIssues: [
      {
        issueType: "missing_contact_path",
        count: 1
      }
    ]
  },
  notes: ["Lead workflow verification run."]
};

try {
  await applyScoutSchema();
  await repository.save(report);

  const saved = await saveLeadAnnotation({
    runId,
    candidateId,
    state: "saved",
    operatorNote: "Follow up with the owner after reviewing the contact gap.",
    followUpDate: "2026-05-06"
  });

  assert.equal(saved.state, "saved");
  assert.equal(saved.followUpDate, "2026-05-06");

  const annotations = await getLeadAnnotations(runId);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0]?.operatorNote, "Follow up with the owner after reviewing the contact gap.");

  const updated = await saveLeadAnnotation({
    runId,
    candidateId,
    state: "contacted",
    operatorNote: "Called the listed number.",
    followUpDate: null
  });

  assert.equal(updated.state, "contacted");
  assert.equal(updated.followUpDate, undefined);

  const csvExport = await buildLeadExport({
    runId,
    format: "csv"
  });
  assert.match(csvExport.contentType, /text\/csv/);
  assert.match(csvExport.body, /Lead Workflow Verification Shop/);
  assert.match(csvExport.body, /Contacted/);

  const markdownExport = await buildLeadExport({
    runId,
    format: "markdown"
  });
  assert.match(markdownExport.contentType, /text\/markdown/);
  assert.match(markdownExport.body, /# Scout Leads:/);
  assert.match(markdownExport.body, /Called the listed number\./);

  console.log("Lead workflow verification passed.");
} finally {
  const sql = getPostgresClient();
  await sql`delete from scout_runs where run_id = ${runId}`;
  await closeScoutSchemaClient();
}
