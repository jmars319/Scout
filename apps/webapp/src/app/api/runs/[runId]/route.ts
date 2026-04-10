import { NextResponse } from "next/server";

import { getScoutRunResponseSchema } from "@scout/api-contracts";

import { getScoutRun, getScoutRunRecord } from "@/lib/server/scout-runner";

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
      getScoutRunResponseSchema.parse({
        runId,
        status: "not_found",
        errorMessage: "Scout run not found."
      }),
      { status: 404 }
    );
  }

  const report = await getScoutRun(runId);

  return NextResponse.json(
    getScoutRunResponseSchema.parse({
      runId,
      status: record.status,
      report: report ?? undefined,
      errorMessage: record.errorMessage
    })
  );
}
