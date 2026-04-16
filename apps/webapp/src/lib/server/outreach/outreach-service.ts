import { getOutreachConfig } from "@scout/config";
import type { OutreachDraft, OutreachLength, OutreachTone, ScoutRunReport } from "@scout/domain";
import { z } from "zod";

import { createRunRepository } from "../storage/run-repository.ts";
import {
  createOutreachDraftRepository,
  type SaveOutreachDraftInput
} from "../storage/outreach-draft-repository.ts";
import { buildOutreachTargetContext } from "./grounding.ts";

const generatedDraftSchema = z.object({
  subjectLine: z.string().trim().min(1).max(180),
  body: z.string().trim().min(30).max(5000)
});

export interface OutreachWorkspaceState {
  runId: string;
  aiAvailable: boolean;
  defaultTone: OutreachTone;
  defaultLength: OutreachLength;
  model?: string | undefined;
  drafts: OutreachDraft[];
}

interface GenerateOutreachDraftInput {
  runId: string;
  candidateId: string;
  tone?: OutreachTone;
  length?: OutreachLength;
}

interface SaveOutreachDraftEditInput {
  runId: string;
  candidateId: string;
  tone: OutreachTone;
  length: OutreachLength;
  subjectLine: string;
  body: string;
}

function resolveLengthGuidance(length: OutreachLength): string {
  return length === "brief"
    ? "Keep the body around 90 to 140 words."
    : "Keep the body around 150 to 220 words.";
}

function resolveToneGuidance(tone: OutreachTone): string {
  if (tone === "direct") {
    return "Be straightforward and concise, but not pushy.";
  }

  if (tone === "friendly") {
    return "Be warm and approachable without sounding casual or fluffy.";
  }

  return "Be calm, low-pressure, and matter-of-fact.";
}

function buildPromptPayload(
  report: ScoutRunReport,
  target: ReturnType<typeof buildOutreachTargetContext>,
  tone: OutreachTone,
  length: OutreachLength
) {
  return {
    sender: "JAMARQ",
    businessName: target.businessName,
    primaryUrl: target.primaryUrl,
    presenceType: target.business.presenceType,
    presenceQuality: target.business.presenceQuality,
    confidence: target.lead?.confidence ?? target.business.confidence,
    opportunityTypes: target.lead?.opportunityTypes ?? target.business.opportunityTypes,
    shortlistReasons: target.lead?.reasons ?? [],
    topIssues: target.business.topIssues,
    findings: target.findings.map((finding) => ({
      issueType: finding.issueType,
      severity: finding.severity,
      confidence: finding.confidence,
      pageLabel: finding.pageLabel,
      viewport: finding.viewport,
      message: finding.message
    })),
    grounding: target.grounding,
    cautionNotes: target.cautionNotes,
    sampleQuality: report.summary.sampleQuality,
    tone,
    length
  };
}

function buildSystemPrompt(tone: OutreachTone, length: OutreachLength): string {
  return [
    "You write restrained outreach drafts for JAMARQ.",
    "Use only the evidence provided in the JSON input.",
    "Do not invent page details, metrics, business context, pricing, or results not present in the input.",
    "Do not mention Scout, AI, automation, scraping, search providers, screenshots, or audits directly.",
    "If the evidence is weak or not confirmed, use softer language like 'may', 'might', or 'could'.",
    "Mention at most two specific website or conversion issues.",
    "Write plain-text email copy only, with no markdown and no placeholders.",
    "Return JSON with keys subjectLine and body.",
    resolveToneGuidance(tone),
    resolveLengthGuidance(length)
  ].join(" ");
}

function extractResponseText(payload: unknown): string {
  const responsePayload = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof responsePayload.output_text === "string") {
    return responsePayload.output_text;
  }

  if (!Array.isArray(responsePayload.output)) {
    throw new Error("OpenAI response did not include output text.");
  }

  const textParts: string[] = [];

  for (const item of responsePayload.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const content of item.content) {
      if (typeof content?.text === "string") {
        textParts.push(content.text);
      }
    }
  }

  if (textParts.length === 0) {
    throw new Error("OpenAI response content was empty.");
  }

  return textParts.join("\n").trim();
}

function extractOpenAiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : null;
}

async function requestGeneratedDraft(
  report: ScoutRunReport,
  candidateId: string,
  tone: OutreachTone,
  length: OutreachLength
) {
  const config = getOutreachConfig();

  if (!config.enabled || !config.apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate Scout outreach drafts.");
  }

  const target = buildOutreachTargetContext(report, candidateId);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt(tone, length) }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Return only JSON.\n${JSON.stringify(
                buildPromptPayload(report, target, tone, length),
                null,
                2
              )}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_object"
        }
      }
    }),
    signal: AbortSignal.timeout(45_000)
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    const message = extractOpenAiErrorMessage(payload) ?? "OpenAI draft generation failed.";
    throw new Error(message);
  }

  const parsed = generatedDraftSchema.parse(JSON.parse(extractResponseText(payload)));

  return {
    generated: parsed,
    target,
    model: config.model
  };
}

async function requireCompletedRunReport(runId: string): Promise<ScoutRunReport> {
  const report = await createRunRepository().get(runId);

  if (!report) {
    throw new Error("Scout run report not found.");
  }

  if (report.status !== "completed") {
    throw new Error("Scout outreach drafts are only available for completed runs.");
  }

  return report;
}

function buildSaveInputFromTarget(
  target: ReturnType<typeof buildOutreachTargetContext>,
  input: {
    runId: string;
    candidateId: string;
    tone: OutreachTone;
    length: OutreachLength;
    subjectLine: string;
    body: string;
    model?: string | undefined;
  }
): SaveOutreachDraftInput {
  return {
    runId: input.runId,
    candidateId: input.candidateId,
    businessName: target.businessName,
    primaryUrl: target.primaryUrl,
    tone: input.tone,
    length: input.length,
    subjectLine: input.subjectLine,
    body: input.body,
    grounding: target.grounding,
    ...(input.model ? { model: input.model } : {})
  };
}

export async function getOutreachWorkspaceState(runId: string): Promise<OutreachWorkspaceState> {
  const config = getOutreachConfig();
  const drafts = await createOutreachDraftRepository().listByRun(runId);

  return {
    runId,
    aiAvailable: config.enabled,
    defaultTone: config.defaultTone,
    defaultLength: config.defaultLength,
    ...(config.enabled ? { model: config.model } : {}),
    drafts
  };
}

export async function generateOutreachDraft(
  input: GenerateOutreachDraftInput
): Promise<OutreachWorkspaceState & { draft: OutreachDraft }> {
  const config = getOutreachConfig();
  const tone = input.tone ?? config.defaultTone;
  const length = input.length ?? config.defaultLength;
  const report = await requireCompletedRunReport(input.runId);
  const { generated, target, model } = await requestGeneratedDraft(
    report,
    input.candidateId,
    tone,
    length
  );
  const draft = await createOutreachDraftRepository().save(
    buildSaveInputFromTarget(target, {
      runId: input.runId,
      candidateId: input.candidateId,
      tone,
      length,
      subjectLine: generated.subjectLine,
      body: generated.body,
      model
    })
  );

  return {
    ...(await getOutreachWorkspaceState(input.runId)),
    draft
  };
}

export async function saveOutreachDraftEdit(
  input: SaveOutreachDraftEditInput
): Promise<OutreachWorkspaceState & { draft: OutreachDraft }> {
  const report = await requireCompletedRunReport(input.runId);
  const target = buildOutreachTargetContext(report, input.candidateId);
  const existingDraft = await createOutreachDraftRepository().get(input.runId, input.candidateId);
  const draft = await createOutreachDraftRepository().save(
    buildSaveInputFromTarget(target, {
      ...input,
      ...(existingDraft?.model ? { model: existingDraft.model } : {})
    })
  );

  return {
    ...(await getOutreachWorkspaceState(input.runId)),
    draft
  };
}
