import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  runControlActionRequestSchema,
  runControlActionResponseSchema
} from "@scout/api-contracts";
import { getWorkerConfig } from "@scout/config";

import {
  cancelScoutRun,
  cleanupStaleScoutRuns,
  getScoutRunRecord,
  retryScoutRun,
  submitScoutRun
} from "@/lib/server/scout-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;

  try {
    const input = runControlActionRequestSchema.parse(await request.json());
    const record = await getScoutRunRecord(runId);

    if (!record) {
      return NextResponse.json(
        runControlActionResponseSchema.parse({
          runId,
          status: "not_found",
          errorMessage: "Scout run not found."
        }),
        { status: 404 }
      );
    }

    if (input.action === "cancel") {
      const canceled = await cancelScoutRun(runId);

      return NextResponse.json(
        runControlActionResponseSchema.parse({
          runId,
          status: canceled?.status ?? record.status,
          errorMessage: canceled ? undefined : "Only queued or running runs can be canceled."
        }),
        { status: canceled ? 200 : 409 }
      );
    }

    if (input.action === "retry") {
      const retried = await retryScoutRun(runId);

      return NextResponse.json(
        runControlActionResponseSchema.parse({
          runId,
          status: retried?.status ?? record.status,
          errorMessage: retried ? undefined : "Only failed runs can be retried in place."
        }),
        { status: retried ? 200 : 409 }
      );
    }

    if (input.action === "cleanup_stale") {
      const requeuedCount = await cleanupStaleScoutRuns(getWorkerConfig().staleRunMs);
      const nextRecord = await getScoutRunRecord(runId);

      return NextResponse.json(
        runControlActionResponseSchema.parse({
          runId,
          status: nextRecord?.status ?? record.status,
          requeuedCount
        })
      );
    }

    const newRun = await submitScoutRun(record.input);

    return NextResponse.json(
      runControlActionResponseSchema.parse({
        runId,
        status: record.status,
        newRunId: newRun.runId
      }),
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        runControlActionResponseSchema.parse({
          runId,
          status: "not_found",
          errorMessage: error.issues.map((issue) => issue.message).join("; ")
        }),
        { status: 400 }
      );
    }

    return NextResponse.json(
      runControlActionResponseSchema.parse({
        runId,
        status: "not_found",
        errorMessage: error instanceof Error ? error.message : "Unknown run control failure."
      }),
      { status: 500 }
    );
  }
}
