"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  "dentists in Columbus, OH",
  "roofing companies near Raleigh, NC",
  "pilates studios in Brooklyn, NY"
];

export function RunForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/scout/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          rawQuery: query
        })
      });

      const payload = (await response.json()) as {
        runId?: string;
        errorMessage?: string;
      };

      if (!response.ok || !payload.runId) {
        throw new Error(payload.errorMessage || "Scout could not start that run.");
      }

      router.push(`/runs/${payload.runId}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown run failure.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="run-form" onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="scout-query">
        <strong>Market query</strong>
      </label>
      <input
        id="scout-query"
        name="query"
        placeholder="e.g. family dentists in Columbus, OH"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        required
        minLength={3}
      />
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button disabled={submitting} type="submit">
          {submitting ? "Queueing Scout..." : "Run Scout"}
        </button>
        <span className="muted" style={{ alignSelf: "center" }}>
          Search, type, audit, classify, report.
        </span>
      </div>

      <div>
        <div className="muted" style={{ marginBottom: "0.5rem" }}>
          Try one of these:
        </div>
        <div className="example-list">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setQuery(example)}>
              {example}
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </form>
  );
}
