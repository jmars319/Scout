"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Metric, MetricGrid, Panel, Tag } from "@scout/ui";
import type { RunExecutionStage } from "@scout/domain";

import { RunControlActions } from "./RunControlActions";
import type { PersistedRunRecord } from "@/lib/server/storage/run-repository";

const REFRESH_INTERVAL_MS = 4_000;
const STALE_HEARTBEAT_MS = 25_000;

const progressStages: Array<{
  id: RunExecutionStage;
  label: string;
  description: string;
}> = [
  {
    id: "queued",
    label: "Queued",
    description: "Run stored and waiting for a worker."
  },
  {
    id: "starting",
    label: "Starting",
    description: "Worker claimed the run and is preparing dependencies."
  },
  {
    id: "acquiring_candidates",
    label: "Acquiring",
    description: "Gathering live market candidates from the search providers."
  },
  {
    id: "evaluating_presences",
    label: "Presence",
    description: "Evaluating candidate ownership and destination quality."
  },
  {
    id: "auditing_websites",
    label: "Auditing",
    description: "Running website audits across owned sites and viewports."
  },
  {
    id: "building_shortlist",
    label: "Shortlist",
    description: "Classifying findings and building ranked opportunities."
  },
  {
    id: "finalizing_report",
    label: "Finalizing",
    description: "Saving the report and preparing the result view."
  },
  {
    id: "completed",
    label: "Completed",
    description: "Run finished and report saved."
  }
];

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatRelativeDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function resolveCurrentStage(record: PersistedRunRecord): RunExecutionStage {
  if (record.status === "completed") {
    return "completed";
  }

  if (record.status === "failed") {
    return "failed";
  }

  return record.execution.stage ?? (record.status === "queued" ? "queued" : "starting");
}

function resolveCurrentStageMeta(
  record: PersistedRunRecord
): { label: string; description: string } {
  const currentStage = resolveCurrentStage(record);

  if (currentStage === "failed") {
    return {
      label: "Failed",
      description: "Scout stopped before the report could be completed."
    };
  }

  const matched = progressStages.find((stage) => stage.id === currentStage);
  return (
    matched ?? {
      label: humanize(currentStage),
      description: "Scout is still processing this run."
    }
  );
}

export function RunStatusView({ record }: { record: PersistedRunRecord }) {
  const router = useRouter();
  const autoRefresh = record.status === "queued" || record.status === "running";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const currentStage = resolveCurrentStage(record);
  const currentStageMeta = resolveCurrentStageMeta(record);
  const heartbeatAtMs = record.execution.heartbeatAt
    ? new Date(record.execution.heartbeatAt).getTime()
    : null;
  const startedAtMs = record.execution.startedAt
    ? new Date(record.execution.startedAt).getTime()
    : null;
  const heartbeatAgeMs = heartbeatAtMs ? Math.max(0, nowMs - heartbeatAtMs) : null;
  const elapsedMs = startedAtMs ? Math.max(0, nowMs - startedAtMs) : null;
  const looksStalled =
    autoRefresh && heartbeatAgeMs !== null && heartbeatAgeMs > STALE_HEARTBEAT_MS;
  const currentWorkerNote =
    record.execution.workerNote ??
    record.execution.lastErrorMessage ??
    currentStageMeta.description;

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const refreshId = window.setInterval(() => {
      router.refresh();
    }, REFRESH_INTERVAL_MS);
    const tickId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
    };
  }, [autoRefresh, router]);

  return (
    <div className="scout-shell">
      <Panel
        title={record.status === "queued" ? "Run Queued" : record.status === "running" ? "Run Running" : "Run Status"}
        description="Scout stores the run immediately, then the worker process picks it up and writes execution progress back through Postgres."
      >
        <div className="tag-row" style={{ marginBottom: "1rem" }}>
          <Tag tone={record.status === "running" ? "warn" : record.status === "failed" ? "danger" : "neutral"}>
            {humanize(record.status)}
          </Tag>
          <Tag tone={record.status === "completed" ? "good" : "neutral"}>
            {currentStageMeta.label}
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
          <Metric
            label="Last Heartbeat"
            value={
              record.execution.heartbeatAt
                ? `${new Date(record.execution.heartbeatAt).toLocaleTimeString()} (${formatRelativeDuration(
                    heartbeatAgeMs ?? 0
                  )} ago)`
                : "Not yet"
            }
            tone={looksStalled ? "warn" : record.status === "completed" ? "good" : "neutral"}
          />
          <Metric
            label="Elapsed"
            value={elapsedMs !== null ? formatRelativeDuration(elapsedMs) : "Waiting"}
            tone={record.status === "completed" ? "good" : "neutral"}
          />
        </MetricGrid>

        <div className="progress-track" style={{ marginTop: "1rem" }}>
          {progressStages.map((stage) => {
            const currentIndex = progressStages.findIndex((entry) => entry.id === currentStage);
            const stageIndex = progressStages.findIndex((entry) => entry.id === stage.id);
            const state =
              record.status === "failed"
                ? stage.id === currentStage
                  ? "failed"
                  : stageIndex < currentIndex
                    ? "completed"
                    : "pending"
                : currentIndex === stageIndex
                  ? "active"
                  : currentIndex > stageIndex
                    ? "completed"
                    : "pending";

            return (
              <div key={stage.id} className={`progress-step ${state}`}>
                <div className="progress-step-head">
                  <span className="progress-dot" />
                  <strong>{stage.label}</strong>
                </div>
                <div className="muted" style={{ fontSize: "0.92rem", lineHeight: 1.5 }}>
                  {stage.description}
                </div>
              </div>
            );
          })}
        </div>

        <div className={looksStalled ? "error-banner" : "status-note neutral"} style={{ marginTop: "1rem" }}>
          <strong>{looksStalled ? "Heartbeat warning." : "Current worker note."}</strong>
          <div style={{ marginTop: "0.45rem" }}>{currentWorkerNote}</div>
          {looksStalled ? (
            <div style={{ marginTop: "0.45rem" }}>
              Scout has not written a fresh heartbeat for {formatRelativeDuration(heartbeatAgeMs ?? 0)}.
              The run may be waiting on a provider, or it may have stalled.
            </div>
          ) : null}
        </div>

        <p className="muted" style={{ marginTop: "1rem", marginBottom: "1rem", lineHeight: 1.65 }}>
          {autoRefresh
            ? "This page refreshes every 4 seconds while the worker is active."
            : "This run is no longer active."}
        </p>

        {record.status === "failed" && record.execution.lastErrorMessage ? (
          <div className="error-banner" style={{ marginBottom: "1rem" }}>
            <strong>Failure detail.</strong>
            <div style={{ marginTop: "0.45rem" }}>{record.execution.lastErrorMessage}</div>
          </div>
        ) : null}

        <div className="run-status-actions">
          <button className="secondary-button" onClick={() => router.refresh()} type="button">
            Refresh status
          </button>
          <RunControlActions
            runId={record.runId}
            showCleanup={looksStalled || record.status === "failed"}
            status={record.status}
          />
        </div>
      </Panel>
    </div>
  );
}
