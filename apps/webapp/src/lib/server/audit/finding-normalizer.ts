import type {
  AuditFinding,
  AuditIssueType,
  ConfidenceLevel,
  FindingSeverity,
  ViewportKind
} from "@scout/domain";

import type { StoredEvidence } from "../storage/evidence-storage.ts";
import type { PageSignals } from "./page-helpers.ts";

const BLOCKED_STATUSES = new Set([401, 403, 429]);
const NOISE_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "clarity.ms",
  "hotjar.com",
  "segment.io",
  "intercom.io",
  "hs-scripts.com",
  "cookiebot.com",
  "cookielaw.org"
] as const;

export interface ConsoleObservation {
  text: string;
  location?: string | undefined;
}

export interface FailedRequestObservation {
  method: string;
  url: string;
  resourceType: string;
  status?: number | undefined;
  failureText?: string | undefined;
}

export interface AxeViolationObservation {
  id: string;
  impact?: string | null | undefined;
  help: string;
  nodes: number;
}

export interface FindingContext {
  candidateId: string;
  pageUrl: string;
  pageLabel: "homepage" | "secondary";
  viewport: ViewportKind;
  screenshot?: StoredEvidence | null;
}

function buildFindingId(parts: string[]): string {
  return parts
    .join("-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function createFinding(
  context: FindingContext,
  input: {
    issueType: AuditIssueType;
    severity: FindingSeverity;
    confidence: ConfidenceLevel;
    message: string;
    reproductionNote: string;
    ruleId?: string;
  }
): AuditFinding {
  const finding: AuditFinding = {
    id: buildFindingId([
      context.candidateId,
      context.pageLabel,
      context.viewport,
      input.issueType,
      input.ruleId ?? input.message.slice(0, 24)
    ]),
    candidateId: context.candidateId,
    pageUrl: context.pageUrl,
    pageLabel: context.pageLabel,
    viewport: context.viewport,
    issueType: input.issueType,
    severity: input.severity,
    confidence: input.confidence,
    message: input.message,
    reproductionNote: input.reproductionNote
  };

  if (context.screenshot) {
    finding.screenshotUrl = context.screenshot.publicUrl;
    finding.screenshotPath = context.screenshot.absolutePath;
  }

  if (input.ruleId) {
    finding.ruleId = input.ruleId;
  }

  return finding;
}

function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    if (seen.has(finding.id)) {
      return false;
    }

    seen.add(finding.id);
    return true;
  });
}

function mapAxeImpactToSeverity(impact?: string | null): FindingSeverity {
  if (impact === "critical" || impact === "serious") {
    return "high";
  }

  if (impact === "moderate") {
    return "medium";
  }

  return "low";
}

function looksLikeConsoleCrash(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("uncaught") ||
    normalized.includes("typeerror") ||
    normalized.includes("referenceerror") ||
    normalized.includes("syntaxerror")
  );
}

function isNoiseRequest(url: string): boolean {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return NOISE_DOMAINS.some(
      (noiseDomain) => domain === noiseDomain || domain.endsWith(`.${noiseDomain}`)
    );
  } catch {
    return false;
  }
}

function summarizeRequest(request: FailedRequestObservation): string {
  if (request.status) {
    return `${request.method} ${request.url} returned HTTP ${request.status}.`;
  }

  if (request.failureText) {
    return `${request.method} ${request.url} failed with ${request.failureText}.`;
  }

  return `${request.method} ${request.url} failed during page load.`;
}

export function normalizeNavigationFailure(
  context: FindingContext,
  error: Error | string
): AuditFinding {
  return createFinding(context, {
    issueType: "broken_navigation",
    severity: context.pageLabel === "homepage" ? "critical" : "high",
    confidence: "confirmed",
    message: "Page navigation failed during audit.",
    reproductionNote: typeof error === "string" ? error : error.message
  });
}

