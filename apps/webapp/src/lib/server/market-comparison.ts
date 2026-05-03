import type {
  AuditIssueType,
  BusinessBreakdown,
  LeadOpportunity,
  ScoutRunReport
} from "@scout/domain";

export interface MarketComparisonBusiness {
  businessName: string;
  primaryUrl: string;
  shortlistRank?: number | undefined;
  priorityScore?: number | undefined;
  findingCount: number;
  highSeverityFindings: number;
}

export interface MarketRankChange {
  businessName: string;
  primaryUrl: string;
  previousRank: number;
  currentRank: number;
  delta: number;
}

export interface MarketFindingChange {
  businessName: string;
  primaryUrl: string;
  previousFindingCount: number;
  currentFindingCount: number;
  findingDelta: number;
  previousHighSeverityFindings: number;
  currentHighSeverityFindings: number;
  highSeverityDelta: number;
  currentTopIssues: AuditIssueType[];
}

export interface MarketIssueChange {
  issueType: AuditIssueType;
  previousCount: number;
  currentCount: number;
  delta: number;
}

export interface MarketComparison {
  previousRunId: string;
  previousRunAt: string;
  currentRunId: string;
  currentRunAt: string;
  rawQuery: string;
  previousSampleQuality: ScoutRunReport["summary"]["sampleQuality"];
  currentSampleQuality: ScoutRunReport["summary"]["sampleQuality"];
  candidateCountDelta: number;
  shortlistCountDelta: number;
  findingCountDelta: number;
  highSeverityFindingDelta: number;
  newBusinesses: MarketComparisonBusiness[];
  missingBusinesses: MarketComparisonBusiness[];
  rankChanges: MarketRankChange[];
  findingChanges: MarketFindingChange[];
  issueChanges: MarketIssueChange[];
}

interface IndexedBusiness {
  key: string;
  businessName: string;
  primaryUrl: string;
  breakdown?: BusinessBreakdown | undefined;
  lead?: LeadOpportunity | undefined;
  shortlistRank?: number | undefined;
}

