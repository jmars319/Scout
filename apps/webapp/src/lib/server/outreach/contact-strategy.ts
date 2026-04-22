import { chromium } from "playwright";

import type {
  OutreachChannelKind,
  OutreachContactChannel,
  PresenceRecord
} from "@scout/domain";

import { discoverSecondaryTarget } from "../audit/page-helpers.ts";

interface ContactDiscoveryResult {
  channels: OutreachContactChannel[];
  rationale: string[];
}

interface PageContactSignals {
  pageUrl: string;
  emails: string[];
  phones: string[];
  hasForm: boolean;
  socialLinks: Array<{ kind: OutreachChannelKind; url: string }>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/[^\d+x]/gi, "").trim();
}

function humanizeChannel(kind: OutreachChannelKind): string {
  if (kind === "contact_form") {
    return "Contact form";
  }

  if (kind === "facebook_dm") {
    return "Facebook message";
  }

  if (kind === "instagram_dm") {
    return "Instagram message";
  }

  if (kind === "linkedin_message") {
    return "LinkedIn message";
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function scoreChannel(
  presenceType: PresenceRecord["presenceType"],
  kind: OutreachChannelKind
): number {
  if (presenceType === "facebook_only" && kind === "facebook_dm") {
    return 98;
  }

  if (presenceType === "owned_website") {
    if (kind === "email") {
      return 100;
    }

    if (kind === "contact_form") {
      return 92;
    }

    if (kind === "phone") {
      return 80;
    }

    if (kind === "instagram_dm") {
      return 58;
    }

    if (kind === "facebook_dm") {
      return 56;
    }

    if (kind === "linkedin_message") {
      return 54;
    }
  }

  if (kind === "phone") {
    return 74;
  }

  if (kind === "email") {
    return 70;
  }

  if (kind === "contact_form") {
    return 68;
  }

  if (kind === "instagram_dm") {
    return 62;
  }

  if (kind === "facebook_dm") {
    return 60;
  }

  if (kind === "linkedin_message") {
    return 58;
  }

  return 45;
}

function buildReason(kind: OutreachChannelKind, source: "primary" | "secondary"): string {
  const where =
    source === "secondary"
      ? "Scout found this on the most contact-oriented secondary page."
      : "Scout found this on the primary page.";

  if (kind === "email") {
    return `${where} A direct email path is usually the cleanest first contact.`;
  }

  if (kind === "contact_form") {
    return `${where} The business exposes a site contact form, which is often the intended inbound path.`;
  }

  if (kind === "phone") {
    return `${where} The business exposes a phone path prominently enough to support a direct call.`;
  }

  return `${where} This social channel looks like a viable fallback when direct site contact is weaker.`;
}

function buildChannelsFromSignals(
  presence: PresenceRecord,
  primarySignals: PageContactSignals | null,
  secondarySignals: PageContactSignals | null
): ContactDiscoveryResult {
  const channels: OutreachContactChannel[] = [];
  const rationale: string[] = [];

  function pushChannel(
    kind: OutreachChannelKind,
    source: "primary" | "secondary",
    details: { value?: string; url?: string }
  ) {
    const existing = channels.find(
      (channel) =>
        channel.kind === kind &&
        channel.value === details.value &&
        channel.url === details.url
    );
    if (existing) {
      return;
    }

    channels.push({
      kind,
      label: humanizeChannel(kind),
      ...(details.value ? { value: details.value } : {}),
      ...(details.url ? { url: details.url } : {}),
      score: scoreChannel(presence.presenceType, kind) + (source === "secondary" ? 2 : 0),
      reason: buildReason(kind, source)
    });
  }

  for (const email of unique([
    ...(primarySignals?.emails ?? []),
    ...(secondarySignals?.emails ?? [])
  ])) {
    pushChannel("email", secondarySignals?.emails.includes(email) ? "secondary" : "primary", {
      value: email,
      url: `mailto:${email}`
    });
  }

  for (const phone of unique([
    ...(primarySignals?.phones ?? []),
    ...(secondarySignals?.phones ?? [])
  ])) {
    pushChannel("phone", secondarySignals?.phones.includes(phone) ? "secondary" : "primary", {
      value: phone,
      url: `tel:${phone}`
    });
  }

  if (primarySignals?.hasForm) {
    pushChannel("contact_form", "primary", { url: primarySignals.pageUrl });
  }

  if (secondarySignals?.hasForm) {
    pushChannel("contact_form", "secondary", { url: secondarySignals.pageUrl });
  }

  for (const social of [
    ...(primarySignals?.socialLinks ?? []),
    ...(secondarySignals?.socialLinks ?? [])
  ]) {
    pushChannel(
      social.kind,
      secondarySignals?.socialLinks.some((entry) => entry.url === social.url) ? "secondary" : "primary",
      { url: social.url }
    );
  }

  if (
    channels.length === 0 &&
    (presence.presenceType === "facebook_only" || presence.primaryUrl.includes("facebook.com"))
  ) {
    pushChannel("facebook_dm", "primary", { url: presence.primaryUrl });
  }

  if (
    channels.length === 0 &&
    (presence.primaryUrl.includes("instagram.com") || presence.primaryUrl.includes("linkedin.com"))
  ) {
    if (presence.primaryUrl.includes("instagram.com")) {
      pushChannel("instagram_dm", "primary", { url: presence.primaryUrl });
    } else {
      pushChannel("linkedin_message", "primary", { url: presence.primaryUrl });
    }
  }

  channels.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  if (channels[0]) {
    rationale.push(
      `${channels[0].label} looks like the strongest first contact path for this business right now.`
    );
  }

  if (channels[1]) {
    rationale.push(`${channels[1].label} is a viable fallback if the first path gets no response.`);
  }

  if (channels.length === 0) {
    rationale.push("Scout did not find a direct contact channel from the inspected pages.");
  }

  return {
    channels,
    rationale
  };
}

async function collectSignals(pageUrl: string): Promise<PageContactSignals | null> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  const page = await context.newPage();

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => null);

    const result = await page.evaluate(() => {
      const emails = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]'))
        .map((anchor) => anchor.getAttribute("href")?.replace(/^mailto:/i, "").trim() ?? "")
        .filter(Boolean);

      const phonesFromLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]'))
        .map((anchor) => anchor.getAttribute("href")?.replace(/^tel:/i, "").trim() ?? "")
        .filter(Boolean);

      const visibleText = document.body?.innerText ?? "";
      const phonePattern =
        /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;
      const phonesFromText = visibleText.match(phonePattern) ?? [];

      const socialLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .map((anchor) => anchor.href)
        .filter(Boolean)
        .map((href) => {
          if (href.includes("facebook.com")) {
            return { kind: "facebook_dm", url: href };
          }

          if (href.includes("instagram.com")) {
            return { kind: "instagram_dm", url: href };
          }

          if (href.includes("linkedin.com")) {
            return { kind: "linkedin_message", url: href };
          }

          return null;
        })
        .filter((entry): entry is { kind: OutreachChannelKind; url: string } => Boolean(entry));

      return {
        pageUrl: window.location.href,
        emails,
        phones: [...phonesFromLinks, ...phonesFromText],
        hasForm: Boolean(document.querySelector("form")),
        socialLinks
      };
    });

    return {
      pageUrl: result.pageUrl,
      emails: unique(result.emails),
      phones: unique(result.phones.map(normalizePhoneNumber).filter(Boolean)),
      hasForm: result.hasForm,
      socialLinks: unique(result.socialLinks.map((entry) => `${entry.kind}:${entry.url}`)).map(
        (value) => {
          const [kind, ...rest] = value.split(":");
          return {
            kind: kind as OutreachChannelKind,
            url: rest.join(":")
          };
        }
      )
    };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function analyzeContactStrategy(
  presence: PresenceRecord
): Promise<ContactDiscoveryResult> {
  if (
    presence.presenceType === "dead" ||
    presence.presenceType === "blocked" ||
    presence.presenceType === "unknown"
  ) {
    return {
      channels: [],
      rationale: ["Scout does not have a reliable direct contact path for this candidate yet."]
    };
  }

  const primarySignals = await collectSignals(presence.primaryUrl);
  let secondarySignals: PageContactSignals | null = null;

  if (presence.presenceType === "owned_website") {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: {
        width: 1280,
        height: 900
      }
    });
    const page = await context.newPage();

    try {
      await page.goto(presence.primaryUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => null);
      const secondaryTarget = await discoverSecondaryTarget(page);

      if (secondaryTarget?.url && secondaryTarget.url !== presence.primaryUrl) {
        secondarySignals = await collectSignals(secondaryTarget.url);
      }
    } catch {
      secondarySignals = null;
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  return buildChannelsFromSignals(presence, primarySignals, secondarySignals);
}
