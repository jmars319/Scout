"use client";

import { useState } from "react";

import { outreachProfileResponseSchema } from "@scout/api-contracts";
import type { OutreachProfile } from "@scout/domain";
import { Panel, Tag } from "@scout/ui";

function buildAvoidPhrasesText(profile: OutreachProfile): string {
  return profile.avoidPhrases.join("\n");
}

function splitAvoidPhrases(value: string): string[] {
  return value
    .split("\n")
    .map((phrase) => phrase.trim())
    .filter(Boolean);
}

export function OutreachProfileForm({
  initialProfile
}: {
  initialProfile: OutreachProfile;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [avoidPhrasesText, setAvoidPhrasesText] = useState(() =>
    buildAvoidPhrasesText(initialProfile)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  function updateField<K extends keyof Omit<OutreachProfile, "profileId" | "avoidPhrases" | "updatedAt">>(
    key: K,
    value: OutreachProfile[K]
  ) {
    setProfile((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/outreach-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          senderName: profile.senderName,
          companyName: profile.companyName,
          roleTitle: profile.roleTitle,
          serviceLine: profile.serviceLine,
          serviceSummary: profile.serviceSummary,
          defaultCallToAction: profile.defaultCallToAction,
          contactEmail: profile.contactEmail,
          contactPhone: profile.contactPhone,
          websiteUrl: profile.websiteUrl,
          schedulerUrl: profile.schedulerUrl,
          toneNotes: profile.toneNotes,
          avoidPhrases: splitAvoidPhrases(avoidPhrasesText),
          signature: profile.signature
        })
      });
      const payload = outreachProfileResponseSchema.parse(await response.json());

      if (!response.ok || !payload.profile) {
        throw new Error(payload.errorMessage || "Scout could not save the outreach profile.");
      }

      setProfile(payload.profile);
      setAvoidPhrasesText(buildAvoidPhrasesText(payload.profile));
      setMessage({
        tone: "good",
        text: "Outreach profile saved locally."
      });
    } catch (error) {
      setMessage({
        tone: "danger",
        text: error instanceof Error ? error.message : "Unknown outreach profile failure."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="scout-shell">
      <Panel
        title="What This Profile Powers"
        description="Scout uses these fields to ground outreach drafts, short-form messages, and phone talking points in your actual identity, offer, and preferred next step."
      >
        <div className="tag-row">
          <Tag tone="good">Sender identity</Tag>
          <Tag tone="good">Service framing</Tag>
          <Tag tone="good">Contact details</Tag>
          <Tag tone="good">CTA + voice</Tag>
        </div>
      </Panel>

      <Panel
        title="Outreach Profile"
        description="Everything here stays local to Scout. The AI draft path uses it when available, and manual drafting can still benefit from having it filled out."
      >
        <div className="scout-grid two-up">
          <div className="field-stack">
            <label className="section-label" htmlFor="sender-name">
              Sender Name
            </label>
            <input
              className="draft-input"
              id="sender-name"
              onChange={(event) => updateField("senderName", event.target.value)}
              placeholder="Your name"
              value={profile.senderName}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="company-name">
              Company Name
            </label>
            <input
              className="draft-input"
              id="company-name"
              onChange={(event) => updateField("companyName", event.target.value)}
              placeholder="tenra"
              value={profile.companyName}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="role-title">
              Role / Title
            </label>
            <input
              className="draft-input"
              id="role-title"
              onChange={(event) => updateField("roleTitle", event.target.value)}
              placeholder="Founder, designer, developer, consultant..."
              value={profile.roleTitle}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="service-line">
              Service Line
            </label>
            <input
              className="draft-input"
              id="service-line"
              onChange={(event) => updateField("serviceLine", event.target.value)}
              placeholder="Website rebuilds, repairs, accessibility, conversion work..."
              value={profile.serviceLine}
            />
          </div>
        </div>

        <div className="field-stack" style={{ marginTop: "1rem" }}>
          <label className="section-label" htmlFor="service-summary">
            Service Summary
          </label>
          <textarea
            className="draft-textarea"
            id="service-summary"
            onChange={(event) => updateField("serviceSummary", event.target.value)}
            placeholder="Short service summary for outreach drafts."
            style={{ minHeight: "8rem" }}
            value={profile.serviceSummary}
          />
        </div>

        <div className="field-stack" style={{ marginTop: "1rem" }}>
          <label className="section-label" htmlFor="default-call-to-action">
            Default Call To Action
          </label>
          <textarea
            className="draft-textarea"
            id="default-call-to-action"
            onChange={(event) => updateField("defaultCallToAction", event.target.value)}
            placeholder="What do you usually want the recipient to do next?"
            style={{ minHeight: "6rem" }}
            value={profile.defaultCallToAction}
          />
        </div>

        <div className="scout-grid two-up" style={{ marginTop: "1rem" }}>
          <div className="field-stack">
            <label className="section-label" htmlFor="contact-email">
              Contact Email
            </label>
            <input
              className="draft-input"
              id="contact-email"
              onChange={(event) => updateField("contactEmail", event.target.value)}
              placeholder="you@example.com"
              value={profile.contactEmail}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="contact-phone">
              Contact Phone
            </label>
            <input
              className="draft-input"
              id="contact-phone"
              onChange={(event) => updateField("contactPhone", event.target.value)}
              placeholder="(555) 555-5555"
              value={profile.contactPhone}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="website-url">
              Website URL
            </label>
            <input
              className="draft-input"
              id="website-url"
              onChange={(event) => updateField("websiteUrl", event.target.value)}
              placeholder="https://your-site.com"
              value={profile.websiteUrl}
            />
          </div>

          <div className="field-stack">
            <label className="section-label" htmlFor="scheduler-url">
              Scheduler URL
            </label>
            <input
              className="draft-input"
              id="scheduler-url"
              onChange={(event) => updateField("schedulerUrl", event.target.value)}
              placeholder="https://cal.com/... or similar"
              value={profile.schedulerUrl}
            />
          </div>
        </div>

        <div className="field-stack" style={{ marginTop: "1rem" }}>
          <label className="section-label" htmlFor="tone-notes">
            Tone Guidance
          </label>
          <textarea
            className="draft-textarea"
            id="tone-notes"
            onChange={(event) => updateField("toneNotes", event.target.value)}
            placeholder="Extra style guardrails for how outreach should sound."
            style={{ minHeight: "6rem" }}
            value={profile.toneNotes}
          />
        </div>

        <div className="field-stack" style={{ marginTop: "1rem" }}>
          <label className="section-label" htmlFor="avoid-phrases">
            Avoid Phrases
          </label>
          <textarea
            className="draft-textarea"
            id="avoid-phrases"
            onChange={(event) => setAvoidPhrasesText(event.target.value)}
            placeholder="One phrase per line that Scout should avoid in drafts."
            style={{ minHeight: "7rem" }}
            value={avoidPhrasesText}
          />
        </div>

        <div className="field-stack" style={{ marginTop: "1rem" }}>
          <label className="section-label" htmlFor="signature">
            Signature
          </label>
          <textarea
            className="draft-textarea"
            id="signature"
            onChange={(event) => updateField("signature", event.target.value)}
            placeholder="Optional default signoff block."
            style={{ minHeight: "7rem" }}
            value={profile.signature}
          />
        </div>

        <div className="outreach-toolbar" style={{ marginTop: "1rem" }}>
          <button className="link-button" disabled={isSaving} onClick={() => void handleSave()} type="button">
            {isSaving ? "Saving..." : "Save Local Profile"}
          </button>
          {profile.updatedAt ? (
            <div className="muted" style={{ alignSelf: "center" }}>
              Last saved {new Date(profile.updatedAt).toLocaleString()}
            </div>
          ) : null}
        </div>

        {message ? <div className={`status-note ${message.tone}`} style={{ marginTop: "1rem" }}>{message.text}</div> : null}
      </Panel>
    </div>
  );
}
