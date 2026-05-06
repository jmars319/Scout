import { NextResponse } from "next/server";
import { recordScoutHandoffDelivery } from "../../../../../../lib/server/scout-runner.ts";

interface Params {
  params: Promise<{
    runId: string;
    candidateId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const { runId, candidateId } = await params;

  try {
    const decision = (await request.json()) as {
      schema?: string;
      requestTraceId?: string;
      decision?: string;
      reason?: string;
      sourceReturn?: {
        app?: string;
        traceId?: string;
        action?: string;
      };
    };

    if (
      decision.schema !== "tenra-guardrail.external-action-decision.v1" ||
      decision.sourceReturn?.app !== "scout" ||
      decision.sourceReturn.action !== "apply-guardrail-decision"
    ) {
      return NextResponse.json({ ok: false, errorMessage: "Decision is not returnable to Scout." }, { status: 400 });
    }

    const record = await recordScoutHandoffDelivery({
      runId,
      candidateId,
      target: "guardrail",
      mode: "decision-return",
      traceId: decision.sourceReturn.traceId ?? decision.requestTraceId ?? `guardrail-${candidateId}`,
      status: decision.decision === "deny" ? "failed" : "ok",
      message: [decision.decision, decision.reason].filter(Boolean).join(": ")
    });

    return NextResponse.json({
      ok: true,
      handoffHistory: record?.persistence.handoffHistory ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, errorMessage: error instanceof Error ? error.message : "Guardrail decision import failed." },
      { status: 400 }
    );
  }
}
