import Link from "next/link";

import { APP_NAME } from "@scout/config";
import { AppFrame, Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import { RunForm } from "@/components/RunForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listRecentScoutRuns } from "@/lib/server/scout-runner";

export const dynamic = "force-dynamic";

function humanizeSampleQuality(sampleQuality?: string): string {
  if (!sampleQuality) {
    return "In Progress";
  }

  return sampleQuality
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export default async function HomePage() {
  const recentRuns = await listRecentScoutRuns(6);

  return (
    <AppFrame
      eyebrow="Scout v1"
      title={APP_NAME}
      description="Live-search market scanning for who exists, what kind of web presence they have, what is broken or missing, and which businesses are worth acting on."
      actions={<ThemeToggle />}
    >
      <div className="scout-shell">
        <Panel
          title="Run a market scan"
          description="Start with a structured business type plus city/state, or override it with one custom query. Scout still runs the same narrow flow: resolve market intent, gather 10 to 15 candidate presences, audit owned websites where possible, and return a deterministic report."
        >
          <RunForm />
        </Panel>

        <MetricGrid>
          <Metric label="Flow" value="Input → Run → Report" />
          <Metric label="Search Scope" value="10–15 candidates" />
          <Metric label="Audit Passes" value="Desktop + Mobile" />
          <Metric label="Evidence" value="Screenshots per page" />
        </MetricGrid>

        <div className="scout-grid two-up">
          <Panel title="What Scout Is">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="good">Market scanner</Tag>
              <Tag tone="good">Deterministic audit</Tag>
              <Tag tone="good">Lead shortlist</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Scout is live-search and evidence-led. It classifies owned sites, directory-only
              presences, social-only presences, dead sites, blocked sites, and unclear results before
              deciding what should be audited.
            </p>
          </Panel>

          <Panel title="What Scout Is Not">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="warn">Not a crawler</Tag>
              <Tag tone="warn">Not an SEO suite</Tag>
              <Tag tone="warn">Not an AI-first app</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              The MVP stays thin: one query, one run, one report. No dashboard sprawl, no outreach
              automation, no deep crawl, and no AI pretending to replace deterministic evidence.
            </p>
          </Panel>
        </div>

        <Panel
          title="Recent Runs"
          description="Postgres-backed Scout runs. New runs queue here first, then the worker updates lifecycle state and final report data."
        >
          {recentRuns.length > 0 ? (
            <ul className="issue-list">
              {recentRuns.map((run) => (
                <li key={run.runId} className="report-card compact-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      alignItems: "flex-start"
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{run.rawQuery}</div>
                      <div className="muted" style={{ marginTop: "0.25rem" }}>
                        {run.marketTerm} • {new Date(run.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tag-row" style={{ justifyContent: "flex-end" }}>
                        <Tag
                          tone={
                            run.status === "completed"
                              ? "good"
                              : run.status === "failed"
                                ? "danger"
                                : "warn"
                          }
                        >
                          {run.status}
                        </Tag>
                        <Tag>{humanizeSampleQuality(run.sampleQuality)}</Tag>
                      </div>
                      {run.status === "completed" || run.status === "failed" ? (
                        <div style={{ marginTop: "0.65rem" }}>
                          <Link className="inline-link" href={`/runs/${run.runId}`}>
                            Open run
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No Scout runs are stored in Postgres yet.
            </p>
          )}
        </Panel>
      </div>
    </AppFrame>
  );
}
