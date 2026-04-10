import { scoutQueryInputSchema, scoutRunReportSchema } from "@scout/validation";
import { z } from "zod";

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

export type CreateScoutRunRequest = z.infer<typeof createScoutRunRequestSchema>;
export type CreateScoutRunResponse = z.infer<typeof createScoutRunResponseSchema>;
export type GetScoutRunResponse = z.infer<typeof getScoutRunResponseSchema>;
