import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFrame } from "@scout/ui";

import { LeadDetailView } from "@/components/LeadDetailView";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLeadInboxItem } from "@/lib/server/leads/lead-inbox-service";
import { getScoutRun } from "@/lib/server/scout-runner";
import { createOutreachDraftRepository } from "@/lib/server/storage/outreach-draft-repository";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params
}: {
  params: Promise<{ runId: string; candidateId: string }>;
}) {
  const { runId, candidateId } = await params;
  const item = await getLeadInboxItem(runId, candidateId);

  if (!item) {
    notFound();
  }

  const [report, draft] = await Promise.all([
    getScoutRun(runId),
    createOutreachDraftRepository().get(runId, candidateId)
  ]);
  const candidate = report?.candidates.find((entry) => entry.candidateId === candidateId);
  const findings = report?.findings.filter((finding) => finding.candidateId === candidateId) ?? [];

  return (
    <AppFrame
      eyebrow="Scout lead"
      title={item.businessName}
      description={`Lead detail for ${item.marketTerm}.`}
      navigation={
        <ScoutNavigation
          currentView="leads"
          currentRunId={runId}
          currentRunLabel={item.marketTerm}
        />
      }
      actions={
        <div className="header-actions">
          <Link className="secondary-button" href="/leads">
            Lead Inbox
          </Link>
          <Link className="secondary-button" href={`/runs/${encodeURIComponent(runId)}`}>
            Report
          </Link>
          <ThemeToggle />
        </div>
      }
    >
      <LeadDetailView
        candidate={candidate}
        findings={findings}
        initialDraft={draft ?? undefined}
        initialItem={item}
      />
    </AppFrame>
  );
}
