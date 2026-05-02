import Link from "next/link";

import { Tag } from "@scout/ui";

function navClassName(active: boolean, accent = false): string {
  if (accent) {
    return "app-nav-link app-nav-link-accent";
  }

  return active ? "app-nav-link active" : "app-nav-link";
}

export function ScoutNavigation({
  currentView,
  currentRunId,
  currentRunLabel
}: {
  currentView: "home" | "runs" | "run" | "leads" | "settings";
  currentRunId?: string;
  currentRunLabel?: string;
}) {
  return (
    <nav aria-label="Scout navigation" className="app-nav">
      <div className="app-nav-cluster">
        <Link aria-current={currentView === "home" ? "page" : undefined} className={navClassName(currentView === "home")} href="/">
          Home
        </Link>
        <Link
          aria-current={currentView === "runs" ? "page" : undefined}
          className={navClassName(currentView === "runs")}
          href="/runs"
        >
          Runs
        </Link>
        <Link
          aria-current={currentView === "leads" ? "page" : undefined}
          className={navClassName(currentView === "leads")}
          href="/leads"
        >
          Leads
        </Link>
        <Link
          aria-current={currentView === "settings" ? "page" : undefined}
          className={navClassName(currentView === "settings")}
          href="/settings"
        >
          Settings
        </Link>
        {currentView === "run" ? (
          <span aria-current="page" className={navClassName(true)}>
            Current Run
          </span>
        ) : null}
        <Link className={navClassName(false, true)} href="/#new-scan">
          New Scan
        </Link>
      </div>

      {currentView === "run" ? (
        <div className="app-nav-meta">
          {currentRunLabel ? <span>{currentRunLabel}</span> : null}
          {currentRunId ? <Tag>{currentRunId}</Tag> : null}
        </div>
      ) : null}
    </nav>
  );
}
