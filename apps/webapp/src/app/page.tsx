import { APP_NAME } from "@scout/config";
import { AppFrame, Metric, MetricGrid, Panel, Tag } from "@scout/ui";

import { RecentRunsPanel } from "@/components/RecentRunsPanel";
import { RunForm } from "@/components/RunForm";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listRecentScoutRuns } from "@/lib/server/scout-runner";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const recentRuns = await listRecentScoutRuns(6);

  return (
    <AppFrame
      eyebrow="Scout v1"
      title={APP_NAME}
      description="Desktop-first live-search market scanning for who exists, what kind of web presence they have, what is broken or missing, and which businesses are worth acting on."
      navigation={<ScoutNavigation currentView="home" />}
      actions={<ThemeToggle />}
    >
      <div className="scout-shell">
        <div id="new-scan">
          <Panel
            title="Run a market scan"
            description="Start with a structured business type plus city/state, or override it with one custom query. Scout still runs the same narrow flow: resolve market intent, gather 10 to 15 candidate presences, audit owned websites where possible, and return a deterministic report."
          >
            <RunForm />
          </Panel>
        </div>

        <MetricGrid>
          <Metric label="Flow" value="Input → Run → Report" />
          <Metric label="Search Scope" value="10–15 candidates" />
          <Metric label="Audit Passes" value="Desktop + Mobile" />
          <Metric label="Evidence" value="Screenshots per page" />
        </MetricGrid>

        <div className="scout-grid two-up">
          <Panel title="What Scout Is">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="good">Market scanner</Tag>
              <Tag tone="good">Deterministic audit</Tag>
              <Tag tone="good">Lead shortlist</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              Scout is live-search and evidence-led. It classifies owned sites, directory-only
              presences, social-only presences, dead sites, blocked sites, and unclear results before
              deciding what should be audited.
            </p>
          </Panel>

          <Panel title="What Scout Is Not">
            <div className="tag-row" style={{ marginBottom: "0.85rem" }}>
              <Tag tone="warn">Not a crawler</Tag>
              <Tag tone="warn">Not an SEO suite</Tag>
              <Tag tone="warn">Not an AI-first app</Tag>
            </div>
            <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
              The MVP stays thin: one query, one run, one report. No dashboard sprawl, no outreach
              automation, no deep crawl, and no AI pretending to replace deterministic evidence.
              AI only helps draft grounded follow-up after Scout has already produced a local report.
            </p>
          </Panel>
        </div>

        <RecentRunsPanel runs={recentRuns} />
      </div>
    </AppFrame>
  );
}
