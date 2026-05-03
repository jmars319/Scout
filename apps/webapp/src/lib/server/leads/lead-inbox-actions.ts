import type { LeadInboxItem, LeadStatus, OutreachLength, OutreachTone } from "@scout/domain";

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

export type LeadInboxBulkAction =
  | { action: "mark_contacted"; followUpDate?: string | null | undefined }
  | { action: "dismiss" }
  | { action: "mark_not_a_fit" }
  | { action: "set_follow_up"; followUpDate: string | null };

export interface LeadInboxActionTarget {
  runId: string;
  candidateId: string;
}

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

async function getExistingAnnotation(runId: string, candidateId: string) {
  const existing = await createLeadAnnotationRepository().get(runId, candidateId);

  if (!existing) {
    throw new Error("Lead annotation not found.");
  }

  return existing;
}

async function updateLeadAnnotation(input: {
  runId: string;
  candidateId: string;
  state?: LeadStatus | undefined;
  followUpDate?: string | null | undefined;
}): Promise<void> {
  const existing = await getExistingAnnotation(input.runId, input.candidateId);

  await saveLeadAnnotation({
    runId: input.runId,
    candidateId: input.candidateId,
    state: input.state ?? existing.state,
    operatorNote: existing.operatorNote,
    followUpDate: input.followUpDate === undefined ? existing.followUpDate : input.followUpDate
  });
}

async function markLeadContacted(
  runId: string,
  candidateId: string,
  followUpDate: string | null | undefined
): Promise<void> {
  const existing = await getExistingAnnotation(runId, candidateId);

  await saveLeadAnnotation({
    runId,
    candidateId,
    state: "contacted",
    operatorNote: existing.operatorNote,
    followUpDate:
      followUpDate === undefined ? existing.followUpDate ?? addDaysIsoDate(new Date(), 7) : followUpDate
  });
}

function uniqueTargets(targets: LeadInboxActionTarget[]): LeadInboxActionTarget[] {
  const seen = new Set<string>();
  const unique: LeadInboxActionTarget[] = [];

  for (const target of targets) {
    const key = `${target.runId}:${target.candidateId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(target);
  }

  return unique;
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

export async function runLeadInboxBulkAction(input: {
  items: LeadInboxActionTarget[];
  action: LeadInboxBulkAction;
}): Promise<LeadInboxItem[]> {
  const targets = uniqueTargets(input.items);

  for (const target of targets) {
    if (input.action.action === "mark_contacted") {
      await markLeadContacted(target.runId, target.candidateId, input.action.followUpDate);
      continue;
    }

    if (input.action.action === "dismiss") {
      await updateLeadAnnotation({
        runId: target.runId,
        candidateId: target.candidateId,
        state: "dismissed",
        followUpDate: null
      });
      continue;
    }

    if (input.action.action === "mark_not_a_fit") {
      await updateLeadAnnotation({
        runId: target.runId,
        candidateId: target.candidateId,
        state: "not_a_fit",
        followUpDate: null
      });
      continue;
    }

    await updateLeadAnnotation({
      runId: target.runId,
      candidateId: target.candidateId,
      followUpDate: input.action.followUpDate
    });
  }

  return Promise.all(
    targets.map((target) => requireLeadInboxItem(target.runId, target.candidateId))
  );
}
