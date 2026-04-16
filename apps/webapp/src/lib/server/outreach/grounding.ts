import type {
  AuditFinding,
  BusinessBreakdown,
  LeadOpportunity,
  ScoutRunReport
} from "@scout/domain";

export interface OutreachTargetContext {
  runId: string;
  businessName: string;
  primaryUrl: string;
  lead: LeadOpportunity | null;
  business: BusinessBreakdown;
  findings: AuditFinding[];
  grounding: string[];
  cautionNotes: string[];
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function severityWeight(severity: AuditFinding["severity"]): number {
  if (severity === "critical") {
    return 4;
  }

  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function confidenceWeight(confidence: AuditFinding["confidence"]): number {
  if (confidence === "confirmed") {
    return 3;
  }

  if (confidence === "probable") {
    return 2;
  }

  return 1;
}

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort(
    (left, right) =>
      severityWeight(right.severity) - severityWeight(left.severity) ||
      confidenceWeight(right.confidence) - confidenceWeight(left.confidence) ||
      left.pageLabel.localeCompare(right.pageLabel)
  );
}

function summarizeFinding(finding: AuditFinding): string {
  return `${humanize(finding.severity)} ${humanize(finding.issueType)} on ${humanize(
    finding.pageLabel
  )} (${humanize(finding.viewport)}): ${finding.message}`;
}

export function buildOutreachTargetContext(
  report: ScoutRunReport,
  candidateId: string
): OutreachTargetContext {
  const lead = report.shortlist.find((item) => item.candidateId === candidateId) ?? null;
  const business = report.businessBreakdowns.find((item) => item.candidateId === candidateId);

  if (!business) {
    throw new Error("Scout could not find that business in the stored run report.");
  }

  const findings = sortFindings(
    report.findings.filter((finding) => finding.candidateId === candidateId)
  ).slice(0, 3);

  const grounding = [
    ...(lead?.reasons ?? []),
    ...findings.map(summarizeFinding),
    ...business.detectionNotes.slice(0, 2)
  ].slice(0, 6);

  const cautionNotes: string[] = [];

  if (business.confidence !== "confirmed" || lead?.confidence === "inferred") {
    cautionNotes.push("Keep the language observational rather than absolute.");
  }

  if (!findings.some((finding) => finding.confidence === "confirmed")) {
    cautionNotes.push("Do not claim definite breakage unless the report marked it as confirmed.");
  }

  if (
    report.summary.sampleQuality === "partial_sample" ||
    report.summary.sampleQuality === "weak_sample"
  ) {
    cautionNotes.push(
      "Keep the email focused on this specific site and avoid broader market claims."
    );
  }

  return {
    runId: report.runId,
    businessName: business.businessName,
    primaryUrl: business.primaryUrl,
    lead,
    business,
    findings,
    grounding,
    cautionNotes
  };
}
