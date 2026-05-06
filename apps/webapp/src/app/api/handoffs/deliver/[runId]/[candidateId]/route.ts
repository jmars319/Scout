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

function defaultEndpoint(target: "assembly" | "proxy"): string | undefined {
  return target === "assembly" ? process.env.SCOUT_ASSEMBLY_HANDOFF_URL : process.env.SCOUT_PROXY_SHAPE_URL;
}

export async function POST(request: Request, { params }: Params) {
  const { runId, candidateId } = await params;
  try {
    const body = (await request.json()) as {
      target?: "assembly" | "proxy";
      endpoint?: string;
    };
    const target = body.target === "proxy" ? "proxy" : "assembly";
    const endpoint = body.endpoint || defaultEndpoint(target);
    const report = await getScoutRun(runId);

    if (!report) {
      return NextResponse.json({ errorMessage: "Scout run not found." }, { status: 404 });
    }

    const handoff = buildScoutOpportunityHandoff({ report, candidateId });
    const payload = target === "proxy" ? handoff.proxyShapeRequest : handoff;

    if (!endpoint) {
      const record = await recordScoutHandoffDelivery({
        runId,
        candidateId,
        target,
        mode: "json-fallback",
        traceId: handoff.proxyShapeRequest.traceId,
        status: "ok",
        message: "No endpoint configured; returned JSON fallback."
      });
      return NextResponse.json({
        ok: true,
        delivered: false,
        deliveryMode: "json-fallback",
        fallback: payload,
        handoffHistory: record?.persistence.handoffHistory ?? []
      });
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const message = await response.text();
      const record = await recordScoutHandoffDelivery({
        runId,
        candidateId,
        target,
        mode: "json-fallback",
        endpoint,
        traceId: handoff.proxyShapeRequest.traceId,
        status: "failed",
        message
      });
      return NextResponse.json({
        ok: true,
        delivered: false,
        deliveryMode: "json-fallback",
        errorMessage: message,
        fallback: payload,
        handoffHistory: record?.persistence.handoffHistory ?? []
      });
    }

    const record = await recordScoutHandoffDelivery({
      runId,
      candidateId,
      target,
      mode: "direct-post",
      endpoint,
      traceId: handoff.proxyShapeRequest.traceId,
      status: "ok"
    });
    return NextResponse.json({
      ok: true,
      delivered: true,
      deliveryMode: "direct-post",
      response: await response.json().catch(() => ({})),
      handoffHistory: record?.persistence.handoffHistory ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errorMessage: error instanceof Error ? error.message : "Scout handoff delivery failed." },
      { status: 400 }
    );
  }
}
