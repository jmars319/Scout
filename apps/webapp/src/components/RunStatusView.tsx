"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import type { PersistedRunRecord } from "@/lib/server/storage/run-repository";

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function RunStatusView({ record }: { record: PersistedRunRecord }) {
  const router = useRouter();
  const autoRefresh = record.status === "queued" || record.status === "running";

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefresh, router]);

  return (
    <div className="scout-shell">
      <Panel
        title={record.status === "queued" ? "Run Queued" : "Run Running"}
        description="Scout stores the run immediately, then the worker process picks it up and writes progress back through Postgres."
      >
        <div className="tag-row" style={{ marginBottom: "1rem" }}>
          <Tag tone={record.status === "running" ? "warn" : "neutral"}>
            {humanize(record.status)}
          </Tag>
          <Tag>Attempts {record.execution.attemptCount}</Tag>
          {record.execution.workerId ? <Tag>{record.execution.workerId}</Tag> : null}
        </div>

        <MetricGrid>
          <Metric label="Queued At" value={new Date(record.execution.queuedAt).toLocaleString()} />
          <Metric
            label="Started At"
            value={
              record.execution.startedAt
                ? new Date(record.execution.startedAt).toLocaleString()
                : "Waiting"
            }
            tone={record.execution.startedAt ? "warn" : "neutral"}
          />
          <Metric label="Status" value={humanize(record.status)} tone="warn" />
          <Metric label="Run ID" value={record.runId.slice(0, 18)} />
        </MetricGrid>

        <p className="muted" style={{ marginTop: "1rem", marginBottom: "1rem", lineHeight: 1.65 }}>
          {autoRefresh
            ? "This page refreshes every 4 seconds while the worker is processing the scan."
            : "This run is no longer active."}
        </p>

        {record.execution.lastErrorMessage ? (
          <div className="error-banner">
            <strong>Last worker note.</strong>
            <div style={{ marginTop: "0.45rem" }}>{record.execution.lastErrorMessage}</div>
          </div>
        ) : null}

        <button onClick={() => router.refresh()} type="button">
          Refresh status
        </button>
      </Panel>
    </div>
  );
}
