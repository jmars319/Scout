"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { leadAnnotationResponseSchema } from "@scout/api-contracts";
import type { LeadInboxItem, LeadStatus } from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  formatLeadUpdatedAt,
  humanizeLeadValue,
  labelForLeadOutreachStatus,
  labelForLeadStatus,
  leadStatusOptions,
  toneForLeadOutreachStatus,
  toneForLeadStatus
} from "./lead-workflow-copy";

type LeadInboxFilter = "all" | "open" | "saved" | "contacted" | "closed" | "due";

interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

const filterOptions: Array<{ value: LeadInboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "due", label: "Due" },
  { value: "open", label: "Open" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" }
];

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function isDue(item: LeadInboxItem, today: string): boolean {
  return Boolean(
    item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  );
}

function matchesFilter(item: LeadInboxItem, filter: LeadInboxFilter, today: string): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return item.annotation.state === "needs_review";
  }

  if (filter === "closed") {
    return isClosed(item.annotation.state);
  }

  if (filter === "due") {
    return isDue(item, today);
  }

  return item.annotation.state === filter;
}

function matchesSearch(item: LeadInboxItem, query: string): boolean {
  const search = query.trim().toLowerCase();

  if (!search) {
    return true;
  }

  return [
    item.businessName,
    item.primaryUrl,
    item.rawQuery,
    item.marketTerm,
    item.locationLabel ?? "",
    item.annotation.operatorNote,
    ...item.reasons
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}

function buildExportHref(format: "csv" | "markdown", filter: LeadInboxFilter, query: string): string {
  const params = new URLSearchParams({ format });
  const trimmed = query.trim();

  if (filter !== "all") {
    params.set("filter", filter);
  }

  if (trimmed) {
    params.set("q", trimmed);
  }

  return `/api/leads/export?${params.toString()}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

export function LeadInbox({
  initialItems,
  today
}: {
  initialItems: LeadInboxItem[];
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<LeadInboxFilter>("all");
  const [query, setQuery] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [messageByKey, setMessageByKey] = useState<Record<string, LeadMessage>>({});

  const counts = useMemo(() => {
    return {
      total: items.length,
      due: items.filter((item) => isDue(item, today)).length,
      open: items.filter((item) => item.annotation.state === "needs_review").length,
      saved: items.filter((item) => item.annotation.state === "saved").length,
      contacted: items.filter((item) => item.annotation.state === "contacted").length,
      closed: items.filter((item) => isClosed(item.annotation.state)).length
    };
  }, [items, today]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const itemKey = `${item.runId}:${item.candidateId}`;
        const isUnsaved = messageByKey[itemKey]?.text === "Unsaved";
        return (isUnsaved || matchesFilter(item, filter, today)) && matchesSearch(item, query);
      }),
    [filter, items, messageByKey, query, today]
  );

  function updateLead(
    item: LeadInboxItem,
    apply: (annotation: LeadInboxItem["annotation"]) => LeadInboxItem["annotation"]
  ) {
    const itemKey = `${item.runId}:${item.candidateId}`;
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.runId === item.runId && currentItem.candidateId === item.candidateId
          ? { ...currentItem, annotation: apply(currentItem.annotation) }
          : currentItem
      )
    );
    setMessageByKey((current) => ({
      ...current,
      [itemKey]: { text: "Unsaved", tone: "neutral" }
    }));
  }

  async function saveLead(item: LeadInboxItem) {
    const itemKey = `${item.runId}:${item.candidateId}`;

    if (pendingKey) {
      return;
    }

    setPendingKey(itemKey);

    const response = await fetch(
      `/api/runs/${encodeURIComponent(item.runId)}/leads/${encodeURIComponent(item.candidateId)}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          state: item.annotation.state,
          operatorNote: item.annotation.operatorNote,
          followUpDate: item.annotation.followUpDate || null
        })
      }
    );

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      setMessageByKey((current) => ({
        ...current,
        [itemKey]: { text: errorMessage, tone: "danger" }
      }));
      setPendingKey(null);
      return;
    }

    const body = leadAnnotationResponseSchema.parse(await response.json());
    if (body.annotation) {
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.runId === item.runId && currentItem.candidateId === item.candidateId
            ? { ...currentItem, annotation: body.annotation! }
            : currentItem
        )
      );
    }

    setMessageByKey((current) => ({
      ...current,
      [itemKey]: { text: "Saved", tone: "good" }
    }));
    setPendingKey(null);
  }

  return (
    <div className="lead-inbox">
      <div className="lead-inbox-toolbar">
        <div className="tag-row">
          <Tag>{counts.total} Leads</Tag>
          <Tag tone={counts.due > 0 ? "warn" : "neutral"}>{counts.due} Due</Tag>
          <Tag>{counts.open} Open</Tag>
          <Tag tone="good">{counts.saved} Saved</Tag>
          <Tag tone="warn">{counts.contacted} Contacted</Tag>
          <Tag tone="danger">{counts.closed} Closed</Tag>
        </div>

        <div className="lead-inbox-actions">
          <a className="secondary-button" href={buildExportHref("csv", filter, query)}>
            CSV
          </a>
          <a className="secondary-button" href={buildExportHref("markdown", filter, query)}>
            Markdown
          </a>
        </div>
      </div>

      <div className="lead-inbox-search">
        <input
          aria-label="Search leads"
          className="draft-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search leads"
          value={query}
        />
        <div className="outreach-toolbar" role="tablist" aria-label="Lead inbox filter">
          {filterOptions.map((option) => (
            <button
              aria-selected={filter === option.value}
              className={`pill-button${filter === option.value ? " active" : ""}`}
              key={option.value}
              onClick={() => setFilter(option.value)}
              role="tab"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <ul className="lead-inbox-list">
          {visibleItems.map((item) => {
            const itemKey = `${item.runId}:${item.candidateId}`;
            const message = messageByKey[itemKey];
            const busy = pendingKey === itemKey;

            return (
              <li className="report-card lead-inbox-card" key={itemKey}>
                <div className="lead-inbox-card-head">
                  <div className="lead-inbox-title">
                    <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{item.businessName}</div>
                    {item.primaryUrl ? (
                      <a className="inline-link" href={item.primaryUrl} target="_blank">
                        {item.primaryUrl}
                      </a>
                    ) : null}
                  </div>
                  <div className="tag-row">
                    <Tag tone={toneForLeadStatus(item.annotation.state)}>
                      {labelForLeadStatus(item.annotation.state)}
                    </Tag>
                    {isDue(item, today) ? <Tag tone="warn">Due</Tag> : null}
                    <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
                      {labelForLeadOutreachStatus(item.outreach.status)}
                    </Tag>
                    {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
                    {item.priorityScore ? <Tag>{item.priorityScore} pts</Tag> : null}
                  </div>
                </div>

                <div className="lead-inbox-meta">
                  <div>
                    <div className="section-label">Run</div>
                    <Link className="inline-link" href={`/runs/${encodeURIComponent(item.runId)}`}>
                      {item.marketTerm}
                    </Link>
                    <div className="muted">{item.rawQuery}</div>
                  </div>
                  <div className="tag-row">
                    {item.locationLabel ? <Tag>{item.locationLabel}</Tag> : null}
                    {item.presenceType ? <Tag>{humanizeLeadValue(item.presenceType)}</Tag> : null}
                    {item.presenceQuality ? <Tag>{humanizeLeadValue(item.presenceQuality)}</Tag> : null}
                    {item.confidence ? <Tag>{humanizeLeadValue(item.confidence)}</Tag> : null}
                    <Tag>{item.findingCount} findings</Tag>
                    {item.highSeverityFindings > 0 ? (
                      <Tag tone="danger">{item.highSeverityFindings} high severity</Tag>
                    ) : null}
                  </div>
                </div>

                <div className="lead-inbox-outreach">
                  <div>
                    <div className="section-label">Next Action</div>
                    <div style={{ fontWeight: 700 }}>{item.outreach.nextAction}</div>
                    <div className="muted">
                      {item.outreach.recommendedChannelLabel ??
                        (item.outreach.recommendedChannel
                          ? humanizeLeadValue(item.outreach.recommendedChannel)
                          : "No recommended channel yet")}
                    </div>
                  </div>
                  <div className="lead-inbox-actions">
                    <Link
                      className="secondary-button"
                      href={`/runs/${encodeURIComponent(item.runId)}`}
                    >
                      Report
                    </Link>
                    <Link
                      className="link-button"
                      href={`/runs/${encodeURIComponent(item.runId)}#outreach-workspace`}
                    >
                      Outreach
                    </Link>
                  </div>
                </div>

                {item.reasons.length > 0 || item.topIssues.length > 0 ? (
                  <ul className="note-list">
                    {item.topIssues.slice(0, 2).map((issue) => (
                      <li key={`${itemKey}-issue-${issue}`}>{humanizeLeadValue(issue)}</li>
                    ))}
                    {item.reasons.slice(0, 2).map((reason, index) => (
                      <li key={`${itemKey}-reason-${index}`}>{reason}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="lead-inbox-controls">
                  <label className="field-stack">
                    <span className="section-label">State</span>
                    <select
                      className="draft-input"
                      onChange={(event) =>
                        updateLead(item, (annotation) => ({
                          ...annotation,
                          state: event.target.value as LeadStatus
                        }))
                      }
                      value={item.annotation.state}
                    >
                      {leadStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-stack">
                    <span className="section-label">Follow Up</span>
                    <input
                      className="draft-input"
                      onChange={(event) =>
                        updateLead(item, (annotation) => ({
                          ...annotation,
                          followUpDate: event.target.value || undefined
                        }))
                      }
                      type="date"
                      value={item.annotation.followUpDate ?? ""}
                    />
                  </label>
                </div>

                <label className="field-stack">
                  <span className="section-label">Operator Note</span>
                  <textarea
                    className="draft-textarea lead-note-textarea"
                    maxLength={1600}
                    onChange={(event) =>
                      updateLead(item, (annotation) => ({
                        ...annotation,
                        operatorNote: event.target.value
                      }))
                    }
                    value={item.annotation.operatorNote}
                  />
                </label>

                <div className="lead-inbox-save-row">
                  {message ? (
                    <span className={`status-note ${message.tone}`}>{message.text}</span>
                  ) : (
                    <span className="muted">Updated {formatLeadUpdatedAt(item.annotation.updatedAt)}</span>
                  )}
                  <button
                    className="link-button"
                    disabled={Boolean(pendingKey)}
                    onClick={() => void saveLead(item)}
                    type="button"
                  >
                    {busy ? "Saving..." : "Save"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No leads match this view.
        </p>
      )}
    </div>
  );
}
