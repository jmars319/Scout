import { countFindingsByIssueType } from "./audit.ts";

import type { AuditFinding, AuditIssueType, FindingSeverity } from "./model.ts";

const severityWeight: Record<FindingSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export interface FindingSummary {
  total: number;
  score: number;
  highSeverityCount: number;
  confirmedCount: number;
  probableCount: number;
  inferredCount: number;
  issueCounts: Record<AuditIssueType, number>;
}

export function scoreFindings(findings: AuditFinding[]): number {
  return findings.reduce((sum, finding) => sum + severityWeight[finding.severity], 0);
}

export function summarizeFindings(findings: AuditFinding[]): FindingSummary {
  return {
    total: findings.length,
    score: scoreFindings(findings),
    highSeverityCount: findings.filter((finding) =>
      finding.severity === "high" || finding.severity === "critical"
    ).length,
    confirmedCount: findings.filter((finding) => finding.confidence === "confirmed").length,
    probableCount: findings.filter((finding) => finding.confidence === "probable").length,
    inferredCount: findings.filter((finding) => finding.confidence === "inferred").length,
    issueCounts: countFindingsByIssueType(findings)
  };
}

export function topIssueTypes(findings: AuditFinding[]): AuditIssueType[] {
  const counts = new Map<AuditIssueType, number>();

  for (const finding of findings) {
    counts.set(finding.issueType, (counts.get(finding.issueType) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([issueType]) => issueType);
}