function businessKey(input: { businessName?: string | undefined; primaryUrl?: string | undefined }): string {
  if (input.primaryUrl) {
    try {
      const url = new URL(input.primaryUrl);
      return `url:${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return `url:${input.primaryUrl.toLowerCase().replace(/\/$/, "")}`;
    }
  }

  return `name:${(input.businessName ?? "").trim().toLowerCase()}`;
}

function indexBusinesses(report: ScoutRunReport): Map<string, IndexedBusiness> {
  const indexed = new Map<string, IndexedBusiness>();
  const shortlistByCandidate = new Map(
    report.shortlist.map((lead, index) => [lead.candidateId, { lead, rank: index + 1 }])
  );

  for (const breakdown of report.businessBreakdowns) {
    const shortlist = shortlistByCandidate.get(breakdown.candidateId);
    const key = businessKey({
      businessName: breakdown.businessName,
      primaryUrl: breakdown.primaryUrl
    });

    indexed.set(key, {
      key,
      businessName: breakdown.businessName,
      primaryUrl: breakdown.primaryUrl,
      breakdown,
      ...(shortlist ? { lead: shortlist.lead, shortlistRank: shortlist.rank } : {})
    });
  }

  for (const [candidateId, shortlist] of shortlistByCandidate) {
    if ([...indexed.values()].some((entry) => entry.lead?.candidateId === candidateId)) {
      continue;
    }

    const key = businessKey({
      businessName: shortlist.lead.businessName,
      primaryUrl: shortlist.lead.primaryUrl
    });

    indexed.set(key, {
      key,
      businessName: shortlist.lead.businessName,
      primaryUrl: shortlist.lead.primaryUrl,
      lead: shortlist.lead,
      shortlistRank: shortlist.rank
    });
  }

  return indexed;
}

function toComparisonBusiness(entry: IndexedBusiness): MarketComparisonBusiness {
  return {
    businessName: entry.businessName,
    primaryUrl: entry.primaryUrl,
    ...(entry.shortlistRank ? { shortlistRank: entry.shortlistRank } : {}),
    ...(entry.lead ? { priorityScore: entry.lead.priorityScore } : {}),
    findingCount: entry.breakdown?.findingCount ?? 0,
    highSeverityFindings: entry.breakdown?.highSeverityFindings ?? 0
  };
}

function issueCounts(report: ScoutRunReport): Map<AuditIssueType, number> {
  const counts = new Map<AuditIssueType, number>();

  for (const issue of report.summary.commonIssues) {
    counts.set(issue.issueType, issue.count);
  }

  return counts;
}

function totalFindingCount(report: ScoutRunReport): number {
  return report.businessBreakdowns.reduce((total, business) => total + business.findingCount, 0);
}

function highSeverityFindingCount(report: ScoutRunReport): number {
  return report.businessBreakdowns.reduce(
    (total, business) => total + business.highSeverityFindings,
    0
  );
}

export function buildMarketComparison(
  current: ScoutRunReport,
  previous: ScoutRunReport
): MarketComparison {
  const currentBusinesses = indexBusinesses(current);
  const previousBusinesses = indexBusinesses(previous);
  const newBusinesses = [...currentBusinesses.values()]
    .filter((entry) => !previousBusinesses.has(entry.key))
    .map(toComparisonBusiness)
    .slice(0, 8);
  const missingBusinesses = [...previousBusinesses.values()]
    .filter((entry) => !currentBusinesses.has(entry.key))
    .map(toComparisonBusiness)
    .slice(0, 8);
  const rankChanges: MarketRankChange[] = [];
  const findingChanges: MarketFindingChange[] = [];

  for (const [key, currentBusiness] of currentBusinesses) {
    const previousBusiness = previousBusinesses.get(key);

    if (!previousBusiness) {
      continue;
    }

    if (
      currentBusiness.shortlistRank &&
      previousBusiness.shortlistRank &&
      currentBusiness.shortlistRank !== previousBusiness.shortlistRank
    ) {
      rankChanges.push({
        businessName: currentBusiness.businessName,
        primaryUrl: currentBusiness.primaryUrl,
        previousRank: previousBusiness.shortlistRank,
        currentRank: currentBusiness.shortlistRank,
        delta: previousBusiness.shortlistRank - currentBusiness.shortlistRank
      });
    }

    const previousFindingCount = previousBusiness.breakdown?.findingCount ?? 0;
    const currentFindingCount = currentBusiness.breakdown?.findingCount ?? 0;
    const previousHighSeverityFindings = previousBusiness.breakdown?.highSeverityFindings ?? 0;
    const currentHighSeverityFindings = currentBusiness.breakdown?.highSeverityFindings ?? 0;

    if (
      previousFindingCount !== currentFindingCount ||
      previousHighSeverityFindings !== currentHighSeverityFindings
    ) {
      findingChanges.push({
        businessName: currentBusiness.businessName,
        primaryUrl: currentBusiness.primaryUrl,
        previousFindingCount,
        currentFindingCount,
        findingDelta: currentFindingCount - previousFindingCount,
        previousHighSeverityFindings,
        currentHighSeverityFindings,
        highSeverityDelta: currentHighSeverityFindings - previousHighSeverityFindings,
        currentTopIssues: currentBusiness.breakdown?.topIssues ?? []
      });
    }
  }

  const previousIssueCounts = issueCounts(previous);
  const currentIssueCounts = issueCounts(current);
  const issueTypes = new Set([...previousIssueCounts.keys(), ...currentIssueCounts.keys()]);
  const issueChanges = [...issueTypes]
    .map((issueType) => {
      const previousCount = previousIssueCounts.get(issueType) ?? 0;
      const currentCount = currentIssueCounts.get(issueType) ?? 0;

      return {
        issueType,
        previousCount,
        currentCount,
        delta: currentCount - previousCount
      };
    })
    .filter((entry) => entry.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    previousRunId: previous.runId,
    previousRunAt: previous.createdAt,
    currentRunId: current.runId,
    currentRunAt: current.createdAt,
    rawQuery: current.query.rawQuery,
    previousSampleQuality: previous.summary.sampleQuality,
    currentSampleQuality: current.summary.sampleQuality,
    candidateCountDelta: current.summary.totalCandidates - previous.summary.totalCandidates,
    shortlistCountDelta: current.shortlist.length - previous.shortlist.length,
    findingCountDelta: totalFindingCount(current) - totalFindingCount(previous),
    highSeverityFindingDelta: highSeverityFindingCount(current) - highSeverityFindingCount(previous),
    newBusinesses,
    missingBusinesses,
    rankChanges: rankChanges.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta)).slice(0, 8),
    findingChanges: findingChanges
      .sort((left, right) => Math.abs(right.findingDelta) - Math.abs(left.findingDelta))
      .slice(0, 8),
    issueChanges: issueChanges.slice(0, 8)
  };
}
