"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createScoutRunResponseSchema } from "@scout/api-contracts";
import { Tag } from "@scout/ui";

import type { SavedMarketSummary } from "@/lib/server/storage/run-repository";

import { describeSampleQuality, toneForSampleQuality } from "./sample-quality-copy";

export function SavedMarketsPanel({ markets }: { markets: SavedMarketSummary[] }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function rescanMarket(market: SavedMarketSummary) {
    if (pendingKey) {
      return;
    }

    setPendingKey(market.marketKey);
    setErrorMessage(null);

    const response = await fetch("/api/scout/run", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        rawQuery: market.rawQuery
      })
    });
    const payload = createScoutRunResponseSchema.parse(await response.json());

    if (!response.ok) {
      setErrorMessage(payload.errorMessage ?? "Scout could not queue that re-scan.");
      setPendingKey(null);
      return;
    }

    router.push(`/runs/${payload.runId}`);
  }

  return (
    <div className="saved-markets">
      {markets.length > 0 ? (
        <ul className="issue-list">
          {markets.map((market) => (
            <li className="report-card compact-card" key={market.marketKey}>
              <div className="saved-market-row">
                <div>
                  <div style={{ fontWeight: 700 }}>{market.rawQuery}</div>
                  <div className="muted" style={{ marginTop: "0.25rem" }}>
                    {market.marketTerm}
                    {market.locationLabel ? ` / ${market.locationLabel}` : ""} / latest{" "}
                    {new Date(market.latestRunAt).toLocaleString()}
                  </div>
                </div>
                <div className="saved-market-actions">
                  <div className="tag-row">
                    <Tag>{market.runCount} scan{market.runCount === 1 ? "" : "s"}</Tag>
                    {market.latestSampleQuality ? (
                      <Tag tone={toneForSampleQuality(market.latestSampleQuality)}>
                        {describeSampleQuality(market.latestSampleQuality)}
                      </Tag>
                    ) : null}
                  </div>
                  <div className="lead-detail-actions">
                    <Link className="secondary-button" href={`/runs/${market.latestRunId}`}>
                      Latest
                    </Link>
                    <button
                      className="link-button"
                      disabled={Boolean(pendingKey)}
                      onClick={() => void rescanMarket(market)}
                      type="button"
                    >
                      {pendingKey === market.marketKey ? "Queueing..." : "Re-scan"}
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Completed scans will appear here as saved markets.
        </p>
      )}

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
    </div>
  );
}
