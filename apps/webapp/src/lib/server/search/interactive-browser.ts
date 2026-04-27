import { mkdir } from "node:fs/promises";

import { chromium, type BrowserContext, type Page } from "playwright";

import type { InteractiveSearchConfig } from "@scout/config";

import type { ProviderSearchResponse } from "./provider-types.ts";

const NAVIGATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const INTERACTIVE_CONTENT_TIMEOUT_MS = 4_000;

interface InteractiveBrowserSearchInput {
  providerName: string;
  query: string;
  limit: number;
  searchUrl: string;
  parsePage: (html: string, limit: number) => ProviderSearchResponse;
  onProgress?: (workerNote: string) => Promise<void> | void;
}

export interface InteractiveBrowserSearchSession {
  search: (input: InteractiveBrowserSearchInput) => Promise<ProviderSearchResponse>;
  dispose: () => Promise<void>;
}

function mergeDetail(detail: string | undefined, suffix: string): string {
  return detail ? `${detail} ${suffix}` : suffix;
}

async function getOrCreatePage(context: BrowserContext): Promise<Page> {
  const [existing] = context.pages();

  if (existing) {
    return existing;
  }

  return context.newPage();
}

async function closePage(page: Page): Promise<void> {
  if (page.isClosed()) {
    return;
  }

  await page.close().catch(() => {});
}

function describeNavigationFailure(providerName: string, error: unknown): ProviderSearchResponse {
  if (error instanceof Error) {
    return {
      outcome: "network_error",
      candidates: [],
      detail: `${providerName} browser session could not load the search page: ${error.message}`
    };
  }

  return {
    outcome: "network_error",
    candidates: [],
    detail: `${providerName} browser session could not load the search page.`
  };
}

function describeContentReadFailure(providerName: string, error: unknown): ProviderSearchResponse {
  if (error instanceof Error) {
    return {
      outcome: "parse_error",
      candidates: [],
      detail: `${providerName} browser session could not read the current page: ${error.message}`
    };
  }

  return {
    outcome: "parse_error",
    candidates: [],
    detail: `${providerName} browser session could not read the current page.`
  };
}

function isTransientPageReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("page is navigating and changing the content") ||
    message.includes("execution context was destroyed") ||
    message.includes("most likely because of a navigation")
  );
}

async function readCurrentPageHtml(page: Page): Promise<string | null> {
  await page
    .waitForLoadState("domcontentloaded", { timeout: INTERACTIVE_CONTENT_TIMEOUT_MS })
    .catch(() => {});

  try {
    return await page.content();
  } catch (error) {
    if (isTransientPageReadError(error)) {
      return null;
    }

    throw error;
  }
}

export function createInteractiveBrowserSearchSession(
  config: InteractiveSearchConfig
): InteractiveBrowserSearchSession {
  let contextPromise: Promise<BrowserContext> | null = null;

  async function getContext(): Promise<BrowserContext> {
    if (!config.profileDir) {
      throw new Error("SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR is required when interactive search is enabled.");
    }

    if (!contextPromise) {
      await mkdir(config.profileDir, { recursive: true });
      contextPromise = chromium.launchPersistentContext(config.profileDir, {
        headless: false,
        viewport: {
          width: 1280,
          height: 900
        },
        locale: "en-US"
      });
    }

    return contextPromise;
  }

  return {
    async search(input) {
      const context = await getContext();
      const page = await getOrCreatePage(context);
      try {
        try {
          await page.goto(input.searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT_MS
          });
        } catch (error) {
          return describeNavigationFailure(input.providerName, error);
        }

        await page.bringToFront().catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});

        const deadline = Date.now() + config.timeoutMs;
        let manualConfirmationNeeded = false;
        let lastResponse: ProviderSearchResponse | null = null;
        let lastProgressNote = "";
        let lastProgressAt = 0;

        const publishProgress = async (workerNote: string) => {
          const now = Date.now();
          if (workerNote === lastProgressNote && now - lastProgressAt < 4_000) {
            return;
          }

          lastProgressNote = workerNote;
          lastProgressAt = now;
          await input.onProgress?.(workerNote);
        };

        while (Date.now() < deadline) {
          let html: string | null;

          try {
            html = await readCurrentPageHtml(page);
          } catch (error) {
            return describeContentReadFailure(input.providerName, error);
          }

          if (!html) {
            await publishProgress(
              manualConfirmationNeeded
                ? `Waiting for ${input.providerName} human confirmation in the browser window.`
                : `Waiting for ${input.providerName} browser-backed results to settle.`
            );
            await page.waitForTimeout(POLL_INTERVAL_MS);
            continue;
          }

          const response = input.parsePage(html, input.limit);
          lastResponse = response;

          if (response.outcome === "success" || response.outcome === "empty") {
            if (manualConfirmationNeeded) {
              return {
                ...response,
                detail: mergeDetail(
                  response.detail,
                  "Scout continued through an in-browser session after manual human confirmation."
                )
              };
            }

            return {
              ...response,
              detail: mergeDetail(
                response.detail,
                "Scout gathered these results through a browser-backed live search session."
              )
            };
          }

          if (response.outcome === "blocked") {
            manualConfirmationNeeded = true;
            await publishProgress(
              `Waiting for ${input.providerName} human confirmation in the browser window.`
            );
          } else if (response.outcome === "parse_error") {
            await publishProgress(
              `Waiting for ${input.providerName} browser-backed results to settle.`
            );
          }

          await page.waitForTimeout(POLL_INTERVAL_MS);
        }

        if (manualConfirmationNeeded) {
          return {
            outcome: "blocked",
            candidates: [],
            detail: `${input.providerName} required manual human confirmation in the browser, but the challenge was not completed before timeout.`
          };
        }

        return {
          outcome: lastResponse?.outcome === "empty" ? "empty" : "parse_error",
          candidates: [],
          detail:
            lastResponse?.detail ??
            `${input.providerName} browser session did not produce a usable result page before timeout.`
        };
      } finally {
        await closePage(page);
      }
    },

    async dispose() {
      if (!contextPromise) {
        return;
      }

      const context = await contextPromise;
      contextPromise = null;
      await context.close();
    }
  };
}
