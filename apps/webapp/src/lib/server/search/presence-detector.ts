import {
  createPresenceRecord,
  evaluatePresenceUrl,
  type PresenceRecord,
  type PresenceRuleMatch,
  type ResolvedMarketIntent,
  type SearchCandidate
} from "@scout/domain";

const BLOCKED_STATUSES = new Set([401, 403, 429]);
const BLOCKED_PATTERNS = [
  "access denied",
  "request blocked",
  "verify you are human",
  "captcha",
  "forbidden",
  "cloudflare ray id",
  "attention required"
] as const;
const DEAD_PATTERNS = [
  "page not found",
  "404",
  "site not found",
  "domain for sale",
  "buy this domain",
  "this site can't be reached",
  "account suspended"
] as const;
const PLACEHOLDER_PATTERNS = [
  "coming soon",
  "under construction",
  "launching soon"
] as const;

function isHtmlLike(contentType: string | null): boolean {
  return contentType ? contentType.includes("text/html") : true;
}

function normalizeDomain(value: string): string {
  return value.replace(/^www\./, "").toLowerCase();
}

function includesAny(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function appendRuleNote(notes: string[], rule: PresenceRuleMatch, source: string): void {
  notes.push(`${source}: ${rule.reason} (${rule.confidence} confidence).`);
}

function finalizePresenceRecord(
  candidate: SearchCandidate,
  type: PresenceRuleMatch["type"],
  detectionNotes: string[],
  resolvedUrl?: string
): PresenceRecord {
  const record = createPresenceRecord(candidate, type, detectionNotes);

  if (resolvedUrl) {
    record.primaryUrl = resolvedUrl;
    record.domain = normalizeDomain(new URL(resolvedUrl).hostname);
  }

  return record;
}

async function readBodyPreview(response: Response): Promise<string> {
  const body = await response.text();
  return body.replace(/\s+/g, " ").trim().slice(0, 5000).toLowerCase();
}

export async function detectPresence(
  candidate: SearchCandidate,
  _intent: ResolvedMarketIntent
): Promise<PresenceRecord> {
  void _intent;
  const detectionNotes: string[] = [];
  const initialRule = evaluatePresenceUrl({
    url: candidate.url,
    title: candidate.title,
    snippet: candidate.snippet
  });

  appendRuleNote(detectionNotes, initialRule, "Search result");

  if (initialRule.type !== "owned_website") {
    return finalizePresenceRecord(candidate, initialRule.type, detectionNotes);
  }

  try {
    const response = await fetch(candidate.url, {
      redirect: "follow",
      headers: {
        "user-agent": "Scout/0.1"
      },
      signal: AbortSignal.timeout(8_000)
    });

    const resolvedUrl = response.url || candidate.url;

    if (BLOCKED_STATUSES.has(response.status)) {
      detectionNotes.push(`Homepage probe was blocked with HTTP ${response.status}.`);
      return finalizePresenceRecord(candidate, "blocked", detectionNotes, resolvedUrl);
    }

    if (response.status >= 400) {
      detectionNotes.push(`Homepage probe returned HTTP ${response.status}.`);
      return finalizePresenceRecord(candidate, "dead", detectionNotes, resolvedUrl);
    }

    if (!isHtmlLike(response.headers.get("content-type"))) {
      detectionNotes.push("Resolved destination does not look like an HTML website.");
      return finalizePresenceRecord(candidate, "unknown", detectionNotes, resolvedUrl);
    }

    const resolvedRule = evaluatePresenceUrl({
      url: resolvedUrl,
      title: candidate.title,
      snippet: candidate.snippet
    });

    appendRuleNote(detectionNotes, resolvedRule, "Resolved destination");

    if (resolvedRule.type !== "owned_website") {
      return finalizePresenceRecord(candidate, resolvedRule.type, detectionNotes, resolvedUrl);
    }

    const bodyPreview = await readBodyPreview(response);

    if (includesAny(bodyPreview, BLOCKED_PATTERNS)) {
      detectionNotes.push("Homepage content looked blocked by an access gate or verification wall.");
      return finalizePresenceRecord(candidate, "blocked", detectionNotes, resolvedUrl);
    }

    if (includesAny(bodyPreview, DEAD_PATTERNS)) {
      detectionNotes.push("Homepage content looked dead, parked, or suspended.");
      return finalizePresenceRecord(candidate, "dead", detectionNotes, resolvedUrl);
    }

    if (includesAny(bodyPreview, PLACEHOLDER_PATTERNS)) {
      detectionNotes.push("Homepage appears to be a placeholder or coming-soon page.");
    }

    detectionNotes.push("Homepage responded with HTML and remained eligible for audit.");
    return finalizePresenceRecord(candidate, "owned_website", detectionNotes, resolvedUrl);
  } catch (error) {
    detectionNotes.push(
      error instanceof Error ? `Homepage probe failed: ${error.message}` : "Homepage probe failed."
    );
    return finalizePresenceRecord(candidate, "dead", detectionNotes);
  }
}
