import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  outreachDraftResponseSchema,
  updateOutreachDraftRequestSchema
} from "@scout/api-contracts";

import { saveOutreachDraftEdit } from "@/lib/server/outreach/outreach-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ runId: string; candidateId: string }> }
) {
  const { runId, candidateId } = await context.params;

  try {
    const input = updateOutreachDraftRequestSchema.parse(await request.json());
    const response = await saveOutreachDraftEdit({
      runId,
      candidateId,
      tone: input.tone,
      length: input.length,
      subjectLine: input.subjectLine,
      body: input.body
    });

    return NextResponse.json(
      outreachDraftResponseSchema.parse({
        runId,
        aiAvailable: response.aiAvailable,
        defaultTone: response.defaultTone,
        defaultLength: response.defaultLength,
        model: response.model,
        draft: response.draft
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        outreachDraftResponseSchema.parse({
          runId,
          aiAvailable: false,
          defaultTone: "calm",
          defaultLength: "standard",
          errorMessage: error.issues.map((issue) => issue.message).join("; ")
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      outreachDraftResponseSchema.parse({
        runId,
        aiAvailable: false,
        defaultTone: "calm",
        defaultLength: "standard",
        errorMessage: error instanceof Error ? error.message : "Unknown outreach save failure."
      }),
      { status: 500 }
    );
  }
}
