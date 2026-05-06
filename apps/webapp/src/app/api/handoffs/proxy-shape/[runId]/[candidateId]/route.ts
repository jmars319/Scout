import { buildScoutOpportunityHandoff } from "@scout/api-contracts";
import { NextResponse } from "next/server";
import {
  getScoutRun,
  recordScoutHandoffDelivery
} from "../../../../../../lib/server/scout-runner.ts";

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

    const handoff = buildScoutOpportunityHandoff({ report, candidateId });
    await recordScoutHandoffDelivery({
      runId,
      candidateId,
      target: "proxy",
      mode: "download",
      traceId: handoff.proxyShapeRequest.traceId,
      status: "ok"
    });

    return NextResponse.json(handoff.proxyShapeRequest);
  } catch (error) {
    return NextResponse.json(
      { errorMessage: error instanceof Error ? error.message : "Scout Proxy shape export failed." },
      { status: 400 }
    );
  }
}
