import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createScoutRunRequestSchema, createScoutRunResponseSchema } from "@scout/api-contracts";

import { submitScoutRun } from "@/lib/server/scout-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = createScoutRunRequestSchema.parse(await request.json());
    const run = await submitScoutRun(input);

    return NextResponse.json(
      createScoutRunResponseSchema.parse({
        runId: run.runId,
        status: run.status,
        report: undefined,
        errorMessage: run.errorMessage
      }),
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          errorMessage: error.issues.map((issue) => issue.message).join("; ")
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        errorMessage: error instanceof Error ? error.message : "Unknown run failure."
      },
      { status: 500 }
    );
  }
}
