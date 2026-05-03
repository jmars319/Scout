import {
  leadAnnotationSchema,
  leadInboxItemSchema,
  outreachDraftSchema,
  outreachProfileSchema,
  scoutQueryInputSchema,
  scoutRunReportSchema
} from "@scout/validation";
import { z } from "zod";

const leadStatuses = ["needs_review", "saved", "contacted", "dismissed", "not_a_fit"] as const;
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

export const updateLeadAnnotationRequestSchema = z.object({
  state: z.enum(leadStatuses),
  operatorNote: z.string().trim().max(1600).default(""),
  followUpDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional()
});

export const listLeadAnnotationsResponseSchema = z.object({
  runId: z.string(),
  annotations: z.array(leadAnnotationSchema),
  errorMessage: z.string().optional()
});

export const leadAnnotationResponseSchema = z.object({
  runId: z.string(),
  annotation: leadAnnotationSchema.optional(),
  errorMessage: z.string().optional()
});

export const listLeadInboxResponseSchema = z.object({
  generatedAt: z.iso.datetime(),
  items: z.array(leadInboxItemSchema),
  errorMessage: z.string().optional()
});

export const leadInboxItemResponseSchema = z.object({
  item: leadInboxItemSchema.optional(),
  errorMessage: z.string().optional()
});

const leadInboxActionTargetSchema = z.object({
  runId: z.string().min(1),
  candidateId: z.string().min(1)
});

export const leadInboxActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("analyze_contact")
  }),
  z.object({
    action: z.literal("generate_draft"),
    tone: z.enum(outreachTones).optional(),
    length: z.enum(outreachLengths).optional()
  }),
  z.object({
    action: z.literal("mark_contacted"),
    followUpDate: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
      .optional()
  })
]);

export const leadInboxBulkActionRequestSchema = z.object({
  items: z.array(leadInboxActionTargetSchema).min(1).max(100),
  action: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("mark_contacted"),
      followUpDate: z
        .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
        .optional()
    }),
    z.object({
      action: z.literal("dismiss")
    }),
    z.object({
      action: z.literal("mark_not_a_fit")
    }),
    z.object({
      action: z.literal("set_follow_up"),
      followUpDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    })
  ])
});

export const leadInboxBulkActionResponseSchema = z.object({
  items: z.array(leadInboxItemSchema).default([]),
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

export const updateOutreachProfileRequestSchema = outreachProfileSchema.omit({
  profileId: true,
  updatedAt: true
});

export const outreachProfileResponseSchema = z.object({
  profile: outreachProfileSchema.optional(),
  errorMessage: z.string().optional()
});

export type CreateScoutRunRequest = z.infer<typeof createScoutRunRequestSchema>;
export type CreateScoutRunResponse = z.infer<typeof createScoutRunResponseSchema>;
export type GetScoutRunResponse = z.infer<typeof getScoutRunResponseSchema>;
export type UpdateLeadAnnotationRequest = z.infer<typeof updateLeadAnnotationRequestSchema>;
export type ListLeadAnnotationsResponse = z.infer<typeof listLeadAnnotationsResponseSchema>;
export type LeadAnnotationResponse = z.infer<typeof leadAnnotationResponseSchema>;
export type ListLeadInboxResponse = z.infer<typeof listLeadInboxResponseSchema>;
export type LeadInboxItemResponse = z.infer<typeof leadInboxItemResponseSchema>;
export type LeadInboxActionRequest = z.infer<typeof leadInboxActionRequestSchema>;
export type LeadInboxBulkActionRequest = z.infer<typeof leadInboxBulkActionRequestSchema>;
export type LeadInboxBulkActionResponse = z.infer<typeof leadInboxBulkActionResponseSchema>;
export type CreateOutreachDraftRequest = z.infer<typeof createOutreachDraftRequestSchema>;
export type UpdateOutreachDraftRequest = z.infer<typeof updateOutreachDraftRequestSchema>;
export type ListOutreachDraftsResponse = z.infer<typeof listOutreachDraftsResponseSchema>;
export type OutreachDraftResponse = z.infer<typeof outreachDraftResponseSchema>;
export type UpdateOutreachProfileRequest = z.infer<typeof updateOutreachProfileRequestSchema>;
export type OutreachProfileResponse = z.infer<typeof outreachProfileResponseSchema>;
