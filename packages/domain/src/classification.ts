import { summarizeFindings } from "./findings.ts";

import type {
  AuditFinding,
  BusinessClassification,
  ConfidenceLevel,
  LeadOpportunity,
  OpportunityType,
  PresenceQuality,
  PresenceRecord
} from "./model.ts";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function confidenceWeight(confidence: ConfidenceLevel): number {
  if (confidence === "confirmed") {
    return 12;
  }

  if (confidence === "probable") {
    return 6;
  }

  return 0;
}

function determineConfidence(
  presence: PresenceRecord,
  findings: AuditFinding[]
): ConfidenceLevel {
  const summary = summarizeFindings(findings);

  if (presence.presenceType === "dead" || presence.presenceType === "blocked") {
    return "confirmed";
  }

  if (presence.presenceType === "owned_website") {
    if (summary.confirmedCount > 0 || summary.total === 0) {
      return "confirmed";
    }

    return summary.probableCount > 0 ? "probable" : "inferred";
  }

  return presence.presenceType === "unknown" ? "inferred" : "probable";
}

function isShortlistEligiblePresenceType(
  presenceType: PresenceRecord["presenceType"]
): boolean {
  return (
    presenceType === "owned_website" ||
    presenceType === "facebook_only" ||
    presenceType === "yelp_only" ||
    presenceType === "dead" ||
    presenceType === "blocked"
  );
}

export function classifyBusiness(
  presence: PresenceRecord,
  findings: AuditFinding[]
): BusinessClassification {
  const summary = summarizeFindings(findings);
  const counts = summary.issueCounts;
  const rationale: string[] = [];
  const opportunities: OpportunityType[] = [];
  let presenceQuality: PresenceQuality = "functional";

  if (presence.presenceType === "dead") {
    presenceQuality = "none";
    opportunities.push("rebuild");
    rationale.push("The destination appears dead or unreachable.");
  } else if (presence.presenceType === "blocked") {
    presenceQuality = "broken";
    opportunities.push("repair");
    rationale.push("The destination responded, but access looks blocked or gated.");
  } else if (presence.presenceType !== "owned_website") {
    presenceQuality = "weak";
    opportunities.push("build");
    rationale.push("Scout did not confirm an owned website from this candidate.");
  } else if (summary.total === 0) {
    presenceQuality = "strong";
    rationale.push("The owned website passed the current deterministic checks cleanly.");
  } else if (
    counts.dead_page > 0 ||
    counts.blocked_content > 0 ||
    counts.broken_navigation >= 2 ||
    summary.highSeverityCount >= 2 ||
    summary.score >= 12
  ) {
    presenceQuality = "broken";
    opportunities.push("repair");
    rationale.push("Confirmed health issues materially block or degrade the site experience.");
  } else if (
    summary.score >= 6 ||
    counts.console_error + counts.failed_request >= 3 ||
    counts.mobile_layout_issue > 0
  ) {
    presenceQuality = "weak";
    opportunities.push("repair");
    rationale.push("The owned site is live, but confirmed delivery or usability issues are stacking up.");
  } else {
    presenceQuality = "functional";
    rationale.push("The owned site is usable, but deterministic friction is still present.");
  }

  if (counts.accessibility_issue > 0 || counts.tap_target_issue > 0) {
    opportunities.push("accessibility_fix");
    rationale.push("Accessibility violations were detected with axe.");
  }

  if (
    counts.missing_primary_cta > 0 ||
    counts.missing_contact_path > 0 ||
    counts.weak_trust_signal > 0
  ) {
    opportunities.push("conversion_improvement");
    rationale.push("Conversion or trust pathways are weak on the current site.");
  }

  if (
    counts.console_error > 0 ||
    counts.failed_request >= 3 ||
    counts.mobile_layout_issue > 0 ||
    counts.blocked_content > 0
  ) {
    opportunities.push("performance_fix");
    rationale.push("Repeated runtime or delivery issues were observed in the browser audit.");
  }

  return {
    candidateId: presence.candidateId,
    presenceQuality,
    opportunityTypes: unique(opportunities),
    confidence: determineConfidence(presence, findings),
    rationale: unique(rationale)
  };
}

