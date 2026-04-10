function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface EvidencePathInput {
  runId: string;
  candidateId: string;
  pageLabel: string;
  viewport: string;
}

export function buildRunFileName(runId: string): string {
  return `${runId}.json`;
}

export function sanitizePathSegment(value: string): string {
  return slugify(value) || "item";
}

export function buildEvidenceRelativePath(input: EvidencePathInput): string {
  return [
    sanitizePathSegment(input.runId),
    sanitizePathSegment(input.candidateId),
    `${sanitizePathSegment(input.pageLabel)}-${sanitizePathSegment(input.viewport)}.png`
  ].join("/");
}

export function buildEvidenceUrlPath(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/evidence/${encoded}`;
}
