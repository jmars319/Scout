import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  createOutreachDraftRequestSchema,
  listOutreachDraftsResponseSchema,
  outreachDraftResponseSchema
} from "@scout/api-contracts";

import { getScoutRunRecord } from "@/lib/server/scout-runner";
import {
  generateOutreachDraft,
  getOutreachWorkspaceState
} from "@/lib/server/outreach/outreach-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;
  const record = await getScoutRunRecord(runId);

  if (!record) {
    return NextResponse.json(
      listOutreachDraftsResponseSchema.parse({
        runId,
        aiAvailable: false,
        defaultTone: "calm",
        defaultLength: "standard",
        drafts: [],
        errorMessage: "Scout run not found."
      }),
      { status: 404 }
    );
  }

  return NextResponse.json(
    listOutreachDraftsResponseSchema.parse(await getOutreachWorkspaceState(runId))
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  try {
    const input = createOutreachDraftRequestSchema.parse(await request.json());
    const response = await generateOutreachDraft({
      runId,
      candidateId: input.candidateId,
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.length ? { length: input.length } : {})
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
        errorMessage: error instanceof Error ? error.message : "Unknown outreach generation failure."
      }),
      { status: 500 }
    );
  }
}