export function buildLeadOpportunity(
  presence: PresenceRecord,
  classification: BusinessClassification,
  findings: AuditFinding[],
  marketContext: {
    ownedWebsiteShare: number;
  }
): LeadOpportunity {
  const summary = summarizeFindings(findings);
  const reasons: string[] = [];
  let priorityScore = Math.max(0, 76 - presence.searchRank * 2);

  if (classification.opportunityTypes.includes("build")) {
    priorityScore += 36;
    reasons.push("No owned website was confirmed, so the business is still represented by a profile or listing surface.");
    if (marketContext.ownedWebsiteShare >= 0.35) {
      priorityScore += 10;
      reasons.push("That absence stands out because owned sites are present elsewhere in this market scan.");
    }
  }

  if (classification.opportunityTypes.includes("rebuild")) {
    priorityScore += 30;
    reasons.push("Scout could reach the destination, but it appears dead or effectively unusable.");
  }

  if (classification.opportunityTypes.includes("repair")) {
    priorityScore += 22;
    reasons.push("Confirmed browser or navigation failures make the current site worth technical repair work.");
  }

  if (classification.opportunityTypes.includes("conversion_improvement")) {
    priorityScore += 12;
    reasons.push("The current site leaves contact or conversion intent harder to find than it should.");
  }

  if (classification.opportunityTypes.includes("accessibility_fix")) {
    priorityScore += 14;
    reasons.push("Accessibility issues were confirmed with axe, not inferred.");
  }

  if (classification.opportunityTypes.includes("performance_fix")) {
    priorityScore += 10;
  }

  if (classification.presenceQuality === "none") {
    priorityScore += 20;
  } else if (classification.presenceQuality === "broken") {
    priorityScore += 16;
  } else if (classification.presenceQuality === "weak") {
    priorityScore += 10;
  }

  priorityScore += summary.highSeverityCount * 6;
  priorityScore += Math.min(summary.score, 18);
  priorityScore += confidenceWeight(classification.confidence);

  if (summary.highSeverityCount > 0) {
    reasons.push(
      `${summary.highSeverityCount} high-severity issue${summary.highSeverityCount === 1 ? "" : "s"} were confirmed during audit.`
    );
  }

  return {
    candidateId: presence.candidateId,
    businessName: presence.businessName,
    primaryUrl: presence.primaryUrl,
    presenceType: presence.presenceType,
    presenceQuality: classification.presenceQuality,
    opportunityTypes: classification.opportunityTypes,
    confidence: classification.confidence,
    priorityScore,
    reasons: unique([...reasons, ...classification.rationale]).slice(0, 4)
  };
}

export function buildLeadShortlist(
  presences: PresenceRecord[],
  classifications: BusinessClassification[],
  findings: AuditFinding[]
): LeadOpportunity[] {
  const classificationByCandidate = new Map(
    classifications.map((classification) => [classification.candidateId, classification])
  );
  const findingsByCandidate = new Map<string, AuditFinding[]>();

  for (const finding of findings) {
    const current = findingsByCandidate.get(finding.candidateId) ?? [];
    current.push(finding);
    findingsByCandidate.set(finding.candidateId, current);
  }

  const ownedWebsiteShare =
    presences.length > 0
      ? presences.filter((presence) => presence.presenceType === "owned_website").length / presences.length
      : 0;

  return presences
    .filter((presence) => isShortlistEligiblePresenceType(presence.presenceType))
    .map((presence) => {
      const classification = classificationByCandidate.get(presence.candidateId);
      if (!classification) {
        return null;
      }

      return buildLeadOpportunity(
        presence,
        classification,
        findingsByCandidate.get(presence.candidateId) ?? [],
        {
          ownedWebsiteShare
        }
      );
    })
    .filter((lead): lead is LeadOpportunity => Boolean(lead))
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        left.businessName.localeCompare(right.businessName)
    )
    .slice(0, 5);
}
