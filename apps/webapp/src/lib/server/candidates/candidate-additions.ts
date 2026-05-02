import { chromium } from "playwright";

import {
  buildBusinessBreakdowns,
  buildLeadShortlist,
  buildRunSummary,
  classifyBusiness,
  emptyAuditResult,
  type CandidateProvenanceKind,
  type PresenceAuditResult,
  type ScoutRunReport,
  type SearchCandidate
} from "@scout/domain";

import { createPlaywrightAuditor } from "../audit/playwright-auditor.ts";
import { detectPresence } from "../search/presence-detector.ts";
import { canonicalizeUrl } from "../search/canonicalize.ts";
import { createEvidenceStorage } from "../storage/evidence-storage.ts";
import {
  createPersistedRunRecord,
  type PersistedRunRecord
} from "../storage/persisted-run-record.ts";
import { createRunRepository } from "../storage/run-repository.ts";

export interface AddManualCandidateInput {
  runId: string;
  businessName: string;
  url: string;
}

export interface PromoteDiscardedCandidateInput {
  runId: string;
  discardedCandidateId: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function normalizeInputUrl(value: string): string {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return canonicalizeUrl(withProtocol).canonicalUrl;
}

function buildCandidateId(provenance: CandidateProvenanceKind, title: string, url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `${provenance}-${Date.now()}-${slugify(`${title}-${host}`) || "candidate"}`;
}

function createCandidate(input: {
  title: string;
  url: string;
  source: string;
  rank: number;
  provenance: CandidateProvenanceKind;
  snippet: string;
  provenanceNote: string;
  extractedFromCandidateId?: string;
}): SearchCandidate {
  const url = normalizeInputUrl(input.url);
  const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

  return {
    candidateId: buildCandidateId(input.provenance, input.title, url),
    rank: input.rank,
    title: input.title.trim() || domain,
    url,
    domain,
    snippet: input.snippet,
    source: input.source,
    provenance: input.provenance,
    provenanceNote: input.provenanceNote,
    ...(input.extractedFromCandidateId
      ? { extractedFromCandidateId: input.extractedFromCandidateId }
      : {})
  };
}

function rebuildReport(
  report: ScoutRunReport,
  additions: {
    candidates: SearchCandidate[];
    presences: ScoutRunReport["presences"];
    audits: PresenceAuditResult[];
    notes: string[];
  }
): ScoutRunReport {
  const candidates = [...report.candidates, ...additions.candidates].map((candidate, index) => ({
    ...candidate,
    rank: index + 1
  }));
  const findings = [...report.findings, ...additions.audits.flatMap((audit) => audit.findings)];
  const auditTargetsByCandidate = new Map(
    additions.audits.map((audit) => [
      audit.candidateId,
      audit.targets
        .filter((target) => target.label === "secondary")
        .map((target) => target.url)
    ])
  );
  const presences = report.presences.map((presence) => ({
    ...presence,
    secondaryUrls: presence.secondaryUrls
  }));

  for (const presence of additions.presences) {
    if (!presences.some((existing) => existing.candidateId === presence.candidateId)) {
      presences.push(presence);
    }
  }

  const findingsByCandidate = new Map<string, ScoutRunReport["findings"]>();
  for (const finding of findings) {
    const current = findingsByCandidate.get(finding.candidateId) ?? [];
    current.push(finding);
    findingsByCandidate.set(finding.candidateId, current);
  }

  const enrichedPresences = presences.map((presence) => ({
    ...presence,
    secondaryUrls: auditTargetsByCandidate.get(presence.candidateId) ?? presence.secondaryUrls
  }));
  const classifications = enrichedPresences.map((presence) =>
    classifyBusiness(presence, findingsByCandidate.get(presence.candidateId) ?? [])
  );
  const auditedCandidateIds = new Set(
    enrichedPresences
      .filter((presence) => presence.auditEligible)
      .map((presence) => presence.candidateId)
  );

  return {
    ...report,
    candidates,
    presences: enrichedPresences,
    findings,
    classifications,
    businessBreakdowns: buildBusinessBreakdowns(
      enrichedPresences,
      classifications,
      findings,
      auditedCandidateIds
    ),
    shortlist: buildLeadShortlist(enrichedPresences, classifications, findings).slice(0, 5),
    summary: buildRunSummary(
      enrichedPresences,
      classifications,
      findings,
      report.acquisition.sampleQuality,
      auditedCandidateIds
    ),
    notes: [...report.notes, ...additions.notes]
  };
}

async function auditNewCandidates(
  report: ScoutRunReport,
  candidates: SearchCandidate[]
): Promise<{
  presences: ScoutRunReport["presences"];
  audits: PresenceAuditResult[];
}> {
  const presences = await Promise.all(
    candidates.map((candidate) => detectPresence(candidate, report.intent))
  );
  const auditEligible = presences.filter((presence) => presence.auditEligible);
  const audits: PresenceAuditResult[] = [];

  if (auditEligible.length === 0) {
    return {
      presences,
      audits: presences.map((presence) => emptyAuditResult(presence.candidateId))
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const auditor = createPlaywrightAuditor({
      browser,
      evidenceStorage: createEvidenceStorage(),
      runId: report.runId
    });

    for (const presence of presences) {
      audits.push(
        presence.auditEligible
          ? await auditor.auditPresence(presence, report.intent)
          : emptyAuditResult(presence.candidateId)
      );
    }
  } finally {
    await browser.close();
  }

  return {
    presences,
    audits
  };
}

function ensureCanMutate(record: PersistedRunRecord, report: ScoutRunReport | null): ScoutRunReport {
  if (record.status !== "completed" || !report) {
    throw new Error("Only completed Scout reports can accept added candidates.");
  }

  return report;
}

async function saveMutatedReport(record: PersistedRunRecord, report: ScoutRunReport) {
  const repository = createRunRepository();
  const now = new Date().toISOString();
  const nextRecord = createPersistedRunRecord(report, {
    execution: {
      queuedAt: record.execution.queuedAt,
      attemptCount: record.execution.attemptCount,
      ...(record.execution.startedAt ? { startedAt: record.execution.startedAt } : {}),
      finishedAt: now,
      heartbeatAt: now,
      stage: "completed",
      ...(record.execution.workerId ? { workerId: record.execution.workerId } : {}),
      workerNote: "Report updated with operator-supplied candidate changes.",
      ...(record.execution.lastErrorMessage
        ? { lastErrorMessage: record.execution.lastErrorMessage }
        : {})
    },
    persistence: {
      importedFromLegacyLocal: record.persistence.importedFromLegacyLocal,
      ...(record.persistence.importSourcePath
        ? { importSourcePath: record.persistence.importSourcePath }
        : {}),
      ...(record.persistence.importedAt ? { importedAt: record.persistence.importedAt } : {})
    }
  });

  await repository.upsertRecord(nextRecord);
  return report;
}

async function addCandidatesToRun(
  runId: string,
  candidates: SearchCandidate[],
  notes: string[]
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const record = await repository.getRecord(runId);

  if (!record) {
    throw new Error("Scout run not found.");
  }

  const report = ensureCanMutate(record, await repository.get(runId));
  const existingUrls = new Set(report.candidates.map((candidate) => canonicalizeUrl(candidate.url).comparisonKey));
  const filteredCandidates = candidates.filter(
    (candidate) => !existingUrls.has(canonicalizeUrl(candidate.url).comparisonKey)
  );

  if (filteredCandidates.length === 0) {
    throw new Error("That candidate URL is already present in this Scout report.");
  }

  const additions = await auditNewCandidates(report, filteredCandidates);
  const nextReport = rebuildReport(report, {
    candidates: filteredCandidates,
    presences: additions.presences,
    audits: additions.audits,
    notes
  });

  return saveMutatedReport(record, nextReport);
}

export async function addManualCandidateToRun(
  input: AddManualCandidateInput
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const report = await repository.get(input.runId);
  const nextRank = (report?.candidates.length ?? 0) + 1;
  const candidate = createCandidate({
    title: input.businessName,
    url: input.url,
    source: "manual",
    rank: nextRank,
    provenance: "manual",
    snippet: "Operator supplied this business manually after the initial live acquisition.",
    provenanceNote: "Operator-supplied candidate. Scout evaluated it with the same presence, audit, and shortlist rules."
  });

  return addCandidatesToRun(input.runId, [candidate], [
    `Operator manually added ${candidate.title} to the report.`
  ]);
}

export async function promoteDiscardedCandidateToRun(
  input: PromoteDiscardedCandidateInput
): Promise<ScoutRunReport> {
  const repository = createRunRepository();
  const record = await repository.getRecord(input.runId);

  if (!record) {
    throw new Error("Scout run not found.");
  }

  const report = ensureCanMutate(record, await repository.get(input.runId));
  const discarded = report.acquisition.discardedCandidates.find(
    (candidate) => candidate.candidateId === input.discardedCandidateId
  );

  if (!discarded?.url || !discarded.title) {
    throw new Error("That discarded candidate does not have enough saved detail to promote.");
  }

  const candidate = createCandidate({
    title: discarded.title,
    url: discarded.url,
    source: discarded.source ?? "promoted_discarded",
    rank: report.candidates.length + 1,
    provenance: "promoted_discarded",
    snippet: discarded.snippet ?? discarded.reason,
    provenanceNote: `Operator promoted a discarded acquisition result. Original reason: ${discarded.reason}`,
    extractedFromCandidateId: discarded.candidateId
  });

  return addCandidatesToRun(input.runId, [candidate], [
    `Operator promoted discarded result ${candidate.title}. Original reason: ${discarded.reason}`
  ]);
}

export function canPromoteDiscardedCandidate(
  discarded: ScoutRunReport["acquisition"]["discardedCandidates"][number]
): boolean {
  return Boolean(discarded.url && discarded.title);
}
