"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  buildStructuredScoutQuery,
  normalizeStructuredLocationInput,
  normalizeStructuredBusinessTypeInput,
  SCOUT_BUSINESS_TYPE_SUGGESTIONS,
  SCOUT_CITY_STATE_SUGGESTIONS
} from "@scout/domain";

const EXAMPLES = [
  {
    businessType: "dentist",
    location: "Columbus, OH"
  },
  {
    businessType: "roofing company",
    location: "Raleigh, NC"
  },
  {
    businessType: "computer store",
    location: "Winston-Salem, NC"
  }
] as const;

export function RunForm() {
  const router = useRouter();
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const builtQuery = buildStructuredScoutQuery({
    businessType,
    location
  });
  const rawQuery = customQuery.trim() || builtQuery;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!rawQuery) {
        throw new Error("Choose a business type and city/state, or enter a custom query.");
      }

      const response = await fetch("/api/scout/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          rawQuery
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
      <div className="run-form-grid">
        <label className="field-stack" htmlFor="scout-business-type">
          <strong>Business type</strong>
          <input
            id="scout-business-type"
            name="businessType"
            list="scout-business-type-options"
            placeholder="e.g. landscaping company"
            value={businessType}
            onChange={(event) => {
              setBusinessType(event.target.value);
              if (customQuery.trim()) {
                setCustomQuery("");
              }
            }}
            onBlur={(event) => {
              setBusinessType(normalizeStructuredBusinessTypeInput(event.target.value));
            }}
            required={!customQuery.trim()}
            minLength={2}
          />
        </label>

        <label className="field-stack" htmlFor="scout-location">
          <strong>City, state</strong>
          <input
            id="scout-location"
            name="location"
            list="scout-location-options"
            placeholder="e.g. Winston-Salem, NC"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              if (customQuery.trim()) {
                setCustomQuery("");
              }
            }}
            onBlur={(event) => {
              setLocation(normalizeStructuredLocationInput(event.target.value));
            }}
            required={!customQuery.trim()}
            minLength={3}
          />
        </label>
      </div>

      <div className="muted">
        Start with the structured builder first. It includes hundreds of common business types,
        major U.S. cities, and a deeper North Carolina town list.
      </div>

      <div className="query-preview" aria-live="polite">
        <div className="section-label">Scout Query</div>
        {rawQuery ? (
          <strong>{rawQuery}</strong>
        ) : (
          <span className="muted">
            Pick a business type and city/state to compose a clean Scout market query.
          </span>
        )}
      </div>

      <details>
        <summary>Use a custom query instead</summary>
        <div className="section-stack" style={{ marginTop: "0.85rem" }}>
          <label className="field-stack" htmlFor="scout-custom-query">
            <strong>Custom query</strong>
            <input
              id="scout-custom-query"
              name="customQuery"
              placeholder="e.g. family dentists near Chapel Hill, NC"
              value={customQuery}
              onChange={(event) => setCustomQuery(event.target.value)}
              minLength={3}
            />
          </label>
          <div className="muted">
            Custom query overrides the structured builder above, but Scout still stores one raw query
            and runs the same narrow flow.
          </div>
        </div>
      </details>

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
            <button
              key={`${example.businessType}-${example.location}`}
              type="button"
              onClick={() => {
                setBusinessType(normalizeStructuredBusinessTypeInput(example.businessType));
                setLocation(example.location);
                setCustomQuery("");
              }}
            >
              {buildStructuredScoutQuery(example)}
            </button>
          ))}
        </div>
      </div>

      <datalist id="scout-business-type-options">
        {SCOUT_BUSINESS_TYPE_SUGGESTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <datalist id="scout-location-options">
        {SCOUT_CITY_STATE_SUGGESTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </form>
  );
}
