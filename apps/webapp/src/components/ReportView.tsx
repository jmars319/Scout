import Link from "next/link";

import type {
  AuditFinding,
  OutreachDraft,
  OutreachLength,
  OutreachTone,
  ScoutRunReport
} from "@scout/domain";
import { Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import { CandidateReviewPanel } from "./CandidateReviewPanel";
import { OutreachWorkspace } from "./OutreachWorkspace";
import {
  describeSampleQuality,
  describeSampleQualityMeaning,
  toneForSampleQuality
} from "./sample-quality-copy";

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function describeProviderName(value: string): string {
  if (value.includes(" + ")) {
    return value
      .split(" + ")
      .map((part) => describeProviderName(part))
      .join(" + ");
  }

  if (value === "duckduckgo_html") {
    return "DuckDuckGo live";
  }

  if (value === "bing_html") {
    return "Bing live";
  }

  if (value === "google_html") {
    return "Google live";
  }

  if (value === "seeded_stub") {
    return "Seeded fallback";
  }

  return humanize(value);
}

function describeQueryVariantLabel(label: string): string {
  if (label === "raw") {
    return "As Typed";
  }

  if (label === "normalized") {
    return "Cleaned";
  }

  if (label === "singularized") {
    return "Singular";
  }

  if (label === "official_website") {
    return "Official Site";
  }

  if (label === "contact_path") {
    return "Contact Path";
  }

  if (label === "owned_domain") {
    return "Owned Domain";
  }

  if (label === "directory_snippet") {
    return "Snippet Leads";
  }

  return humanize(label);
}

function describeAttemptOutcome(outcome: string): string {
  if (outcome === "parse_error") {
    return "Parse Issue";
  }

  if (outcome === "network_error") {
    return "Network Issue";
  }

  if (outcome === "http_error") {
    return "HTTP Issue";
  }

  if (outcome === "empty") {
    return "No Results";
  }

  return humanize(outcome);
}

function describeCandidateProvenance(value?: string): string {
  if (value === "directory_snippet") {
    return "Directory snippet";
  }

  if (value === "manual") {
    return "Manual add";
  }

  if (value === "promoted_discarded") {
    return "Promoted result";
  }

  return "Live result";
}

function toneForQuality(quality: string): "neutral" | "good" | "warn" | "danger" {
  if (quality === "strong") {
    return "good";
  }

  if (quality === "broken" || quality === "none") {
    return "danger";
  }

  if (quality === "weak") {
    return "warn";
  }

  return "neutral";
}

function toneForSeverity(severity: string): "neutral" | "good" | "warn" | "danger" {
  if (severity === "critical" || severity === "high") {
    return "danger";
  }

  if (severity === "medium") {
    return "warn";
  }

  return "neutral";
}

function toneForConfidence(confidence: string): "neutral" | "good" | "warn" | "danger" {
  if (confidence === "confirmed") {
    return "good";
  }

  if (confidence === "probable") {
    return "warn";
  }

  return "neutral";
}

function toneForAuditStatus(status: "audited" | "skipped"): "neutral" | "good" | "warn" | "danger" {
  return status === "audited" ? "good" : "warn";
}

function toneForSampleMetric(
  sampleQuality: ScoutRunReport["summary"]["sampleQuality"]
): "neutral" | "good" | "warn" {
  return toneForSampleQuality(sampleQuality) === "good"
    ? "good"
    : toneForSampleQuality(sampleQuality) === "neutral"
      ? "neutral"
      : "warn";
}

function toneForAcquisitionTrust(report: ScoutRunReport): "neutral" | "good" | "warn" | "danger" {
  const degradedLiveAttempt = report.acquisition.providerAttempts.some(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );

  if (!report.acquisition.fallbackUsed && !degradedLiveAttempt) {
    return "good";
  }

  if (
    report.acquisition.liveCandidateCount === 0 ||
    report.acquisition.fallbackCandidateCount >= Math.max(1, report.acquisition.liveCandidateCount)
  ) {
    return "danger";
  }

  return "warn";
}

function describeAcquisitionTrust(report: ScoutRunReport): string {
  const degradedLiveAttempt = report.acquisition.providerAttempts.some(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );

  if (!report.acquisition.fallbackUsed && !degradedLiveAttempt) {
    return "Live acquisition carried this run without seeded help.";
  }

  if (report.acquisition.liveCandidateCount === 0) {
    return "This run is effectively non-live. Scout had to rely on the seeded fallback catalog.";
  }

  if (
    report.acquisition.fallbackCandidateCount >= Math.max(1, report.acquisition.liveCandidateCount)
  ) {
    return "Seeded fallback contributed as much or more of the kept sample as live acquisition.";
  }

  if (degradedLiveAttempt) {
    return "Live acquisition worked only partially. Provider degradation should reduce confidence in the market picture.";
  }

  return "Live acquisition needed seeded help to fill gaps in the final sample.";
}

function buildAttemptSummary(
  attempts: ScoutRunReport["acquisition"]["providerAttempts"]
): string {
  return attempts
    .map(
      (attempt) =>
        `${describeProviderName(attempt.provider)} ${describeAttemptOutcome(attempt.outcome)}`
    )
    .join(", ");
}

function buildSampleConfidenceReasons(report: ScoutRunReport): string[] {
  const reasons: string[] = [];
  const degradedLiveAttempts = report.acquisition.providerAttempts.filter(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success" && attempt.outcome !== "empty"
  );
  const profilePresenceCount = report.businessBreakdowns.filter((business) =>
    ["facebook_only", "yelp_only", "directory_only", "marketplace"].includes(business.presenceType)
  ).length;
  const keptCount = Math.max(report.acquisition.selectedCandidateCount, report.businessBreakdowns.length);

  if (degradedLiveAttempts.length > 0) {
    reasons.push(`Live provider issue: ${buildAttemptSummary(degradedLiveAttempts)}.`);
  }

  if (report.acquisition.discardedCandidateCount > 0) {
    reasons.push(
      `Scout discarded ${report.acquisition.discardedCandidateCount} low-value or non-specific result(s) before keeping ${report.acquisition.selectedCandidateCount}.`
    );
  }

  if (keptCount > 0 && profilePresenceCount / keptCount >= 0.35) {
    reasons.push(
      `${profilePresenceCount} of ${keptCount} kept candidate(s) were directory, marketplace, or social/profile presences.`
    );
  }

  if (report.acquisition.fallbackCandidateCount > 0) {
    reasons.push(
      `${report.acquisition.fallbackCandidateCount} kept candidate(s) came from verification fallback instead of live search.`
    );
  }

  if (report.acquisition.selectedCandidateCount > 0 && report.acquisition.selectedCandidateCount < 10) {
    reasons.push(
      `Only ${report.acquisition.selectedCandidateCount} final candidate(s) survived acquisition filtering.`
    );
  }

  if (reasons.length > 0) {
    return reasons.slice(0, 4);
  }

  return report.acquisition.notes.length > 0
    ? report.acquisition.notes.slice(0, 3)
    : [describeSampleQualityMeaning(report.acquisition.sampleQuality)];
}

function groupFindings(findings: AuditFinding[]): Map<string, AuditFinding[]> {
  const grouped = new Map<string, AuditFinding[]>();

  for (const finding of findings) {
    const current = grouped.get(finding.candidateId) ?? [];
    current.push(finding);
    grouped.set(finding.candidateId, current);
  }

  return grouped;
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

function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort(
    (left, right) =>
      severityWeight(right.severity) - severityWeight(left.severity) ||
      left.pageLabel.localeCompare(right.pageLabel)
  );
}

function buildListKey(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

export function ReportView({
  report,
  outreach
}: {
  report: ScoutRunReport;
  outreach: {
    aiAvailable: boolean;
    defaultTone: OutreachTone;
    defaultLength: OutreachLength;
    model?: string | undefined;
    drafts: OutreachDraft[];
  };
}) {
  const findingsByCandidate = groupFindings(report.findings);
  const ownedWebsiteCount = report.presences.filter(
    (presence) => presence.presenceType === "owned_website"
  ).length;
  const acquisitionVariants = report.acquisition.queryVariants.filter(
    (variant) => variant.rawResultCount > 0 || variant.acceptedResultCount > 0
  );
  const acquisitionSources = report.acquisition.candidateSources.filter(
    (source) => source.rawCandidateCount > 0 || source.selectedCandidateCount > 0
  );
  const degradedLiveAttempts = report.acquisition.providerAttempts.filter(
    (attempt) => attempt.kind === "live" && attempt.outcome !== "success"
  );
  const sampleConfidenceReasons = buildSampleConfidenceReasons(report);
  const candidatesById = new Map(report.candidates.map((candidate) => [candidate.candidateId, candidate]));

  return (
    <div className="scout-shell">
      {report.status === "failed" ? (
        <div className="error-banner">
          <strong>Run failed.</strong>
          <div style={{ marginTop: "0.45rem" }}>
            {report.errorMessage || "Scout stopped before report completion."}
          </div>
        </div>
      ) : null}

      <MetricGrid>
        <Metric label="Candidates" value={report.summary.totalCandidates} />
        <Metric label="Owned Sites" value={ownedWebsiteCount} />
        <Metric label="Audited" value={report.summary.auditedPresences} tone="good" />
        <Metric label="Skipped" value={report.summary.skippedPresences} />
        <Metric
          label="Market Confidence"
          value={describeSampleQuality(report.summary.sampleQuality)}
          tone={toneForSampleMetric(report.summary.sampleQuality)}
        />
        <Metric label="Shortlist" value={report.shortlist.length} tone="warn" />
      </MetricGrid>

      <div className="scout-grid report-overview-grid">
        <Panel title="Market Summary">
          <div className="tag-row" style={{ marginBottom: "0.9rem" }}>
            <Tag tone="good">{describeProviderName(report.searchSource)}</Tag>
            <Tag tone={toneForSampleQuality(report.summary.sampleQuality)}>
              {describeSampleQuality(report.summary.sampleQuality)}
            </Tag>
            {report.intent.locationLabel ? <Tag>{report.intent.locationLabel}</Tag> : null}
            {report.intent.categories.map((category) => (
              <Tag key={category}>{humanize(category)}</Tag>
            ))}
          </div>

          <p className="muted" style={{ marginTop: 0, lineHeight: 1.65 }}>
            Scout normalized the query to <strong>{report.intent.searchQuery}</strong>, kept every
            candidate presence, audited only deterministic owned-site targets, and marked the rest
            as skipped with explicit presence notes.
          </p>

          <div className="scout-grid two-up" style={{ marginTop: "1rem" }}>
            <div>
              <div className="section-label">Presence Breakdown</div>
              <table className="finding-table">
                <tbody>
                  {Object.entries(report.summary.presenceBreakdown).map(([presenceType, count]) => (
                    <tr key={presenceType}>
                      <td>{humanize(presenceType)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="section-label">Quality Breakdown</div>
              <table className="finding-table">
                <tbody>
                  {Object.entries(report.summary.qualityBreakdown).map(([quality, count]) => (
                    <tr key={quality}>
                      <td>{humanize(quality)}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>

        <Panel title="Acquisition">
          <div className="tag-row" style={{ marginBottom: "0.9rem" }}>
            <Tag tone={toneForAcquisitionTrust(report)}>
              {describeProviderName(report.acquisition.provider)}
            </Tag>
            {report.acquisition.fallbackUsed ? <Tag tone="warn">Fallback Used</Tag> : null}
            <Tag tone={toneForSampleQuality(report.acquisition.sampleQuality)}>
              {describeSampleQuality(report.acquisition.sampleQuality)}
            </Tag>
          </div>

          <p className="muted" style={{ marginTop: 0, marginBottom: "0.9rem", lineHeight: 1.65 }}>
            {describeAcquisitionTrust(report)}
          </p>

          <div className="sample-confidence-summary">
            <div className="section-label">Market Confidence</div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.65 }}>
              <strong>{describeSampleQuality(report.acquisition.sampleQuality)}.</strong>{" "}
              {describeSampleQualityMeaning(report.acquisition.sampleQuality)}
            </p>
            <ul className="note-list">
              {sampleConfidenceReasons.map((reason, index) => (
                <li key={buildListKey("sample-confidence-reason", index)}>{reason}</li>
              ))}
            </ul>
          </div>

          <p className="muted" style={{ marginTop: 0, lineHeight: 1.65 }}>
            Scout gathered <strong>{report.acquisition.rawCandidateCount}</strong> raw results,
            merged <strong>{report.acquisition.mergedDuplicateCount}</strong>, discarded{" "}
            <strong>{report.acquisition.discardedCandidateCount}</strong>, and kept{" "}
            <strong>{report.acquisition.selectedCandidateCount}</strong> final candidates for this
            run.
          </p>

          <div className="tag-row">
            <Tag tone="good">Live {report.acquisition.liveCandidateCount}</Tag>
            <Tag tone={report.acquisition.fallbackCandidateCount > 0 ? "warn" : "neutral"}>
              Fallback {report.acquisition.fallbackCandidateCount}
            </Tag>
            {acquisitionSources.map((source) => (
              <Tag
                key={source.source}
                tone={source.kind === "fallback" ? "warn" : "neutral"}
              >
                {describeProviderName(source.source)} kept {source.selectedCandidateCount}
              </Tag>
            ))}
          </div>

          <div className="section-stack" style={{ marginTop: "1rem" }}>
            <div className="section-label">Query Variants</div>
            {acquisitionVariants.length > 0 ? (
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>Query</th>
                    <th>Raw</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {acquisitionVariants.map((variant) => (
                    <tr key={`${variant.label}-${variant.query}`}>
                      <td>{describeQueryVariantLabel(variant.label)}</td>
                      <td>{variant.query}</td>
                      <td>{variant.rawResultCount}</td>
                      <td>{variant.acceptedResultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Scout did not record any usable query-variant acquisition for this run.
              </p>
            )}
          </div>

          {acquisitionSources.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Source Contribution</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Kind</th>
                    <th>Raw</th>
                    <th>Kept</th>
                  </tr>
                </thead>
                <tbody>
                  {acquisitionSources.map((source) => (
                    <tr key={`${source.kind}-${source.source}`}>
                      <td>{describeProviderName(source.source)}</td>
                      <td>{humanize(source.kind)}</td>
                      <td>{source.rawCandidateCount}</td>
                      <td>{source.selectedCandidateCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {degradedLiveAttempts.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Live Provider Attempts</div>
              <table className="finding-table acquisition-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Variant</th>
                    <th>Outcome</th>
                    <th>Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {degradedLiveAttempts.map((attempt) => (
                    <tr key={`${attempt.provider}-${attempt.variantLabel}-${attempt.query}-${attempt.outcome}`}>
                      <td>{describeProviderName(attempt.provider)}</td>
                      <td>{describeQueryVariantLabel(attempt.variantLabel)}</td>
                      <td>{describeAttemptOutcome(attempt.outcome)}</td>
                      <td>{attempt.rawResultCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {report.acquisition.notes.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Acquisition Notes</div>
              <ul className="note-list">
                {report.acquisition.notes.map((note, index) => (
                  <li key={buildListKey("acquisition-note", index)}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel title="Common Issues">
          {report.summary.commonIssues.length > 0 ? (
            <ul className="issue-list">
              {report.summary.commonIssues.map((issue) => (
                <li key={issue.issueType} className="report-card compact-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <strong>{humanize(issue.issueType)}</strong>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        Count across audited pages and viewports
                      </div>
                    </div>
                    <Tag tone={toneForSeverity(issue.count >= 4 ? "high" : "medium")}>
                      {issue.count}
                    </Tag>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No deterministic findings were recorded for this run.
            </p>
          )}
        </Panel>
      </div>

      {report.status === "completed" ? (
        <Panel
          title="Acquisition Review"
          description="Add a known business or promote a discarded acquisition result. Scout will run the same presence, audit, classification, and shortlist rules against the added candidate."
        >
          <CandidateReviewPanel
            discardedCandidates={report.acquisition.discardedCandidates}
            runId={report.runId}
          />
        </Panel>
      ) : null}

      <Panel
        title="Shortlist"
        description="Highest-priority business opportunities ranked from Scout's deterministic presence and audit rules. Directory and marketplace pages stay below in the full market picture."
      >
        {report.shortlist.length > 0 ? (
          <ul className="shortlist">
            {report.shortlist.map((lead, index) => (
              <li key={lead.candidateId} className="report-card">
                <header>
                  <div>
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{lead.businessName}</div>
                    <Link className="inline-link" href={lead.primaryUrl} target="_blank">
                      {lead.primaryUrl}
                    </Link>
                  </div>
                  <Tag tone="warn">Shortlist #{index + 1}</Tag>
                </header>

                <div className="tag-row">
                  <Tag>{humanize(lead.presenceType)}</Tag>
                  <Tag tone={toneForQuality(lead.presenceQuality)}>
                    {humanize(lead.presenceQuality)}
                  </Tag>
                  <Tag tone={toneForConfidence(lead.confidence)}>
                    {humanize(lead.confidence)}
                  </Tag>
                  <Tag>{describeCandidateProvenance(candidatesById.get(lead.candidateId)?.provenance)}</Tag>
                  {lead.opportunityTypes.map((opportunity) => (
                    <Tag key={opportunity} tone="good">
                      {humanize(opportunity)}
                    </Tag>
                  ))}
                </div>

                <ul className="note-list">
                  {lead.reasons.map((reason, index) => (
                    <li key={buildListKey(`shortlist-reason-${lead.candidateId}`, index)}>
                      {reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Scout did not identify any shortlist candidates from this run.
          </p>
        )}
      </Panel>

      <Panel
        title="Outreach Workspace"
        description="Desktop-first outreach grounded on the stored Scout run. Scout can inspect contact paths, recommend the best first channel, and help draft email, short-form, and phone-ready follow-up without turning the product into an automation system."
      >
        <OutreachWorkspace
          aiAvailable={outreach.aiAvailable}
          defaultLength={outreach.defaultLength}
          defaultTone={outreach.defaultTone}
          initialDrafts={outreach.drafts}
          leads={report.shortlist}
          runId={report.runId}
          {...(outreach.model ? { model: outreach.model } : {})}
        />
      </Panel>

      <Panel
        title="Business Breakdowns"
        description="Every candidate kept in the run, including social, directory, marketplace, blocked, and dead presences."
      >
        <ul className="report-list">
          {report.businessBreakdowns.map((business) => {
            const candidateFindings = sortFindings(
              findingsByCandidate.get(business.candidateId) ?? []
            );
            const evidence = candidateFindings.filter((finding) => finding.screenshotUrl).slice(0, 2);
            const candidate = candidatesById.get(business.candidateId);

            return (
              <li key={business.candidateId} className="report-card">
                <header>
                  <div>
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{business.businessName}</div>
                    <Link className="inline-link" href={business.primaryUrl} target="_blank">
                      {business.primaryUrl}
                    </Link>
                  </div>
                  <div className="tag-row">
                    <Tag>Rank {business.searchRank}</Tag>
                    <Tag>{humanize(business.presenceType)}</Tag>
                    <Tag tone={toneForQuality(business.presenceQuality)}>
                      {humanize(business.presenceQuality)}
                    </Tag>
                    <Tag tone={toneForConfidence(business.confidence)}>
                      {humanize(business.confidence)}
                    </Tag>
                    <Tag tone={toneForAuditStatus(business.auditStatus)}>
                      {humanize(business.auditStatus)}
                    </Tag>
                    <Tag>{describeCandidateProvenance(candidate?.provenance)}</Tag>
                  </div>
                </header>

                {candidate?.provenanceNote ? (
                  <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
                    {candidate.provenanceNote}
                  </p>
                ) : null}

                <div className="tag-row">
                  <Tag>{business.findingCount} finding(s)</Tag>
                  {business.highSeverityFindings > 0 ? (
                    <Tag tone="danger">
                      {business.highSeverityFindings} high severity
                    </Tag>
                  ) : null}
                  {business.opportunityTypes.map((opportunity) => (
                    <Tag key={opportunity} tone="good">
                      {humanize(opportunity)}
                    </Tag>
                  ))}
                </div>

                {business.topIssues.length > 0 ? (
                  <div className="tag-row">
                    {business.topIssues.map((issue) => (
                      <Tag key={issue} tone="warn">
                        {humanize(issue)}
                      </Tag>
                    ))}
                  </div>
                ) : null}

                {business.secondaryUrls.length > 0 ? (
                  <div className="section-stack">
                    <div className="section-label">Reviewed Pages</div>
                    <ul className="note-list">
                      <li>Homepage: {business.primaryUrl}</li>
                      {business.secondaryUrls.map((url, index) => (
                        <li key={buildListKey(`secondary-url-${business.candidateId}`, index)}>
                          Secondary: {url}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {business.detectionNotes.length > 0 ? (
                  <div className="section-stack">
                    <div className="section-label">
                      {business.auditStatus === "audited" ? "Detection Notes" : "Skipped Notes"}
                    </div>
                    <ul className="note-list">
                      {business.detectionNotes.map((note, index) => (
                        <li key={buildListKey(`detection-note-${business.candidateId}`, index)}>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {evidence.length > 0 ? (
                  <div className="evidence-grid">
                    {evidence.map((finding) => (
                      <div key={finding.id} className="evidence-card">
                        <img alt={finding.message} src={finding.screenshotUrl} />
                        <div className="muted" style={{ fontSize: "0.9rem" }}>
                          {humanize(finding.pageLabel)} · {humanize(finding.viewport)} ·{" "}
                          {humanize(finding.issueType)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <details>
                  <summary>
                    {business.auditStatus === "audited"
                      ? `Evidence and findings (${candidateFindings.length})`
                      : "Audit details"}
                  </summary>

                  {candidateFindings.length > 0 ? (
                    <table className="finding-table">
                      <thead>
                        <tr>
                          <th>Issue</th>
                          <th>Severity</th>
                          <th>Confidence</th>
                          <th>Viewport</th>
                          <th>Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateFindings.map((finding) => (
                          <tr key={finding.id}>
                            <td>
                              <div>{finding.message}</div>
                              <div className="muted" style={{ marginTop: "0.25rem" }}>
                                {finding.reproductionNote}
                              </div>
                            </td>
                            <td>
                              <Tag tone={toneForSeverity(finding.severity)}>
                                {humanize(finding.severity)}
                              </Tag>
                            </td>
                            <td>
                              <Tag tone={toneForConfidence(finding.confidence)}>
                                {humanize(finding.confidence)}
                              </Tag>
                            </td>
                            <td>{humanize(finding.viewport)}</td>
                            <td>
                              <div>{humanize(finding.pageLabel)}</div>
                              <div className="muted" style={{ marginTop: "0.25rem" }}>
                                {finding.pageUrl}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="muted" style={{ marginBottom: 0 }}>
                      {business.auditStatus === "audited"
                        ? "No audit findings were attached to this candidate."
                        : "This candidate was preserved in the market scan but skipped from site audit."}
                    </p>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      </Panel>

      {report.notes.length > 0 ? (
        <Panel title="Run Notes">
          <ul className="note-list">
            {report.notes.map((note, index) => (
              <li key={buildListKey("run-note", index)}>{note}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
