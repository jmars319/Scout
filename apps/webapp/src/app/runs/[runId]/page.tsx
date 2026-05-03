import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@scout/ui";

import { ReportView } from "@/components/ReportView";
import { RunStatusView } from "@/components/RunStatusView";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLeadAnnotations } from "@/lib/server/leads/lead-workflow-service";
import { buildMarketComparison } from "@/lib/server/market-comparison";
import { getOutreachWorkspaceState } from "@/lib/server/outreach/outreach-service";
import {
  getPreviousCompletedScoutRunForMarket,
  getScoutRun,
  getScoutRunRecord
} from "@/lib/server/scout-runner";

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
  const [outreach, leadAnnotations, previousReport] = report
    ? await Promise.all([
        getOutreachWorkspaceState(runId),
        getLeadAnnotations(runId),
        report.status === "completed"
          ? getPreviousCompletedScoutRunForMarket(record.input.rawQuery, record.createdAt)
          : Promise.resolve(null)
      ])
    : [null, [], null];
  const marketComparison =
    report?.status === "completed" && previousReport
      ? buildMarketComparison(report, previousReport)
      : null;

  return (
    <AppFrame
      eyebrow="Scout report"
      title={record.intent.marketTerm}
      description={`Run ${record.runId} for "${record.input.rawQuery}"`}
      navigation={
        <ScoutNavigation
          currentView="run"
          currentRunId={record.runId}
          currentRunLabel={record.intent.marketTerm}
        />
      }
      actions={
        <div className="header-actions">
          <Link className="secondary-button" href="/">
            Home
          </Link>
          <Link className="link-button" href="/#new-scan">
            New scan
          </Link>
          <ThemeToggle />
        </div>
      }
    >
      {report && outreach ? (
        <ReportView
          leadAnnotations={leadAnnotations}
          marketComparison={marketComparison}
          outreach={outreach}
          report={report}
        />
      ) : (
        <RunStatusView record={record} />
      )}
    </AppFrame>
  );
}
