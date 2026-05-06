import { buildScoutOpportunityHandoff } from "@scout/api-contracts";
import { NextResponse } from "next/server";
import { getScoutRun } from "../../../../../../lib/server/scout-runner.ts";

interface Params {
  params: Promise<{
    runId: string;
    candidateId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { runId, candidateId } = await params;
    const report = await getScoutRun(runId);

    if (!report) {
      return NextResponse.json({ errorMessage: "Scout run not found." }, { status: 404 });
    }

    return NextResponse.json(buildScoutOpportunityHandoff({ report, candidateId }));
  } catch (error) {
    return NextResponse.json(
      { errorMessage: error instanceof Error ? error.message : "Scout handoff export failed." },
      { status: 400 }
    );
  }
}
