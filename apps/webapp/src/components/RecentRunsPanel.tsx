import Link from "next/link";

import { Panel, Tag } from "@scout/ui";

import type { RecentRunSummary } from "@/lib/server/storage/run-repository";

import { describeSampleQuality } from "./sample-quality-copy";

function describeRunLink(status: RecentRunSummary["status"]): string {
  return status === "queued" || status === "running" ? "View progress" : "Open report";
}

export function RecentRunsPanel({
  runs,
  title = "Recent Runs",
  description = "Postgres-backed Scout runs. New runs queue here first, then the worker updates lifecycle state and final report data."
}: {
  runs: RecentRunSummary[];
  title?: string;
  description?: string;
}) {
  return (
    <Panel description={description} title={title}>
      {runs.length > 0 ? (
        <ul className="issue-list">
          {runs.map((run) => (
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
                    <Tag>{describeSampleQuality(run.sampleQuality)}</Tag>
                  </div>
                  <div style={{ marginTop: "0.65rem" }}>
                    <Link className="inline-link" href={`/runs/${run.runId}`}>
                      {describeRunLink(run.status)}
                    </Link>
                  </div>
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
  );
}
