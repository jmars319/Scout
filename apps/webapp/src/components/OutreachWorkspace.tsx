"use client";

import Link from "next/link";
import { useState } from "react";

import { outreachDraftResponseSchema } from "@scout/api-contracts";
import type {
  LeadOpportunity,
  OutreachDraft,
  OutreachLength,
  OutreachTone
} from "@scout/domain";
import { Tag } from "@scout/ui";

interface OutreachWorkspaceProps {
  runId: string;
  leads: LeadOpportunity[];
  initialDrafts: OutreachDraft[];
  aiAvailable: boolean;
  defaultTone: OutreachTone;
  defaultLength: OutreachLength;
  model?: string | undefined;
}

interface DraftEditorState {
  tone: OutreachTone;
  length: OutreachLength;
  subjectLine: string;
  body: string;
  grounding: string[];
  updatedAt?: string;
}

interface DraftMessage {
  text: string;
  tone: "neutral" | "good" | "danger";
}

function buildInitialEditors(
  leads: LeadOpportunity[],
  drafts: OutreachDraft[],
  defaultTone: OutreachTone,
  defaultLength: OutreachLength
): Record<string, DraftEditorState> {
  const draftMap = new Map(drafts.map((draft) => [draft.candidateId, draft]));

  return Object.fromEntries(
    leads.map((lead) => {
      const existingDraft = draftMap.get(lead.candidateId);

      return [
        lead.candidateId,
        existingDraft
          ? {
              tone: existingDraft.tone,
              length: existingDraft.length,
              subjectLine: existingDraft.subjectLine,
              body: existingDraft.body,
              grounding: existingDraft.grounding,
              updatedAt: existingDraft.updatedAt
            }
          : {
              tone: defaultTone,
              length: defaultLength,
              subjectLine: "",
              body: "",
              grounding: lead.reasons.slice(0, 4)
            }
      ];
    })
  );
}

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function OutreachWorkspace({
  runId,
  leads,
  initialDrafts,
  aiAvailable,
  defaultTone,
  defaultLength,
  model
}: OutreachWorkspaceProps) {
  const [editors, setEditors] = useState<Record<string, DraftEditorState>>(() =>
    buildInitialEditors(leads, initialDrafts, defaultTone, defaultLength)
  );
  const [busyByCandidate, setBusyByCandidate] = useState<Record<string, "generate" | "save">>({});
  const [messageByCandidate, setMessageByCandidate] = useState<Record<string, DraftMessage>>({});

  function updateEditor(
    candidateId: string,
    apply: (current: DraftEditorState) => DraftEditorState
  ) {
    setEditors((current) => {
      const existing = current[candidateId];
      if (!existing) {
        return current;
      }

      return {
        ...current,
        [candidateId]: apply(existing)
      };
    });
  }

  async function handleGenerate(candidateId: string) {
    const editor = editors[candidateId];
    if (!editor) {
      return;
    }

    setBusyByCandidate((current) => ({ ...current, [candidateId]: "generate" }));
    setMessageByCandidate((current) => ({ ...current, [candidateId]: { text: "", tone: "neutral" } }));

    try {
      const response = await fetch(`/api/runs/${runId}/outreach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          candidateId,
          tone: editor.tone,
          length: editor.length
        })
      });
      const payload = outreachDraftResponseSchema.parse(await response.json());

      const draft = payload.draft;
      if (!response.ok || !draft) {
        throw new Error(payload.errorMessage || "Scout could not generate an outreach draft.");
      }

      setEditors((current) => ({
        ...current,
        [candidateId]: {
          tone: draft.tone,
          length: draft.length,
          subjectLine: draft.subjectLine,
          body: draft.body,
          grounding: draft.grounding,
          updatedAt: draft.updatedAt
        }
      }));
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: model ? `Draft refreshed with ${model}.` : "Draft refreshed.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Unknown outreach generation failure.",
          tone: "danger"
        }
      }));
    } finally {
      setBusyByCandidate((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
  }

  async function handleSave(candidateId: string) {
    const editor = editors[candidateId];
    if (!editor) {
      return;
    }

    setBusyByCandidate((current) => ({ ...current, [candidateId]: "save" }));
    setMessageByCandidate((current) => ({ ...current, [candidateId]: { text: "", tone: "neutral" } }));

    try {
      const response = await fetch(`/api/runs/${runId}/outreach/${candidateId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tone: editor.tone,
          length: editor.length,
          subjectLine: editor.subjectLine,
          body: editor.body
        })
      });
      const payload = outreachDraftResponseSchema.parse(await response.json());

      const draft = payload.draft;
      if (!response.ok || !draft) {
        throw new Error(payload.errorMessage || "Scout could not save the outreach draft.");
      }

      setEditors((current) => ({
        ...current,
        [candidateId]: {
          tone: draft.tone,
          length: draft.length,
          subjectLine: draft.subjectLine,
          body: draft.body,
          grounding: draft.grounding,
          updatedAt: draft.updatedAt
        }
      }));
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Draft saved locally.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Unknown outreach save failure.",
          tone: "danger"
        }
      }));
    } finally {
      setBusyByCandidate((current) => {
        const next = { ...current };
        delete next[candidateId];
        return next;
      });
    }
  }

  async function handleCopy(candidateId: string) {
    const editor = editors[candidateId];
    if (!editor?.subjectLine.trim() || !editor.body.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(`Subject: ${editor.subjectLine}\n\n${editor.body}`);
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: "Draft copied to clipboard.",
          tone: "good"
        }
      }));
    } catch (error) {
      setMessageByCandidate((current) => ({
        ...current,
        [candidateId]: {
          text: error instanceof Error ? error.message : "Clipboard copy failed.",
          tone: "danger"
        }
      }));
    }
  }

  if (leads.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Scout did not identify any shortlist candidates to draft outreach for.
      </p>
    );
  }

  return (
    <div className="outreach-stack">
      <div className="outreach-banner">
        <div>
          <strong>Desktop-first local drafting.</strong>{" "}
          Generated drafts are saved with this run on your machine and can be edited before you copy
          them out.
        </div>
        <div className="tag-row">
          <Tag tone={aiAvailable ? "good" : "warn"}>
            {aiAvailable ? "AI Ready" : "AI Disabled"}
          </Tag>
          <Tag>{model ?? "Manual editing only"}</Tag>
        </div>
      </div>

      {!aiAvailable ? (
        <p className="muted" style={{ margin: 0 }}>
          Set <code>OPENAI_API_KEY</code> to generate grounded drafts automatically. Manual edits can
          still be saved locally.
        </p>
      ) : null}

      <ul className="shortlist">
        {leads.map((lead) => {
          const editor = editors[lead.candidateId] ?? {
            tone: defaultTone,
            length: defaultLength,
            subjectLine: "",
            body: "",
            grounding: lead.reasons.slice(0, 4)
          };
          const busyState = busyByCandidate[lead.candidateId];
          const message = messageByCandidate[lead.candidateId];
          const canSave = editor.subjectLine.trim().length > 0 && editor.body.trim().length >= 20;

          return (
            <li key={lead.candidateId} className="report-card">
              <header>
                <div>
                  <div style={{ fontSize: "1.08rem", fontWeight: 700 }}>{lead.businessName}</div>
                  <Link className="inline-link" href={lead.primaryUrl} target="_blank">
                    {lead.primaryUrl}
                  </Link>
                </div>
                <div className="tag-row">
                  <Tag tone="warn">{aiAvailable ? "Outreach Ready" : "Manual Draft"}</Tag>
                  <Tag>{humanize(lead.presenceQuality)}</Tag>
                </div>
              </header>

              <div className="tag-row">
                {(["calm", "direct", "friendly"] as OutreachTone[]).map((tone) => (
                  <button
                    key={tone}
                    className={`pill-button ${editor.tone === tone ? "active" : ""}`}
                    onClick={() => updateEditor(lead.candidateId, (current) => ({ ...current, tone }))}
                    type="button"
                  >
                    {humanize(tone)}
                  </button>
                ))}
              </div>

              <div className="tag-row">
                {(["brief", "standard"] as OutreachLength[]).map((length) => (
                  <button
                    key={length}
                    className={`pill-button ${editor.length === length ? "active" : ""}`}
                    onClick={() => updateEditor(lead.candidateId, (current) => ({ ...current, length }))}
                    type="button"
                  >
                    {humanize(length)}
                  </button>
                ))}
              </div>

              <div className="outreach-toolbar">
                <button
                  className="secondary-button"
                  disabled={!aiAvailable || busyState === "generate"}
                  onClick={() => void handleGenerate(lead.candidateId)}
                  type="button"
                >
                  {busyState === "generate" ? "Generating..." : editor.body ? "Regenerate" : "Generate Draft"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!canSave || busyState === "save"}
                  onClick={() => void handleSave(lead.candidateId)}
                  type="button"
                >
                  {busyState === "save" ? "Saving..." : "Save Local Draft"}
                </button>
                <button
                  className="secondary-button"
                  disabled={!canSave}
                  onClick={() => void handleCopy(lead.candidateId)}
                  type="button"
                >
                  Copy Draft
                </button>
              </div>

              <div className="field-stack">
                <label className="section-label" htmlFor={`subject-${lead.candidateId}`}>
                  Subject
                </label>
                <input
                  className="draft-input"
                  id={`subject-${lead.candidateId}`}
                  onChange={(event) =>
                    updateEditor(lead.candidateId, (current) => ({
                      ...current,
                      subjectLine: event.target.value
                    }))
                  }
                  placeholder="Subject line"
                  value={editor.subjectLine}
                />
              </div>

              <div className="field-stack">
                <label className="section-label" htmlFor={`body-${lead.candidateId}`}>
                  Draft
                </label>
                <textarea
                  className="draft-textarea"
                  id={`body-${lead.candidateId}`}
                  onChange={(event) =>
                    updateEditor(lead.candidateId, (current) => ({
                      ...current,
                      body: event.target.value
                    }))
                  }
                  placeholder="Outreach draft body"
                  value={editor.body}
                />
              </div>

              <div className="section-stack">
                <div className="section-label">Grounded From</div>
                <ul className="note-list">
                  {editor.grounding.length > 0 ? (
                    editor.grounding.map((reason) => <li key={reason}>{reason}</li>)
                  ) : (
                    <li>Scout will attach grounded reasons after the first save or generation.</li>
                  )}
                </ul>
              </div>

              {editor.updatedAt ? (
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  Last saved {new Date(editor.updatedAt).toLocaleString()}
                </div>
              ) : null}

              {message?.text ? (
                <div className={`status-note ${message.tone}`}>{message.text}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
