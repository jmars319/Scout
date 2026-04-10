import {
  presenceQualities,
  presenceTypes,
  type AcquisitionDiagnostics,
  type AuditFinding,
  type BusinessBreakdown,
  type BusinessClassification,
  type MarketSampleQuality,
  type PresenceRecord,
  type ScoutRunSummary
} from "./model.ts";
import { summarizeFindings, topIssueTypes } from "./findings.ts";

function initCountMap<T extends string>(keys: readonly T[]): Record<T, number> {
  return keys.reduce(
    (map, key) => {
      map[key] = 0;
      return map;
    },
    {} as Record<T, number>
  );
}

export function buildRunSummary(
  presences: PresenceRecord[],
  classifications: BusinessClassification[],
  findings: AuditFinding[],
  sampleQuality: MarketSampleQuality,
  auditedCandidateIds: Set<string> = new Set()
): ScoutRunSummary {
  const presenceBreakdown = initCountMap(presenceTypes);
  const qualityBreakdown = initCountMap(presenceQualities);

  for (const presence of presences) {
    presenceBreakdown[presence.presenceType] += 1;
  }

  for (const classification of classifications) {
    qualityBreakdown[classification.presenceQuality] += 1;
  }

  const commonIssues = new Map<string, number>();
  for (const finding of findings) {
    commonIssues.set(finding.issueType, (commonIssues.get(finding.issueType) ?? 0) + 1);
  }

  return {
    totalCandidates: presences.length,
    auditedPresences: auditedCandidateIds.size,
    skippedPresences: Math.max(0, presences.length - auditedCandidateIds.size),
    sampleQuality,
    presenceBreakdown,
    qualityBreakdown,
    commonIssues: [...commonIssues.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([issueType, count]) => ({
        issueType: issueType as AuditFinding["issueType"],
        count
      }))
  };
}

export function buildBusinessBreakdowns(
  presences: PresenceRecord[],
  classifications: BusinessClassification[],
  findings: AuditFinding[],
  auditedCandidateIds: Set<string> = new Set()
): BusinessBreakdown[] {
  const classificationByCandidate = new Map(
    classifications.map((classification) => [classification.candidateId, classification])
  );
  const findingsByCandidate = new Map<string, AuditFinding[]>();

  for (const finding of findings) {
    const current = findingsByCandidate.get(finding.candidateId) ?? [];
    current.push(finding);
    findingsByCandidate.set(finding.candidateId, current);
  }

  return presences
    .map((presence) => {
      const classification = classificationByCandidate.get(presence.candidateId);
      const candidateFindings = findingsByCandidate.get(presence.candidateId) ?? [];

      if (!classification) {
        return null;
      }

      const findingSummary = summarizeFindings(candidateFindings);
      const audited = auditedCandidateIds.has(presence.candidateId);

      return {
        candidateId: presence.candidateId,
        businessName: presence.businessName,
        primaryUrl: presence.primaryUrl,
        searchRank: presence.searchRank,
        presenceType: presence.presenceType,
        presenceQuality: classification.presenceQuality,
        opportunityTypes: classification.opportunityTypes,
        confidence: classification.confidence,
        findingCount: candidateFindings.length,
        highSeverityFindings: findingSummary.highSeverityCount,
        audited,
        auditStatus: audited ? "audited" : "skipped",
        topIssues: topIssueTypes(candidateFindings),
        secondaryUrls: presence.secondaryUrls,
        detectionNotes: presence.detectionNotes
      };
    })
    .filter((breakdown): breakdown is BusinessBreakdown => Boolean(breakdown))
    .sort((left, right) => left.searchRank - right.searchRank);
}

export function createEmptyAcquisitionDiagnostics(provider = "unknown"): AcquisitionDiagnostics {
  return {
    provider,
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
  };
}
