"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runControlActionResponseSchema } from "@scout/api-contracts";
import type { RunStatus } from "@scout/domain";

type RunControlAction = "cancel" | "retry" | "rerun" | "cleanup_stale";

interface RunControlMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update that run.";
  } catch {
    return "Scout could not update that run.";
  }
}

function labelForPendingAction(action: RunControlAction): string {
  if (action === "cancel") {
    return "Canceling...";
  }

  if (action === "retry") {
    return "Retrying...";
  }

  if (action === "cleanup_stale") {
    return "Checking...";
  }

  return "Queueing...";
}

export function RunControlActions({
  runId,
  status,
  showCleanup = false
}: {
  runId: string;
  status: RunStatus;
  showCleanup?: boolean | undefined;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<RunControlAction | null>(null);
  const [message, setMessage] = useState<RunControlMessage | null>(null);
  const isActive = status === "queued" || status === "running";

  async function runAction(action: RunControlAction) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    setMessage({ text: labelForPendingAction(action), tone: "neutral" });

    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/actions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      setPendingAction(null);
      return;
    }

    const body = runControlActionResponseSchema.parse(await response.json());

    if (body.newRunId) {
      router.push(`/runs/${body.newRunId}`);
      return;
    }

    setMessage({
      text:
        action === "cleanup_stale"
          ? `Re-queued ${body.requeuedCount ?? 0} stale run${body.requeuedCount === 1 ? "" : "s"}.`
          : action === "cancel"
            ? "Run canceled"
            : "Run re-queued",
      tone: "good"
    });
    setPendingAction(null);
    router.refresh();
  }

  return (
    <div className="run-control-actions">
      <div className="lead-detail-actions">
        {isActive ? (
          <button
            className="secondary-button"
            disabled={Boolean(pendingAction)}
            onClick={() => void runAction("cancel")}
            type="button"
          >
            {pendingAction === "cancel" ? "Canceling..." : "Cancel Run"}
          </button>
        ) : null}
        {status === "failed" ? (
          <button
            className="secondary-button"
            disabled={Boolean(pendingAction)}
            onClick={() => void runAction("retry")}
            type="button"
          >
            {pendingAction === "retry" ? "Retrying..." : "Retry Run"}
          </button>
        ) : null}
        {showCleanup ? (
          <button
            className="secondary-button"
            disabled={Boolean(pendingAction)}
            onClick={() => void runAction("cleanup_stale")}
            type="button"
          >
            {pendingAction === "cleanup_stale" ? "Checking..." : "Requeue Stale"}
          </button>
        ) : null}
        <button
          className="link-button"
          disabled={Boolean(pendingAction)}
          onClick={() => void runAction("rerun")}
          type="button"
        >
          {pendingAction === "rerun" ? "Queueing..." : "Run Again"}
        </button>
      </div>
      {message ? <span className={`status-note ${message.tone}`}>{message.text}</span> : null}
    </div>
  );
}
