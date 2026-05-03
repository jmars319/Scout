import Link from "next/link";

import type { LeadInboxItem, LeadStatus } from "@scout/domain";
import { Tag } from "@scout/ui";

import {
  humanizeLeadValue,
  labelForLeadOutreachStatus,
  labelForLeadStatus,
  toneForLeadOutreachStatus,
  toneForLeadStatus
} from "./lead-workflow-copy";

type PipelineColumnId = "due" | "needs_draft" | "ready" | "contacted" | "closed";

interface PipelineColumn {
  id: PipelineColumnId;
  title: string;
  description: string;
  filter: string;
}

const columns: PipelineColumn[] = [
  {
    id: "due",
    title: "Due",
    description: "Follow-ups due today or earlier.",
    filter: "due"
  },
  {
    id: "needs_draft",
    title: "Needs Draft",
    description: "Open leads without usable outreach.",
    filter: "needs_draft"
  },
  {
    id: "ready",
    title: "Ready",
    description: "Drafted leads ready for handoff.",
    filter: "ready"
  },
  {
    id: "contacted",
    title: "Contacted",
    description: "Sent or called, now waiting.",
    filter: "contacted"
  },
  {
    id: "closed",
    title: "Closed",
    description: "Dismissed or not a fit.",
    filter: "closed"
  }
];

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function isDue(item: LeadInboxItem, today: string): boolean {
  return Boolean(
    item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  );
}

function resolveColumn(item: LeadInboxItem, today: string): PipelineColumnId {
  if (isDue(item, today)) {
    return "due";
  }

  if (isClosed(item.annotation.state)) {
    return "closed";
  }

  if (item.annotation.state === "contacted") {
    return "contacted";
  }

  if (item.outreach.status === "draft_ready" || item.outreach.status === "edited_saved") {
    return "ready";
  }

  return "needs_draft";
}

function sortLeads(left: LeadInboxItem, right: LeadInboxItem): number {
  return (
    (left.annotation.followUpDate ?? "9999-12-31").localeCompare(
      right.annotation.followUpDate ?? "9999-12-31"
    ) || right.annotation.updatedAt.localeCompare(left.annotation.updatedAt)
  );
}

export function LeadPipelineBoard({
  items,
  today
}: {
  items: LeadInboxItem[];
  today: string;
}) {
  const grouped = new Map<PipelineColumnId, LeadInboxItem[]>(
    columns.map((column) => [column.id, []])
  );

  for (const item of items) {
    grouped.get(resolveColumn(item, today))?.push(item);
  }

  return (
    <div className="lead-pipeline-board">
      {columns.map((column) => {
        const columnItems = (grouped.get(column.id) ?? []).sort(sortLeads);
        const visibleItems = columnItems.slice(0, 4);

        return (
          <section className="lead-pipeline-column" key={column.id}>
            <div className="lead-pipeline-column-head">
              <div>
                <div className="section-label">{column.title}</div>
                <p className="muted">{column.description}</p>
              </div>
              <Tag tone={column.id === "due" && columnItems.length > 0 ? "warn" : "neutral"}>
                {columnItems.length}
              </Tag>
            </div>

            {visibleItems.length > 0 ? (
              <ul className="lead-pipeline-list">
                {visibleItems.map((item) => (
                  <li className="lead-pipeline-item" key={`${item.runId}:${item.candidateId}`}>
                    <Link
                      className="inline-link"
                      href={`/leads/${encodeURIComponent(item.runId)}/${encodeURIComponent(item.candidateId)}`}
                    >
                      {item.businessName}
                    </Link>
                    <div className="muted">{item.marketTerm}</div>
                    <div className="tag-row">
                      <Tag tone={toneForLeadStatus(item.annotation.state)}>
                        {labelForLeadStatus(item.annotation.state)}
                      </Tag>
                      <Tag tone={toneForLeadOutreachStatus(item.outreach.status)}>
                        {labelForLeadOutreachStatus(item.outreach.status)}
                      </Tag>
                      {item.annotation.followUpDate ? (
                        <Tag>{item.annotation.followUpDate}</Tag>
                      ) : null}
                      {item.presenceQuality ? <Tag>{humanizeLeadValue(item.presenceQuality)}</Tag> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No leads in this stage.
              </p>
            )}

            {columnItems.length > visibleItems.length ? (
              <Link className="inline-link" href={`/leads?filter=${column.filter}`}>
                {columnItems.length - visibleItems.length} more
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
