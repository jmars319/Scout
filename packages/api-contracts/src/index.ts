import {
  outreachDraftSchema,
  scoutQueryInputSchema,
  scoutRunReportSchema
} from "@scout/validation";
import { z } from "zod";

const outreachTones = ["calm", "direct", "friendly"] as const;
const outreachLengths = ["brief", "standard"] as const;

export const createScoutRunRequestSchema = scoutQueryInputSchema;

export const createScoutRunResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  report: scoutRunReportSchema.optional(),
  errorMessage: z.string().optional()
});

export const getScoutRunResponseSchema = z.object({
  runId: z.string(),
  status: z.enum(["queued", "running", "completed", "failed", "not_found"]),
  report: scoutRunReportSchema.optional(),
  errorMessage: z.string().optional()
});

export const createOutreachDraftRequestSchema = z.object({
  candidateId: z.string(),
  tone: z.enum(outreachTones).optional(),
  length: z.enum(outreachLengths).optional()
});

export const updateOutreachDraftRequestSchema = z.object({
  tone: z.enum(outreachTones),
  length: z.enum(outreachLengths),
  subjectLine: z.string().trim().max(180),
  body: z.string().trim().max(5000),
  shortMessage: z.string().trim().max(1200).optional(),
  phoneTalkingPoints: z
    .object({
      opener: z.string().trim().max(400),
      keyPoints: z.array(z.string().trim().max(280)).max(6),
      close: z.string().trim().max(320)
    })
    .optional()
});

export const listOutreachDraftsResponseSchema = z.object({
  runId: z.string(),
  aiAvailable: z.boolean(),
  defaultTone: z.enum(outreachTones),
  defaultLength: z.enum(outreachLengths),
  model: z.string().optional(),
  drafts: z.array(outreachDraftSchema),
  errorMessage: z.string().optional()
});

export const outreachDraftResponseSchema = z.object({
  runId: z.string(),
  aiAvailable: z.boolean(),
  defaultTone: z.enum(outreachTones),
  defaultLength: z.enum(outreachLengths),
  model: z.string().optional(),
  draft: outreachDraftSchema.optional(),
  errorMessage: z.string().optional()
});

export type CreateScoutRunRequest = z.infer<typeof createScoutRunRequestSchema>;
export type CreateScoutRunResponse = z.infer<typeof createScoutRunResponseSchema>;
export type GetScoutRunResponse = z.infer<typeof getScoutRunResponseSchema>;
export type CreateOutreachDraftRequest = z.infer<typeof createOutreachDraftRequestSchema>;
export type UpdateOutreachDraftRequest = z.infer<typeof updateOutreachDraftRequestSchema>;
export type ListOutreachDraftsResponse = z.infer<typeof listOutreachDraftsResponseSchema>;
export type OutreachDraftResponse = z.infer<typeof outreachDraftResponseSchema>;
