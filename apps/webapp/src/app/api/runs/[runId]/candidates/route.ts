import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { scoutRunReportSchema } from "@scout/validation";

import {
  addManualCandidateToRun,
  promoteDiscardedCandidateToRun
} from "@/lib/server/candidates/candidate-additions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addCandidateRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("manual"),
    businessName: z.string().trim().min(2).max(140),
    url: z.string().trim().min(4).max(400),
    expectedReason: z.string().trim().max(600).optional()
  }),
  z.object({
    action: z.literal("promote_discarded"),
    discardedCandidateId: z.string().trim().min(1).max(180)
  })
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  try {
    const input = addCandidateRequestSchema.parse(await request.json());
    const report =
      input.action === "manual"
        ? await addManualCandidateToRun({
            runId,
            businessName: input.businessName,
            url: input.url,
            expectedReason: input.expectedReason
          })
        : await promoteDiscardedCandidateToRun({
            runId,
            discardedCandidateId: input.discardedCandidateId
          });

    return NextResponse.json({
      runId,
      status: report.status,
      report: scoutRunReportSchema.parse(report)
    });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : 422;
    return NextResponse.json(
      {
        errorMessage:
          error instanceof ZodError
            ? error.issues.map((issue) => issue.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to add candidate to Scout report."
      },
      { status }
    );
  }
}
