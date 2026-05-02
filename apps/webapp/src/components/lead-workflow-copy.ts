import type { LeadOutreachStatus, LeadStatus } from "@scout/domain";

export const leadStatusOptions: Array<{ value: LeadStatus; label: string }> = [
  { value: "needs_review", label: "Needs Review" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "dismissed", label: "Dismissed" },
  { value: "not_a_fit", label: "Not a Fit" }
];

export function humanizeLeadValue(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function labelForLeadStatus(state: LeadStatus): string {
  return leadStatusOptions.find((option) => option.value === state)?.label ?? state;
}

export function toneForLeadStatus(state: LeadStatus): "neutral" | "good" | "warn" | "danger" {
  if (state === "saved") {
    return "good";
  }

  if (state === "contacted") {
    return "warn";
  }

  if (state === "dismissed" || state === "not_a_fit") {
    return "danger";
  }

  return "neutral";
}

export function labelForLeadOutreachStatus(status: LeadOutreachStatus): string {
  if (status === "no_draft") {
    return "No Draft";
  }

  if (status === "contact_analyzed") {
    return "Contact Analyzed";
  }

  if (status === "draft_ready") {
    return "Draft Ready";
  }

  return "Saved Draft";
}

export function toneForLeadOutreachStatus(
  status: LeadOutreachStatus
): "neutral" | "good" | "warn" | "danger" {
  if (status === "draft_ready" || status === "edited_saved") {
    return "good";
  }

  if (status === "contact_analyzed") {
    return "warn";
  }

  return "neutral";
}

export function formatLeadUpdatedAt(value: string): string {
  return value.replace("T", " ").slice(0, 16);
}
