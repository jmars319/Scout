import Link from "next/link";

import type { AuditFinding, ScoutRunReport } from "@scout/domain";
import { Metric, MetricGrid, Panel, Tag } from "@scout/ui";

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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

function toneForSampleQuality(sampleQuality: ScoutRunReport["summary"]["sampleQuality"]): "neutral" | "good" | "warn" | "danger" {
  if (sampleQuality === "strong_sample") {
    return "good";
  }

  if (sampleQuality === "adequate_sample") {
    return "neutral";
  }

  if (sampleQuality === "partial_sample") {
    return "warn";
  }

  return "danger";
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

export function ReportView({ report }: { report: ScoutRunReport }) {
  const findingsByCandidate = groupFindings(report.findings);
  const ownedWebsiteCount = report.presences.filter(
    (presence) => presence.presenceType === "owned_website"
  ).length;
  const acquisitionVariants = report.acquisition.queryVariants.filter(
    (variant) => variant.rawResultCount > 0 || variant.acceptedResultCount > 0
  );

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
          label="Sample Quality"
          value={humanize(report.summary.sampleQuality)}
          tone={
            report.summary.sampleQuality === "strong_sample"
              ? "good"
              : report.summary.sampleQuality === "partial_sample" ||
                  report.summary.sampleQuality === "weak_sample"
                ? "warn"
                : "neutral"
          }
        />
        <Metric label="Shortlist" value={report.shortlist.length} tone="warn" />
      </MetricGrid>

      <div className="scout-grid two-up">
        <Panel title="Market Summary">
          <div className="tag-row" style={{ marginBottom: "0.9rem" }}>
            <Tag tone="good">{report.searchSource}</Tag>
            <Tag tone={toneForSampleQuality(report.summary.sampleQuality)}>
              {humanize(report.summary.sampleQuality)}
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
            <Tag tone="good">{report.acquisition.provider}</Tag>
            {report.acquisition.fallbackUsed ? <Tag tone="warn">Fallback Used</Tag> : null}
            <Tag tone={toneForSampleQuality(report.acquisition.sampleQuality)}>
              {humanize(report.acquisition.sampleQuality)}
            </Tag>
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
          </div>

          <div className="section-stack" style={{ marginTop: "1rem" }}>
            <div className="section-label">Query Variants</div>
            {acquisitionVariants.length > 0 ? (
              <table className="finding-table">
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
                      <td>{humanize(variant.label)}</td>
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

          {report.acquisition.notes.length > 0 ? (
            <div className="section-stack" style={{ marginTop: "1rem" }}>
              <div className="section-label">Acquisition Notes</div>
              <ul className="note-list">
                {report.acquisition.notes.map((note) => (
                  <li key={note}>{note}</li>
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

      <Panel
        title="Shortlist"
        description="Highest-priority opportunities ranked from Scout's deterministic presence and audit rules."
      >
        {report.shortlist.length > 0 ? (
          <ul className="shortlist">
            {report.shortlist.map((lead) => (
              <li key={lead.candidateId} className="report-card">
                <header>
                  <div>
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{lead.businessName}</div>
                    <Link className="inline-link" href={lead.primaryUrl} target="_blank">
                      {lead.primaryUrl}
                    </Link>
                  </div>
                  <Tag tone="warn">Priority {lead.priorityScore}</Tag>
                </header>

                <div className="tag-row">
                  <Tag>{humanize(lead.presenceType)}</Tag>
                  <Tag tone={toneForQuality(lead.presenceQuality)}>
                    {humanize(lead.presenceQuality)}
                  </Tag>
                  <Tag tone={toneForConfidence(lead.confidence)}>
                    {humanize(lead.confidence)}
                  </Tag>
                  {lead.opportunityTypes.map((opportunity) => (
                    <Tag key={opportunity} tone="good">
                      {humanize(opportunity)}
                    </Tag>
                  ))}
                </div>

                <ul className="note-list">
                  {lead.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
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
        title="Business Breakdowns"
        description="Every candidate kept in the run, including social, directory, marketplace, blocked, and dead presences."
      >
        <ul className="report-list">
          {report.businessBreakdowns.map((business) => {
            const candidateFindings = sortFindings(
              findingsByCandidate.get(business.candidateId) ?? []
            );
            const evidence = candidateFindings.filter((finding) => finding.screenshotUrl).slice(0, 2);

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
                  </div>
                </header>

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
                      {business.secondaryUrls.map((url) => (
                        <li key={url}>Secondary: {url}</li>
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
                      {business.detectionNotes.map((note) => (
                        <li key={note}>{note}</li>
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
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
