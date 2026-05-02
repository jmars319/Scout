import type { LeadAnnotation, LeadStatus, ScoutRunReport } from "@scout/domain";

import { getScoutRun } from "../scout-runner.ts";
import {
  createLeadAnnotationRepository,
  type SaveLeadAnnotationInput
} from "../storage/lead-annotation-repository.ts";

export interface SaveLeadWorkflowInput {
  runId: string;
  candidateId: string;
  state: LeadStatus;
  operatorNote?: string | undefined;
  followUpDate?: string | null | undefined;
}

function getValidCandidateIds(report: ScoutRunReport): Set<string> {
  return new Set([
    ...report.candidates.map((candidate) => candidate.candidateId),
    ...report.businessBreakdowns.map((business) => business.candidateId),
    ...report.shortlist.map((lead) => lead.candidateId)
  ]);
}

function normalizeFollowUpDate(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value;
}

function normalizeSaveInput(input: SaveLeadWorkflowInput): SaveLeadAnnotationInput {
  return {
    runId: input.runId,
    candidateId: input.candidateId,
    state: input.state,
    operatorNote: input.operatorNote?.trim() ?? "",
    followUpDate: normalizeFollowUpDate(input.followUpDate)
  };
}

export async function getLeadAnnotations(runId: string): Promise<LeadAnnotation[]> {
  const repository = createLeadAnnotationRepository();
  return repository.listByRun(runId);
}

export async function saveLeadAnnotation(input: SaveLeadWorkflowInput): Promise<LeadAnnotation> {
  const report = await getScoutRun(input.runId);

  if (!report) {
    throw new Error("Scout run not found.");
  }

  if (report.status !== "completed") {
    throw new Error("Lead workflow is only available for completed Scout runs.");
  }

  if (!getValidCandidateIds(report).has(input.candidateId)) {
    throw new Error("Lead candidate is not part of this Scout run.");
  }

  const repository = createLeadAnnotationRepository();
  return repository.save(normalizeSaveInput(input));
}
