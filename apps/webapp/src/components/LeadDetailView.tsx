"use client";

import Link from "next/link";
import { useState } from "react";

import {
  leadAnnotationResponseSchema,
  leadInboxItemResponseSchema
} from "@scout/api-contracts";
import type {
  AuditFinding,
  LeadInboxItem,
  LeadStatus,
  OutreachDraft,
  SearchCandidate
} from "@scout/domain";
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
import {
  describeSampleQuality,
  toneForSampleQuality
} from "./sample-quality-copy";

type LeadAction = "analyze_contact" | "generate_draft" | "mark_contacted";

interface LeadMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

interface LeadTimelineEntry {
  label: string;
  value: string;
  detail: string;
}

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function buildTimeline(item: LeadInboxItem, draft?: OutreachDraft): LeadTimelineEntry[] {
  const entries: LeadTimelineEntry[] = [
    {
      label: "Run created",
      value: formatLeadUpdatedAt(item.runCreatedAt),
      detail: item.rawQuery
    },
    {
      label: "Lead tracked",
      value: formatLeadUpdatedAt(item.annotation.createdAt),
      detail: labelForLeadStatus(item.annotation.state)
    },
    {
      label: "Lead updated",
      value: formatLeadUpdatedAt(item.annotation.updatedAt),
      detail: item.outreach.nextAction
    }
  ];

  if (draft) {
    entries.push({
      label: "Outreach updated",
      value: formatLeadUpdatedAt(draft.updatedAt),
      detail: labelForLeadOutreachStatus(item.outreach.status)
    });
  }

  if (item.annotation.followUpDate) {
    entries.push({
      label: "Next follow-up",
      value: item.annotation.followUpDate,
      detail: isClosed(item.annotation.state) ? "Closed lead" : "Scheduled follow-up"
    });
  }

  return entries;
}

function resolveRecommendedChannel(draft?: OutreachDraft) {
  if (!draft) {
    return null;
  }

  if (draft.recommendedChannel) {
    return (
      draft.contactChannels.find((channel) => channel.kind === draft.recommendedChannel) ??
      draft.contactChannels[0] ??
      null
    );
  }

  return draft.contactChannels[0] ?? null;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage ?? "Scout could not update this lead.";
  } catch {
    return "Scout could not update this lead.";
  }
}

function buildMailtoHref(draft: OutreachDraft | undefined): string | null {
  const email = draft?.contactChannels.find((channel) => channel.kind === "email")?.value;

  if (!email || !draft?.subjectLine.trim() || !draft.body.trim()) {
    return null;
  }

  const params = new URLSearchParams({
    subject: draft.subjectLine,
    body: draft.body
  });

  return `mailto:${email}?${params.toString()}`;
}

