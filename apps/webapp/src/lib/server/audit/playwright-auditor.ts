import AxeBuilder from "@axe-core/playwright";
import { VIEWPORT_PRESETS } from "@scout/config";
import type {
  AuditFinding,
  PresenceAuditResult,
  PresenceRecord,
  ResolvedMarketIntent
} from "@scout/domain";
import { buildEvidenceRelativePath } from "@scout/privacy";
import type { Browser, Page, Response } from "playwright";

import type { EvidenceStorage, StoredEvidence } from "../storage/evidence-storage.ts";
import {
  type AxeViolationObservation,
  type ConsoleObservation,
  type FailedRequestObservation,
  normalizeAxeFindings,
  normalizeConsoleFindings,
  normalizeFailedRequestFindings,
  normalizeNavigationFailure,
  normalizePageState,
  normalizeSignalFindings
} from "./finding-normalizer.ts";
import { collectPageSignals, discoverSecondaryTarget, type PageSignals } from "./page-helpers.ts";

interface PlaywrightAuditorOptions {
  browser: Browser;
  evidenceStorage: EvidenceStorage;
  runId: string;
}

interface BrowserObservation {
  consoleErrors: ConsoleObservation[];
  failedRequests: FailedRequestObservation[];
}

const SAFE_DEFAULT_SIGNALS: PageSignals = {
  hasPrimaryCta: true,
  hasContactPath: true,
  hasPhoneLink: false,
  hasEmailLink: false,
  hasMain: true,
  hasH1: true,
  hasNav: true,
  hasTrustSignal: true,
  horizontalOverflow: false,
  blockedHint: false,
  deadPageHint: false
};

async function captureScreenshot(
  page: Page,
  storage: EvidenceStorage,
  runId: string,
  candidateId: string,
  pageLabel: "homepage" | "secondary",
  viewport: "desktop" | "mobile"
): Promise<StoredEvidence | null> {
  try {
    const buffer = await page.screenshot({ fullPage: true, type: "png" });
    const relativePath = buildEvidenceRelativePath({
      runId,
      candidateId,
      pageLabel,
      viewport
    });

    return storage.saveScreenshot(relativePath, buffer);
  } catch {
    return null;
  }
}

function collectObservations(page: Page): BrowserObservation {
  const consoleErrors: ConsoleObservation[] = [];
  const failedRequests: FailedRequestObservation[] = [];
  const seenFailedRequests = new Set<string>();

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const location = message.location();
    consoleErrors.push({
      text: message.text(),
      location: location.url
        ? `${location.url}:${location.lineNumber}:${location.columnNumber}`
        : undefined
    });
  });

  page.on("requestfailed", (request) => {
    const failureText = request.failure()?.errorText;
    const key = `${request.method()}-${request.url()}-${failureText ?? "requestfailed"}`;

    if (seenFailedRequests.has(key)) {
      return;
    }

    seenFailedRequests.add(key);
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      failureText
    });
  });

  page.on("response", (response) => {
    if (response.status() < 400) {
      return;
    }

    const key = `${response.request().method()}-${response.url()}-${response.status()}`;
    if (seenFailedRequests.has(key)) {
      return;
    }

    seenFailedRequests.add(key);
    failedRequests.push({
      method: response.request().method(),
      url: response.url(),
      resourceType: response.request().resourceType(),
      status: response.status()
    });
  });

  return {
    consoleErrors,
    failedRequests
  };
}

async function discoverTargets(browser: Browser, primaryUrl: string) {
  const context = await browser.newContext({
    viewport: {
      width: VIEWPORT_PRESETS.desktop.width,
      height: VIEWPORT_PRESETS.desktop.height
    }
  });
  const page = await context.newPage();

  try {
    await page.goto(primaryUrl, { waitUntil: "domcontentloaded", timeout: 18_000 });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => null);
    const homepageUrl = page.url();
    const homepageTarget = { label: "homepage", url: homepageUrl } as const;
    const secondaryTarget = await discoverSecondaryTarget(page);

    await context.close();

    return secondaryTarget && secondaryTarget.url !== homepageUrl
      ? [homepageTarget, secondaryTarget]
      : [homepageTarget];
  } catch {
    await context.close();
    return [{ label: "homepage", url: primaryUrl }] as const;
  }
}

function toAxeViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]
): AxeViolationObservation[] {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length
  }));
}

async function collectSignals(page: Page, notes: string[], targetUrl: string): Promise<PageSignals> {
  try {
    return await collectPageSignals(page);
  } catch (error) {
    notes.push(
      `Signal collection failed for ${targetUrl}: ${
        error instanceof Error ? error.message : "Unknown signal error."
      }`
    );
    return SAFE_DEFAULT_SIGNALS;
  }
}

export function createPlaywrightAuditor({
  browser,
  evidenceStorage,
  runId
}: PlaywrightAuditorOptions) {
  return {
    async auditPresence(
      presence: PresenceRecord,
      _intent: ResolvedMarketIntent
    ): Promise<PresenceAuditResult> {
      void _intent;
      const targets = await discoverTargets(browser, presence.primaryUrl);
      const findings: AuditFinding[] = [];
      const notes: string[] = [];

      if (targets.length === 1) {
        notes.push("No deterministic secondary page was selected from the homepage.");
      } else {
        notes.push(`Secondary page selected for audit: ${targets[1]?.url}`);
      }

      for (const viewport of Object.values(VIEWPORT_PRESETS)) {
        const context = await browser.newContext({
          viewport: {
            width: viewport.width,
            height: viewport.height
          }
        });

        for (const target of targets) {
          const page = await context.newPage();
          const observations = collectObservations(page);
          let response: Response | null = null;

          try {
            try {
              response = await page.goto(target.url, {
                waitUntil: "domcontentloaded",
                timeout: 20_000
              });
              await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => null);
            } catch (error) {
              findings.push(
                normalizeNavigationFailure(
                  {
                    candidateId: presence.candidateId,
                    pageUrl: target.url,
                    pageLabel: target.label,
                    viewport: viewport.kind
                  },
                  error instanceof Error ? error : "Unknown navigation failure."
                )
              );
              continue;
            }

            const screenshot = await captureScreenshot(
              page,
              evidenceStorage,
              runId,
              presence.candidateId,
              target.label,
              viewport.kind
            );
            const pageUrl = page.url();
            const findingContext = {
              candidateId: presence.candidateId,
              pageUrl,
              pageLabel: target.label,
              viewport: viewport.kind,
              screenshot
            } as const;
            const signals = await collectSignals(page, notes, target.url);
            const pageStateFinding = normalizePageState(findingContext, {
              responseStatus: response?.status() ?? null,
              signals
            });

            if (pageStateFinding) {
              findings.push(pageStateFinding);
              continue;
            }

            findings.push(...normalizeSignalFindings(findingContext, signals));
            findings.push(...normalizeConsoleFindings(findingContext, observations.consoleErrors));
            findings.push(
              ...normalizeFailedRequestFindings(findingContext, observations.failedRequests)
            );

            try {
              const axeResult = await new AxeBuilder({ page }).analyze();
              findings.push(...normalizeAxeFindings(findingContext, toAxeViolations(axeResult.violations)));
            } catch (error) {
              notes.push(
                `Accessibility audit failed for ${pageUrl} (${viewport.kind}): ${
                  error instanceof Error ? error.message : "Unknown axe failure."
                }`
              );
            }
          } finally {
            await page.close();
          }
        }

        await context.close();
      }

      return {
        candidateId: presence.candidateId,
        targets: [...targets],
        findings,
        notes
      };
    }
  };
}