export function normalizePageState(
  context: FindingContext,
  input: {
    responseStatus?: number | null;
    signals: PageSignals;
  }
): AuditFinding | null {
  if (input.responseStatus && BLOCKED_STATUSES.has(input.responseStatus)) {
    return createFinding(context, {
      issueType: "blocked_content",
      severity: context.pageLabel === "homepage" ? "critical" : "high",
      confidence: "confirmed",
      message: "The page is blocked by an access or verification gate.",
      reproductionNote: `Navigation returned HTTP ${input.responseStatus}.`
    });
  }

  if (input.signals.blockedHint) {
    return createFinding(context, {
      issueType: "blocked_content",
      severity: context.pageLabel === "homepage" ? "high" : "medium",
      confidence: "probable",
      message: "The page content appears blocked or gated.",
      reproductionNote: "Visible page text matched blocked-content heuristics."
    });
  }

  if ((input.responseStatus ?? 0) >= 400 || input.signals.deadPageHint) {
    return createFinding(context, {
      issueType: "dead_page",
      severity: context.pageLabel === "homepage" ? "critical" : "high",
      confidence: input.responseStatus ? "confirmed" : "probable",
      message: "The page appears dead, missing, or suspended.",
      reproductionNote: input.responseStatus
        ? `Navigation returned HTTP ${input.responseStatus}.`
        : "Visible page text matched dead-page heuristics."
    });
  }

  return null;
}

export function normalizeSignalFindings(
  context: FindingContext,
  signals: PageSignals
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (context.pageLabel === "homepage" && !signals.hasPrimaryCta) {
    findings.push(
      createFinding(context, {
        issueType: "missing_primary_cta",
        severity: "medium",
        confidence: "probable",
        message: "No obvious primary call to action was found on the homepage.",
        reproductionNote:
          "No visible contact, booking, quote, call, menu, order, or schedule action matched Scout's CTA heuristics."
      })
    );
  }

  if (context.pageLabel === "homepage" && !signals.hasContactPath) {
    findings.push(
      createFinding(context, {
        issueType: "missing_contact_path",
        severity: "medium",
        confidence: "probable",
        message: "The homepage does not surface a clear contact path.",
        reproductionNote:
          "Scout did not find a visible contact/location path, phone link, email link, or address-like contact detail."
      })
    );
  }

  if (context.pageLabel === "homepage" && !signals.hasTrustSignal) {
    findings.push(
      createFinding(context, {
        issueType: "weak_trust_signal",
        severity: "low",
        confidence: "probable",
        message: "Trust signals on the homepage look thin.",
        reproductionNote:
          "Scout did not detect clear review, credential, hours, address, phone, or longevity signals on the homepage."
      })
    );
  }

  if (context.viewport === "mobile" && signals.horizontalOverflow) {
    findings.push(
      createFinding(context, {
        issueType: "mobile_layout_issue",
        severity: "medium",
        confidence: "confirmed",
        message: "Horizontal overflow was detected on mobile.",
        reproductionNote: "Document width exceeded the mobile viewport by more than 24 pixels."
      })
    );
  }

  return dedupeFindings(findings);
}

export function normalizeConsoleFindings(
  context: FindingContext,
  observations: ConsoleObservation[]
): AuditFinding[] {
  return dedupeFindings(
    observations
      .filter((observation) => observation.text.trim().length > 0)
      .slice(0, 3)
      .map((observation) =>
        createFinding(context, {
          issueType: "console_error",
          severity: looksLikeConsoleCrash(observation.text) ? "high" : "medium",
          confidence: "confirmed",
          message: "Console error observed during page load.",
          reproductionNote: observation.location
            ? `${observation.text} (${observation.location})`
            : observation.text
        })
      )
  );
}

export function normalizeFailedRequestFindings(
  context: FindingContext,
  observations: FailedRequestObservation[]
): AuditFinding[] {
  return dedupeFindings(
    observations
      .filter((observation) => !isNoiseRequest(observation.url))
      .slice(0, 4)
      .map((observation) =>
        createFinding(context, {
          issueType: "failed_request",
          severity:
            observation.resourceType === "document" || (observation.status ?? 0) >= 500
              ? "high"
              : "medium",
          confidence: "confirmed",
          message: "A page request failed or returned an error status.",
          reproductionNote: summarizeRequest(observation)
        })
      )
  );
}

export function normalizeAxeFindings(
  context: FindingContext,
  violations: AxeViolationObservation[]
): AuditFinding[] {
  return dedupeFindings(
    violations.slice(0, 5).map((violation) =>
      createFinding(context, {
        issueType: violation.id === "target-size" ? "tap_target_issue" : "accessibility_issue",
        severity: mapAxeImpactToSeverity(violation.impact),
        confidence: "confirmed",
        message: violation.help,
        reproductionNote: `Rule ${violation.id} affected ${violation.nodes} node(s).`,
        ruleId: violation.id
      })
    )
  );
}
