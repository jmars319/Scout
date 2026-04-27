import { buildLeadShortlist, classifyBusiness } from "./classification.ts";
import { emptyAuditResult } from "./audit.ts";
import {
  buildBusinessBreakdowns,
  buildRunSummary
} from "./report.ts";
import { resolveMarketIntent } from "./query.ts";

import type {
  PresenceAuditResult,
  ScoutQueryInput,
  ScoutRunReport
} from "./model.ts";
import type { RunScoutDependencies } from "./search.ts";

export * from "./model.ts";
export * from "./query.ts";
export * from "./search.ts";
export * from "./presence.ts";
export * from "./audit.ts";
export * from "./findings.ts";
export * from "./classification.ts";
export * from "./report.ts";
export * from "./business-types.ts";

function defaultRunId(now: Date): string {
  return `run_${now.toISOString().replace(/[:.]/g, "-")}`;
}

function resolveSearchSource(report: ScoutRunReport["acquisition"]): string {
  const selectedSources = [
    ...new Set(
      report.candidateSources
        .filter((source) => source.selectedCandidateCount > 0)
        .map((source) => source.source)
    )
  ];

  if (selectedSources.length > 0) {
    return selectedSources.join(" + ");
  }

  if (report.provider === "seeded_stub") {
    return "seeded_stub";
  }

  return report.fallbackUsed ? `${report.provider} + seeded_stub` : report.provider;
}

export async function runScout(
  input: ScoutQueryInput,
  dependencies: RunScoutDependencies
): Promise<ScoutRunReport> {
  const now = dependencies.now?.() ?? new Date();
  const runId = dependencies.generateRunId?.() ?? defaultRunId(now);
  const intent = await dependencies.resolveIntent(input);
  await dependencies.onProgress?.({
    stage: "acquiring_candidates",
    workerNote: "Gathering live market candidates from the search providers."
  });
  const acquisition = await dependencies.searchCandidates(intent);
  const candidates = acquisition.candidates;
  await dependencies.onProgress?.({
    stage: "evaluating_presences",
    workerNote: `Evaluating ${candidates.length} candidate presences and ownership signals.`
  });
  const presences = await Promise.all(
    candidates.map((candidate) => dependencies.detectPresence(candidate, intent))
  );

  const audits: PresenceAuditResult[] = [];
  const auditEligibleCount = presences.filter((presence) => presence.auditEligible).length;
  let auditedCount = 0;
  await dependencies.onProgress?.({
    stage: "auditing_websites",
    workerNote:
      auditEligibleCount > 0
        ? `Auditing ${auditEligibleCount} owned websites across desktop and mobile.`
        : "No owned websites qualified for audit. Moving to classification."
  });
  for (const presence of presences) {
    if (!presence.auditEligible) {
      audits.push(emptyAuditResult(presence.candidateId));
      continue;
    }

    auditedCount += 1;
    await dependencies.onProgress?.({
      stage: "auditing_websites",
      workerNote: `Auditing ${presence.businessName} (${auditedCount} of ${auditEligibleCount}).`
    });
    audits.push(await dependencies.auditPresence(presence, intent));
  }

  const findings = audits.flatMap((audit) => audit.findings);
  const auditedCandidateIds = new Set(
    presences.filter((presence) => presence.auditEligible).map((presence) => presence.candidateId)
  );
  const secondaryTargetsByCandidate = new Map(
    audits.map((audit) => [
      audit.candidateId,
      audit.targets
        .filter((target) => target.label === "secondary")
        .map((target) => target.url)
    ])
  );
  const enrichedPresences = presences.map((presence) => ({
    ...presence,
    secondaryUrls: secondaryTargetsByCandidate.get(presence.candidateId) ?? presence.secondaryUrls
  }));
  const findingsByCandidate = new Map<string, typeof findings>();

  for (const finding of findings) {
    const current = findingsByCandidate.get(finding.candidateId) ?? [];
    current.push(finding);
    findingsByCandidate.set(finding.candidateId, current);
  }

  await dependencies.onProgress?.({
    stage: "building_shortlist",
    workerNote: "Classifying findings and building the shortlist."
  });
  const classifications = enrichedPresences.map((presence) =>
    classifyBusiness(presence, findingsByCandidate.get(presence.candidateId) ?? [])
  );
  const shortlist = buildLeadShortlist(enrichedPresences, classifications, findings).slice(0, 5);

  await dependencies.onProgress?.({
    stage: "finalizing_report",
    workerNote: "Finalizing the report and saving the results."
  });
  const report: ScoutRunReport = {
    schemaVersion: 2,
    runId,
    status: "completed",
    createdAt: now.toISOString(),
    query: input,
    intent: intent ?? resolveMarketIntent(input),
    acquisition: acquisition.diagnostics,
    searchSource: resolveSearchSource(acquisition.diagnostics),
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
    shortlist,
    summary: buildRunSummary(
      enrichedPresences,
      classifications,
      findings,
      acquisition.diagnostics.sampleQuality,
      auditedCandidateIds
    ),
    notes: audits.flatMap((audit) => audit.notes)
  };

  await dependencies.onCompleted?.(report);

  return report;
}
