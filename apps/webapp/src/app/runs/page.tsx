import Link from "next/link";

import { AppFrame, Panel, Tag } from "@scout/ui";

import { RecentRunsPanel } from "@/components/RecentRunsPanel";
import { ScoutNavigation } from "@/components/ScoutNavigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listRecentScoutRuns } from "@/lib/server/scout-runner";

export const dynamic = "force-dynamic";

export default async function RunsIndexPage() {
  const recentRuns = await listRecentScoutRuns(24);
  const queuedCount = recentRuns.filter((run) => run.status === "queued").length;
  const runningCount = recentRuns.filter((run) => run.status === "running").length;
  const completedCount = recentRuns.filter((run) => run.status === "completed").length;
  const failedCount = recentRuns.filter((run) => run.status === "failed").length;

  return (
    <AppFrame
      eyebrow="Scout runs"
      title="Run Library"
      description="Stored Scout runs across queued, running, completed, and failed states. Open any run here to inspect progress, read the report, or continue outreach work."
      navigation={<ScoutNavigation currentView="runs" />}
      actions={<ThemeToggle />}
    >
      <div className="scout-shell">
        <Panel
          title="Current Mix"
          description="Scout keeps the product shape narrow, but the run library gives you one place to reopen status pages, finished reports, and outreach work."
        >
          <div className="tag-row">
            <Tag tone={queuedCount > 0 ? "warn" : "neutral"}>Queued {queuedCount}</Tag>
            <Tag tone={runningCount > 0 ? "warn" : "neutral"}>Running {runningCount}</Tag>
            <Tag tone={completedCount > 0 ? "good" : "neutral"}>Completed {completedCount}</Tag>
            <Tag tone={failedCount > 0 ? "danger" : "neutral"}>Failed {failedCount}</Tag>
          </div>
          <div className="tag-row" style={{ marginTop: "1rem" }}>
            <Link className="link-button" href="/#new-scan">
              Start New Scan
            </Link>
            <Link className="secondary-button" href="/">
              Go Home
            </Link>
          </div>
        </Panel>

        <RecentRunsPanel
          runs={recentRuns}
          title="All Recent Runs"
          description="Open any stored run from here, including queued and running runs. Progress pages stay reachable while the worker is still active."
        />
      </div>
    </AppFrame>
  );
}
