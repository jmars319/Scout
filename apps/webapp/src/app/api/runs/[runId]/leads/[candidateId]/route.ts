import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  leadAnnotationResponseSchema,
  updateLeadAnnotationRequestSchema
} from "@scout/api-contracts";

import { saveLeadAnnotation } from "@/lib/server/leads/lead-workflow-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await context.params;

  try {
    const input = updateLeadAnnotationRequestSchema.parse(await request.json());
    const annotation = await saveLeadAnnotation({
      runId,
      candidateId,
      state: input.state,
      operatorNote: input.operatorNote,
      followUpDate: input.followUpDate
    });

    return NextResponse.json(
      leadAnnotationResponseSchema.parse({
        runId,
        annotation
      })
    );
  } catch (error) {
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof Error && error.message === "Scout run not found."
          ? 404
          : 422;

    return NextResponse.json(
      leadAnnotationResponseSchema.parse({
        runId,
        errorMessage:
          error instanceof ZodError
            ? error.issues.map((issue) => issue.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to update this lead."
      }),
      { status }
    );
  }
}
