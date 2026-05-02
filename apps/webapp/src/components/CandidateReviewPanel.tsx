"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import type { ScoutRunReport } from "@scout/domain";
import { Tag } from "@scout/ui";

type DiscardedCandidate = ScoutRunReport["acquisition"]["discardedCandidates"][number];

function canPromote(candidate: DiscardedCandidate): boolean {
  return Boolean(candidate.url && candidate.title);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this report.";
  } catch {
    return "Scout could not update this report.";
  }
}

export function CandidateReviewPanel({
  runId,
  discardedCandidates
}: {
  runId: string;
  discardedCandidates: DiscardedCandidate[];
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [url, setUrl] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const promotableCandidates = useMemo(
    () => discardedCandidates.filter(canPromote).slice(0, 8),
    [discardedCandidates]
  );
  const hasManualInput = businessName.trim().length >= 2 && url.trim().length >= 4;

  async function submitManualCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasManualInput || pendingAction) {
      return;
    }

    setPendingAction("manual");
    setErrorMessage(null);

    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/candidates`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "manual",
        businessName,
        url
      })
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response));
      setPendingAction(null);
      return;
    }

    setBusinessName("");
    setUrl("");
    setPendingAction(null);
    router.refresh();
  }

  async function promoteDiscarded(candidate: DiscardedCandidate) {
    if (pendingAction || !canPromote(candidate)) {
      return;
    }

    setPendingAction(candidate.candidateId);
    setErrorMessage(null);

    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/candidates`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "promote_discarded",
        discardedCandidateId: candidate.candidateId
      })
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response));
      setPendingAction(null);
      return;
    }

    setPendingAction(null);
    router.refresh();
  }

  return (
    <div className="candidate-review">
      <form className="candidate-review-form" onSubmit={(event) => void submitManualCandidate(event)}>
        <div className="section-label">Manual Candidate</div>
        <div className="candidate-review-fields">
          <input
            aria-label="Business name"
            className="draft-input"
            maxLength={140}
            onChange={(event) => setBusinessName(event.target.value)}
            placeholder="Business name"
            value={businessName}
          />
          <input
            aria-label="Business website or profile URL"
            className="draft-input"
            maxLength={400}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Website or profile URL"
            value={url}
          />
          <button className="link-button" disabled={!hasManualInput || Boolean(pendingAction)}>
            {pendingAction === "manual" ? "Adding..." : "Add and Evaluate"}
          </button>
        </div>
      </form>

      {promotableCandidates.length > 0 ? (
        <div className="section-stack">
          <div className="section-label">Promote Discarded Results</div>
          <ul className="candidate-review-list">
            {promotableCandidates.map((candidate) => (
              <li key={candidate.candidateId} className="candidate-review-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{candidate.title}</div>
                  <div className="muted">{candidate.url}</div>
                  <div className="muted" style={{ marginTop: "0.25rem" }}>
                    {candidate.reason}
                  </div>
                </div>
                <div className="candidate-review-actions">
                  {candidate.source ? <Tag>{candidate.source}</Tag> : null}
                  <button
                    className="secondary-button"
                    disabled={Boolean(pendingAction)}
                    onClick={() => void promoteDiscarded(candidate)}
                    type="button"
                  >
                    {pendingAction === candidate.candidateId ? "Promoting..." : "Promote"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No discarded candidates from this run have enough saved detail to promote.
        </p>
      )}

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </div>
  );
}
