import Link from "next/link";

import { AppFrame, Metric, MetricGrid, Panel } from "@scout/ui";

import { LeadInbox } from "@/components/LeadInbox";
import { LeadPipelineBoard } from "@/components/LeadPipelineBoard";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listLeadInboxItems } from "@/lib/server/leads/lead-inbox-service";

export const dynamic = "force-dynamic";

function isClosed(state: string): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

export default async function LeadsPage() {
  const items = await listLeadInboxItems(500);
  const today = new Date().toISOString().slice(0, 10);
  const dueCount = items.filter(
    (item) =>
      item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  ).length;
  const savedCount = items.filter((item) => item.annotation.state === "saved").length;
  const contactedCount = items.filter((item) => item.annotation.state === "contacted").length;

  return (
    <AppFrame
      eyebrow="Scout leads"
      title="Lead Inbox"
      description="Cross-run lead workbench for saved businesses, follow-ups, notes, and report context."
      navigation={<ScoutNavigation currentView="leads" />}
      actions={
        <div className="header-actions">
          <Link className="secondary-button" href="/runs">
            Runs
          </Link>
          <ThemeToggle />
        </div>
      }
    >
      <div className="scout-shell">
        <MetricGrid>
          <Metric label="Tracked Leads" value={items.length} />
          <Metric label="Due" value={dueCount} tone={dueCount > 0 ? "warn" : "neutral"} />
          <Metric label="Saved" value={savedCount} tone="good" />
          <Metric label="Contacted" value={contactedCount} tone="warn" />
        </MetricGrid>

        <Panel
          title="Pipeline"
          description="A compact operating board for the current lead workload before opening the full inbox controls."
        >
          <LeadPipelineBoard items={items} today={today} />
        </Panel>

        <Panel title="Lead Inbox">
          <LeadInbox initialItems={items} today={today} />
        </Panel>
      </div>
    </AppFrame>
  );
}