export function LeadDetailView({
  initialItem,
  initialDraft,
  findings,
  candidate
}: {
  initialItem: LeadInboxItem;
  initialDraft?: OutreachDraft | undefined;
  findings: AuditFinding[];
  candidate?: SearchCandidate | undefined;
}) {
  const [item, setItem] = useState(initialItem);
  const [draft] = useState<OutreachDraft | undefined>(initialDraft);
  const [message, setMessage] = useState<LeadMessage | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const recommendedChannel = resolveRecommendedChannel(draft);
  const mailtoHref = buildMailtoHref(draft);
  const contactFormUrl = draft?.contactChannels.find((channel) => channel.kind === "contact_form")?.url;
  const phoneChannel = draft?.contactChannels.find((channel) => channel.kind === "phone");
  const timeline = buildTimeline(item, draft);
  const hasDraft = Boolean(draft?.subjectLine.trim() || draft?.body.trim() || draft?.shortMessage?.trim());

  function updateAnnotation(apply: (annotation: LeadInboxItem["annotation"]) => LeadInboxItem["annotation"]) {
    setItem((current) => ({
      ...current,
      annotation: apply(current.annotation)
    }));
    setMessage({ text: "Unsaved", tone: "neutral" });
  }

  async function saveLead() {
    if (pendingKey) {
      return;
    }

    setPendingKey("save");
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
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      setPendingKey(null);
      return;
    }

    const body = leadAnnotationResponseSchema.parse(await response.json());
    if (body.annotation) {
      setItem((current) => ({
        ...current,
        annotation: body.annotation!
      }));
    }

    setMessage({ text: "Saved", tone: "good" });
    setPendingKey(null);
  }

  async function runAction(action: LeadAction) {
    if (pendingKey) {
      return;
    }

    setPendingKey(action);
    setMessage({
      text:
        action === "analyze_contact"
          ? "Analyzing contact..."
          : action === "generate_draft"
            ? "Generating draft..."
            : "Marking contacted...",
      tone: "neutral"
    });

    const response = await fetch(
      `/api/leads/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}/actions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ action })
      }
    );

    if (!response.ok) {
      setMessage({ text: await readErrorMessage(response), tone: "danger" });
      setPendingKey(null);
      return;
    }

    const body = leadInboxItemResponseSchema.parse(await response.json());
    if (body.item) {
      setItem(body.item);
    }

    setMessage({
      text:
        action === "analyze_contact"
          ? "Contact analyzed"
          : action === "generate_draft"
            ? "Draft ready"
            : "Marked contacted",
      tone: "good"
    });
    setPendingKey(null);
  }

  async function copyText(label: string, value: string) {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setMessage({ text: `${label} copied`, tone: "good" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Clipboard copy failed.",
        tone: "danger"
      });
    }
  }

  return (
    <div className="scout-shell">
      <div className="lead-detail-hero report-card">
        <div className="lead-detail-title">
          <div>
            <div className="section-label">Lead</div>
            <h2>{item.businessName}</h2>
            {item.primaryUrl ? (
              <a className="inline-link" href={item.primaryUrl} target="_blank" rel="noreferrer">
                {item.primaryUrl}
              </a>
            ) : null}
          </div>
          <div className="tag-row">
            <Tag tone={toneForLeadStatus(item.annotation.state)}>
              {labelForLeadStatus(item.annotation.state)}
            </Tag>
            <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
              {labelForLeadOutreachStatus(item.outreach.status)}
            </Tag>
            {item.sampleQuality ? (
              <Tag tone={toneForSampleQuality(item.sampleQuality)}>
                {describeSampleQuality(item.sampleQuality)}
              </Tag>
            ) : null}
            {item.shortlistRank ? <Tag tone="warn">Shortlist #{item.shortlistRank}</Tag> : null}
          </div>
        </div>

        <div className="lead-detail-actions">
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("analyze_contact")}
            type="button"
          >
            {pendingKey === "analyze_contact" ? "Analyzing..." : "Analyze Contact"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("generate_draft")}
            type="button"
          >
            {pendingKey === "generate_draft" ? "Generating..." : "Generate Draft"}
          </button>
          <button
            className="secondary-button"
            disabled={Boolean(pendingKey)}
            onClick={() => void runAction("mark_contacted")}
            type="button"
          >
            {pendingKey === "mark_contacted" ? "Marking..." : "Mark Contacted"}
          </button>
          <Link className="link-button" href={`/runs/${encodeURIComponent(item.runId)}`}>
            Report
          </Link>
        </div>
      </div>

      <div className="scout-grid report-overview-grid">
        <section className="report-card lead-detail-section">
          <div className="section-label">Timeline</div>
          <ol className="lead-timeline">
            {timeline.map((entry) => (
              <li key={`${entry.label}-${entry.value}`}>
                <strong>{entry.label}</strong>
                <span>{entry.value}</span>
                <div className="muted">{entry.detail}</div>
              </li>
            ))}
          </ol>
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Lead State</div>
          <div className="lead-inbox-controls">
            <label className="field-stack">
              <span className="section-label">State</span>
              <select
                className="draft-input"
                onChange={(event) =>
                  updateAnnotation((annotation) => ({
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
                  updateAnnotation((annotation) => ({
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
                updateAnnotation((annotation) => ({
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
              onClick={() => void saveLead()}
              type="button"
            >
              {pendingKey === "save" ? "Saving..." : "Save"}
            </button>
          </div>
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Outreach Handoff</div>
          <div className="tag-row">
            {recommendedChannel ? <Tag tone="good">Best fit: {recommendedChannel.label}</Tag> : null}
            {draft?.recommendedChannel ? <Tag>{humanizeLeadValue(draft.recommendedChannel)}</Tag> : null}
            {hasDraft ? <Tag tone="good">Draft ready</Tag> : <Tag>No draft</Tag>}
          </div>
          {recommendedChannel ? (
            <p className="muted" style={{ margin: 0 }}>
              {recommendedChannel.reason}
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Analyze contact fit to let Scout inspect this business for the best first channel.
            </p>
          )}
          <div className="lead-detail-actions">
            {mailtoHref ? (
              <a className="secondary-button" href={mailtoHref}>
                Open Email
              </a>
            ) : null}
            {contactFormUrl ? (
              <a className="secondary-button" href={contactFormUrl} target="_blank" rel="noreferrer">
                Open Contact Form
              </a>
            ) : null}
            {phoneChannel?.value ? <Tag tone="warn">{phoneChannel.value}</Tag> : null}
            {draft?.body ? (
              <button
                className="secondary-button"
                onClick={() =>
                  void copyText("Email", `Subject: ${draft.subjectLine}\n\n${draft.body}`)
                }
                type="button"
              >
                Copy Email
              </button>
            ) : null}
            {draft?.shortMessage ? (
              <button
                className="secondary-button"
                onClick={() => void copyText("Short message", draft.shortMessage ?? "")}
                type="button"
              >
                Copy Short Message
              </button>
            ) : null}
          </div>
          {draft?.subjectLine ? (
            <div className="section-stack">
              <div className="section-label">Subject</div>
              <div>{draft.subjectLine}</div>
            </div>
          ) : null}
          {draft?.body ? (
            <div className="section-stack">
              <div className="section-label">Email Draft</div>
              <pre className="lead-detail-pre">{draft.body}</pre>
            </div>
          ) : null}
          {draft?.phoneTalkingPoints ? (
            <div className="section-stack">
              <div className="section-label">Phone Notes</div>
              <ul className="note-list">
                <li>{draft.phoneTalkingPoints.opener}</li>
                {draft.phoneTalkingPoints.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
                <li>{draft.phoneTalkingPoints.close}</li>
              </ul>
            </div>
          ) : null}
        </section>

        <section className="report-card lead-detail-section">
          <div className="section-label">Evidence Context</div>
          <div className="tag-row">
            {item.presenceType ? <Tag>{humanizeLeadValue(item.presenceType)}</Tag> : null}
            {item.presenceQuality ? <Tag>{humanizeLeadValue(item.presenceQuality)}</Tag> : null}
            {item.confidence ? <Tag>{humanizeLeadValue(item.confidence)}</Tag> : null}
            <Tag>{item.findingCount} findings</Tag>
            {item.highSeverityFindings > 0 ? (
              <Tag tone="danger">{item.highSeverityFindings} high severity</Tag>
            ) : null}
          </div>
          {candidate?.provenanceNote ? (
            <p className="muted" style={{ margin: 0 }}>
              {candidate.provenanceNote}
            </p>
          ) : null}
          {item.reasons.length > 0 ? (
            <ul className="note-list">
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          {findings.length > 0 ? (
            <table className="finding-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Severity</th>
                  <th>Viewport</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id}>
                    <td>
                      <div>{finding.message}</div>
                      <div className="muted">{finding.reproductionNote}</div>
                    </td>
                    <td>{humanizeLeadValue(finding.severity)}</td>
                    <td>{humanizeLeadValue(finding.viewport)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No deterministic findings are attached to this candidate.
            </p>
          )}
          {findings.some((finding) => finding.screenshotUrl) ? (
            <div className="evidence-grid">
              {findings
                .filter((finding) => finding.screenshotUrl)
                .slice(0, 4)
                .map((finding) => (
                  <div className="evidence-card" key={`evidence-${finding.id}`}>
                    <img alt={finding.message} src={finding.screenshotUrl} />
                    <div className="muted">
                      {humanizeLeadValue(finding.pageLabel)} / {humanizeLeadValue(finding.viewport)}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
