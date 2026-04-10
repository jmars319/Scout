import type { AuditFinding, AuditIssueType, FindingSeverity, PresenceAuditResult } from "./model.ts";

export function emptyAuditResult(candidateId: string): PresenceAuditResult {
  return {
    candidateId,
    targets: [],
    findings: [],
    notes: []
  };
}

export function countFindingsByIssueType(findings: AuditFinding[]): Record<AuditIssueType, number> {
  const counts = {
    console_error: 0,
    failed_request: 0,
    broken_navigation: 0,
    missing_contact_path: 0,
    missing_primary_cta: 0,
    accessibility_issue: 0,
    mobile_layout_issue: 0,
    tap_target_issue: 0,
    blocked_content: 0,
    dead_page: 0,
    weak_trust_signal: 0
  } as Record<AuditIssueType, number>;

  for (const finding of findings) {
    counts[finding.issueType] += 1;
  }

  return counts;
}

export function highestSeverity(findings: AuditFinding[]): FindingSeverity | null {
  const ranking: Record<FindingSeverity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };

  return findings.reduce<FindingSeverity | null>((current, finding) => {
    if (!current) {
      return finding.severity;
    }

    return ranking[finding.severity] > ranking[current] ? finding.severity : current;
  }, null);
}
