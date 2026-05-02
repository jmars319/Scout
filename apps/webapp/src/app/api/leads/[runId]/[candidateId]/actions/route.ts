import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  leadInboxActionRequestSchema,
  leadInboxItemResponseSchema
} from "@scout/api-contracts";

import { runLeadInboxAction } from "@/lib/server/leads/lead-inbox-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await context.params;

  try {
    const action = leadInboxActionRequestSchema.parse(await request.json());
    const item = await runLeadInboxAction({
      runId,
      candidateId,
      action
    });

    return NextResponse.json(
      leadInboxItemResponseSchema.parse({
        item
      })
    );
  } catch (error) {
    const status =
      error instanceof ZodError
        ? 400
        : error instanceof Error &&
            (error.message === "Lead inbox item not found." ||
              error.message === "Lead annotation not found." ||
              error.message === "Scout run report not found.")
          ? 404
          : 422;

    return NextResponse.json(
      leadInboxItemResponseSchema.parse({
        errorMessage:
          error instanceof ZodError
            ? error.issues.map((issue) => issue.message).join("; ")
            : error instanceof Error
              ? error.message
              : "Unable to run lead action."
      }),
      { status }
    );
  }
}
