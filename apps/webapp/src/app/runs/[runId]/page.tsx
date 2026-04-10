import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@scout/ui";

import { ReportView } from "@/components/ReportView";
import { RunStatusView } from "@/components/RunStatusView";
import { getScoutRun, getScoutRunRecord } from "@/lib/server/scout-runner";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const record = await getScoutRunRecord(runId);

  if (!record) {
    notFound();
  }

  const report = await getScoutRun(runId);

  return (
    <AppFrame
      eyebrow="Scout report"
      title={record.intent.marketTerm}
      description={`Run ${record.runId} for "${record.input.rawQuery}"`}
      actions={
        <Link className="link-button" href="/">
          New run
        </Link>
      }
    >
      {report ? <ReportView report={report} /> : <RunStatusView record={record} />}
    </AppFrame>
  );
}
