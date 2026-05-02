import { NextResponse } from "next/server";

import { listLeadAnnotationsResponseSchema } from "@scout/api-contracts";

import { getLeadAnnotations } from "@/lib/server/leads/lead-workflow-service";
import { getScoutRunRecord } from "@/lib/server/scout-runner";

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
      listLeadAnnotationsResponseSchema.parse({
        runId,
        annotations: [],
        errorMessage: "Scout run not found."
      }),
      { status: 404 }
    );
  }

  return NextResponse.json(
    listLeadAnnotationsResponseSchema.parse({
      runId,
      annotations: await getLeadAnnotations(runId)
    })
  );
}
