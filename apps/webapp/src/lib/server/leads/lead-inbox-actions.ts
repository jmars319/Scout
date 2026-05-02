import type { LeadInboxItem, OutreachLength, OutreachTone } from "@scout/domain";

import {
  analyzeOutreachCandidate,
  generateOutreachDraft
} from "../outreach/outreach-service.ts";
import { createLeadAnnotationRepository } from "../storage/lead-annotation-repository.ts";
import { getLeadInboxItem } from "./lead-inbox-service.ts";
import { saveLeadAnnotation } from "./lead-workflow-service.ts";

export type LeadInboxAction =
  | { action: "analyze_contact" }
  | {
      action: "generate_draft";
      tone?: OutreachTone | undefined;
      length?: OutreachLength | undefined;
    }
  | { action: "mark_contacted"; followUpDate?: string | null | undefined };

function addDaysIsoDate(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function requireLeadInboxItem(runId: string, candidateId: string): Promise<LeadInboxItem> {
  const item = await getLeadInboxItem(runId, candidateId);

  if (!item) {
    throw new Error("Lead inbox item not found.");
  }

  return item;
}

async function markLeadContacted(
  runId: string,
  candidateId: string,
  followUpDate: string | null | undefined
): Promise<void> {
  const existing = await createLeadAnnotationRepository().get(runId, candidateId);

  if (!existing) {
    throw new Error("Lead annotation not found.");
  }

  await saveLeadAnnotation({
    runId,
    candidateId,
    state: "contacted",
    operatorNote: existing.operatorNote,
    followUpDate:
      followUpDate === undefined ? existing.followUpDate ?? addDaysIsoDate(new Date(), 7) : followUpDate
  });
}

export async function runLeadInboxAction(input: {
  runId: string;
  candidateId: string;
  action: LeadInboxAction;
}): Promise<LeadInboxItem> {
  if (input.action.action === "analyze_contact") {
    await analyzeOutreachCandidate({
      runId: input.runId,
      candidateId: input.candidateId
    });
  }

  if (input.action.action === "generate_draft") {
    await generateOutreachDraft({
      runId: input.runId,
      candidateId: input.candidateId,
      ...(input.action.tone ? { tone: input.action.tone } : {}),
      ...(input.action.length ? { length: input.action.length } : {})
    });
  }

  if (input.action.action === "mark_contacted") {
    await markLeadContacted(input.runId, input.candidateId, input.action.followUpDate);
  }

  return requireLeadInboxItem(input.runId, input.candidateId);
}
