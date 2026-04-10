import type { AuditPageTarget } from "@scout/domain";
import type { Page } from "playwright";

const SECONDARY_PRIORITY_RULES = [
  { keywords: ["contact", "contact us", "get in touch"], score: 90 },
  { keywords: ["book", "booking", "schedule", "appointment", "reserve"], score: 84 },
  { keywords: ["services", "service", "treatments"], score: 76 },
  { keywords: ["menu", "order"], score: 72 },
  { keywords: ["locations", "location", "find us"], score: 66 },
  { keywords: ["about", "our story"], score: 48 }
] as const;
const CTA_KEYWORDS = [
  "contact",
  "book",
  "schedule",
  "call",
  "quote",
  "reserve",
  "menu",
  "appointment",
  "order",
  "get started"
] as const;
const CONTACT_KEYWORDS = [
  "contact",
  "call",
  "phone",
  "location",
  "directions",
  "visit",
  "appointment",
  "book",
  "reserve"
] as const;
const TRUST_SIGNAL_KEYWORDS = [
  "testimonial",
  "review",
  "years",
  "since",
  "licensed",
  "insured",
  "certified",
  "award",
  "family owned"
] as const;
const BLOCKED_PATTERNS = [
  "access denied",
  "request blocked",
  "verify you are human",
  "captcha",
  "attention required"
] as const;
const DEAD_PATTERNS = [
  "page not found",
  "404",
  "domain for sale",
  "buy this domain",
  "account suspended",
  "site not found"
] as const;
const EXCLUDED_LINK_PATTERNS = [
  "privacy",
  "terms",
  "policy",
  "cookie",
  "legal",
  "login",
  "sign in",
  "sign-in",
  "account",
  "cart",
  "checkout",
  "search",
  "blog",
  "news",
  "press",
  "careers",
  "jobs",
  "sitemap",
  "faq"
] as const;

interface SecondaryLinkCandidate {
  href: string;
  text: string;
  order: number;
}

export interface PageSignals {
  hasPrimaryCta: boolean;
  hasContactPath: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  hasMain: boolean;
  hasH1: boolean;
  hasNav: boolean;
  hasTrustSignal: boolean;
  horizontalOverflow: boolean;
  blockedHint: boolean;
  deadPageHint: boolean;
}

function includesAny(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function looksLikeAddress(value: string): boolean {
  return /\b\d{1,5}\s+[a-z0-9.'-]+\s+(street|st|avenue|ave|road|rd|blvd|boulevard|lane|ln|drive|dr)\b/i.test(
    value
  );
}

function scoreSecondaryLink(currentUrl: URL, candidate: SecondaryLinkCandidate): number {
  let url: URL;

  try {
    url = new URL(candidate.href);
  } catch {
    return -1;
  }

  const normalizedText = candidate.text.toLowerCase();
  const normalizedPath = `${url.pathname} ${url.search}`.toLowerCase();
  const combined = `${normalizedText} ${normalizedPath}`;

  if (url.origin !== currentUrl.origin) {
    return -1;
  }

  if (
    candidate.href.startsWith("mailto:") ||
    candidate.href.startsWith("tel:") ||
    candidate.href.startsWith("javascript:")
  ) {
    return -1;
  }

  if (
    url.pathname === currentUrl.pathname &&
    !url.search &&
    url.hash
  ) {
    return -1;
  }

  if (includesAny(combined, EXCLUDED_LINK_PATTERNS)) {
    return -1;
  }

  let score = 0;

  for (const rule of SECONDARY_PRIORITY_RULES) {
    if (rule.keywords.some((keyword) => combined.includes(keyword))) {
      score += rule.score;
    }
  }

  if (!url.search) {
    score += 4;
  }

  if (!url.hash) {
    score += 4;
  }

  if (url.pathname.split("/").filter(Boolean).length <= 2) {
    score += 6;
  }

  return score;
}

export async function discoverSecondaryTarget(page: Page): Promise<AuditPageTarget | null> {
  const currentUrl = new URL(page.url());

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((anchor, index) => {
        const style = window.getComputedStyle(anchor);
        const rect = anchor.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          !anchor.hidden;

        return {
          href: anchor.href,
          text: [
            anchor.textContent?.trim(),
            anchor.getAttribute("aria-label"),
            anchor.getAttribute("title")
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
          order: index,
          visible
        };
      })
      .filter((entry) => entry.visible)
  );

  const selected = links
    .map((link) => ({
      ...link,
      score: scoreSecondaryLink(currentUrl, link)
    }))
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)[0];

  if (!selected) {
    return null;
  }

  return {
    label: "secondary",
    url: selected.href
  };
}

