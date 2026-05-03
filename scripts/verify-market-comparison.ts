import assert from "node:assert/strict";

import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import type {
  AuditIssueType,
  BusinessBreakdown,
  LeadOpportunity,
  ScoutRunReport
} from "../packages/domain/src/model.ts";
import { buildMarketComparison } from "../apps/webapp/src/lib/server/market-comparison.ts";

const intent = resolveMarketIntent({
  rawQuery: "website repair shops in Winston-Salem, NC"
});

function business(input: {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  searchRank: number;
  findingCount: number;
  highSeverityFindings: number;
  topIssues: AuditIssueType[];
}): BusinessBreakdown {
  return {
    candidateId: input.candidateId,
    businessName: input.businessName,
    primaryUrl: input.primaryUrl,
    searchRank: input.searchRank,
    presenceType: "owned_website",
    presenceQuality: "weak",
    opportunityTypes: ["rebuild"],
    confidence: "confirmed",
    findingCount: input.findingCount,
    highSeverityFindings: input.highSeverityFindings,
    audited: true,
    auditStatus: "audited",
    topIssues: input.topIssues,
    secondaryUrls: [],
    detectionNotes: []
  };
}

function lead(input: {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  priorityScore: number;
}): LeadOpportunity {
  return {
    candidateId: input.candidateId,
    businessName: input.businessName,
    primaryUrl: input.primaryUrl,
    presenceType: "owned_website",
    presenceQuality: "weak",
    opportunityTypes: ["rebuild"],
    confidence: "confirmed",
    priorityScore: input.priorityScore,
    reasons: ["Verification lead."]
  };
}

function summary(
  businesses: BusinessBreakdown[],
  commonIssues: Array<{ issueType: AuditIssueType; count: number }>
): ScoutRunReport["summary"] {
  return {
    totalCandidates: businesses.length,
    auditedPresences: businesses.length,
    skippedPresences: 0,
    sampleQuality: "adequate_sample",
    presenceBreakdown: {
      owned_website: businesses.length,
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
      weak: businesses.length,
      functional: 0,
      broken: 0,
      strong: 0
    },
    commonIssues
  };
}

function report(input: {
  runId: string;
  createdAt: string;
  businesses: BusinessBreakdown[];
  shortlist: LeadOpportunity[];
  commonIssues: Array<{ issueType: AuditIssueType; count: number }>;
}): ScoutRunReport {
  return {
    schemaVersion: 2,
    runId: input.runId,
    status: "completed",
    createdAt: input.createdAt,
    query: {
      rawQuery: "website repair shops in Winston-Salem, NC"
    },
    intent,
    acquisition: {
      ...createEmptyAcquisitionDiagnostics("verification"),
      sampleQuality: "adequate_sample"
    },
    searchSource: "verification",
    candidates: [],
    presences: [],
    findings: [],
    classifications: [],
    businessBreakdowns: input.businesses,
    shortlist: input.shortlist,
    summary: summary(input.businesses, input.commonIssues),
    notes: []
  };
}

const previousAlpha = business({
  candidateId: "alpha",
  businessName: "Alpha Sites",
  primaryUrl: "https://alpha.example/",
  searchRank: 1,
  findingCount: 1,
  highSeverityFindings: 0,
  topIssues: ["missing_contact_path"]
});
const previousBeta = business({
  candidateId: "beta",
  businessName: "Beta Web",
  primaryUrl: "https://beta.example/",
  searchRank: 2,
  findingCount: 3,
  highSeverityFindings: 1,
  topIssues: ["failed_request"]
});
const currentGamma = business({
  candidateId: "gamma",
  businessName: "Gamma Digital",
  primaryUrl: "https://gamma.example/",
  searchRank: 1,
  findingCount: 2,
  highSeverityFindings: 1,
  topIssues: ["accessibility_issue"]
});
const currentAlpha = business({
  candidateId: "alpha",
  businessName: "Alpha Sites",
  primaryUrl: "https://alpha.example/",
  searchRank: 2,
  findingCount: 4,
  highSeverityFindings: 2,
  topIssues: ["missing_primary_cta"]
});

const previous = report({
  runId: "previous-market-comparison",
  createdAt: "2026-01-01T00:00:00.000Z",
  businesses: [previousAlpha, previousBeta],
  shortlist: [
    lead({
      candidateId: "alpha",
      businessName: "Alpha Sites",
      primaryUrl: "https://alpha.example/",
      priorityScore: 80
    }),
    lead({
      candidateId: "beta",
      businessName: "Beta Web",
      primaryUrl: "https://beta.example/",
      priorityScore: 75
    })
  ],
  commonIssues: [
    { issueType: "failed_request", count: 2 },
    { issueType: "missing_contact_path", count: 1 }
  ]
});

const current = report({
  runId: "current-market-comparison",
  createdAt: "2026-02-01T00:00:00.000Z",
  businesses: [currentGamma, currentAlpha],
  shortlist: [
    lead({
      candidateId: "gamma",
      businessName: "Gamma Digital",
      primaryUrl: "https://gamma.example/",
      priorityScore: 90
    }),
    lead({
      candidateId: "alpha",
      businessName: "Alpha Sites",
      primaryUrl: "https://alpha.example/",
      priorityScore: 72
    })
  ],
  commonIssues: [
    { issueType: "missing_primary_cta", count: 4 },
    { issueType: "failed_request", count: 1 }
  ]
});

const comparison = buildMarketComparison(current, previous);

assert.equal(comparison.previousRunId, previous.runId);
assert.equal(comparison.currentRunId, current.runId);
assert.equal(comparison.candidateCountDelta, 0);
assert.equal(comparison.shortlistCountDelta, 0);
assert.equal(comparison.findingCountDelta, 2);
assert.equal(comparison.highSeverityFindingDelta, 2);
assert.deepEqual(
  comparison.newBusinesses.map((businessEntry) => businessEntry.businessName),
  ["Gamma Digital"]
);
assert.deepEqual(
  comparison.missingBusinesses.map((businessEntry) => businessEntry.businessName),
  ["Beta Web"]
);
assert.deepEqual(comparison.rankChanges, [
  {
    businessName: "Alpha Sites",
    primaryUrl: "https://alpha.example/",
    previousRank: 1,
    currentRank: 2,
    delta: -1
  }
]);
assert.deepEqual(comparison.findingChanges, [
  {
    businessName: "Alpha Sites",
    primaryUrl: "https://alpha.example/",
    previousFindingCount: 1,
    currentFindingCount: 4,
    findingDelta: 3,
    previousHighSeverityFindings: 0,
    currentHighSeverityFindings: 2,
    highSeverityDelta: 2,
    currentTopIssues: ["missing_primary_cta"]
  }
]);
assert(
  comparison.issueChanges.some(
    (issue) => issue.issueType === "missing_primary_cta" && issue.delta === 4
  )
);
assert(
  comparison.issueChanges.some(
    (issue) => issue.issueType === "failed_request" && issue.delta === -1
  )
);

console.log("Market comparison verification passed.");