export async function collectPageSignals(page: Page): Promise<PageSignals> {
  return page.evaluate(
    ({ blockedPatterns, contactKeywords, ctaKeywords, deadPatterns, trustSignalKeywords }) => {
      const visibleBodyText = (document.body?.innerText ?? "").replace(/\s+/g, " ").toLowerCase();
      const clickableText = Array.from(
        document.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a, button")
      )
        .map((element) =>
          [
            element.textContent?.trim(),
            element.getAttribute("aria-label"),
            element.getAttribute("title")
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        )
        .filter(Boolean);
      const sameOriginLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .filter((anchor) => {
          try {
            return new URL(anchor.href).origin === window.location.origin;
          } catch {
            return false;
          }
        })
        .map((anchor) => `${anchor.textContent?.trim() ?? ""} ${anchor.href}`.toLowerCase());
      const hasPhoneLink = Boolean(document.querySelector('a[href^="tel:"]'));
      const hasEmailLink = Boolean(document.querySelector('a[href^="mailto:"]'));

      return {
        hasPrimaryCta: clickableText.some((text) =>
          ctaKeywords.some((keyword) => text.includes(keyword))
        ),
        hasContactPath:
          hasPhoneLink ||
          hasEmailLink ||
          sameOriginLinks.some((text) =>
            contactKeywords.some((keyword) => text.includes(keyword))
          ) ||
          /\b\d{1,5}\s+[a-z0-9.'-]+\s+(street|st|avenue|ave|road|rd|blvd|boulevard|lane|ln|drive|dr)\b/i.test(
            document.body?.innerText ?? ""
          ),
        hasPhoneLink,
        hasEmailLink,
        hasMain: Boolean(document.querySelector("main")),
        hasH1: Boolean(document.querySelector("h1")),
        hasNav: Boolean(document.querySelector("nav")),
        hasTrustSignal:
          hasPhoneLink ||
          hasEmailLink ||
          trustSignalKeywords.some((keyword) => visibleBodyText.includes(keyword)) ||
          /\bmon\b|\btue\b|\bwed\b|\bthu\b|\bfri\b|\bsat\b|\bsun\b/.test(visibleBodyText) ||
          /\b\d{1,5}\s+[a-z0-9.'-]+\s+(street|st|avenue|ave|road|rd|blvd|boulevard|lane|ln|drive|dr)\b/i.test(
            document.body?.innerText ?? ""
          ),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 24,
        blockedHint: blockedPatterns.some((pattern) => visibleBodyText.includes(pattern)),
        deadPageHint: deadPatterns.some((pattern) => visibleBodyText.includes(pattern))
      };
    },
    {
      blockedPatterns: [...BLOCKED_PATTERNS],
      contactKeywords: [...CONTACT_KEYWORDS],
      ctaKeywords: [...CTA_KEYWORDS],
      deadPatterns: [...DEAD_PATTERNS],
      trustSignalKeywords: [...TRUST_SIGNAL_KEYWORDS]
    }
  );
}

export function hasTrustSignalFromNotes(notes: string[]): boolean {
  return notes.some((note) => looksLikeAddress(note));
}
