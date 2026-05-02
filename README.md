# Scout

Scout by JAMARQ is a live-search market scanner that identifies, audits, and classifies business web presence to surface actionable opportunities.

Scout is not a crawler, an SEO suite, or an AI-first app. The v1 product shape is intentionally narrow: input, run, report.

## Current MVP State

- `apps/webapp` is the shared local UI/runtime layer used by the desktop app.
- `apps/desktopapp` is now the primary product surface. It wraps the local web app and worker in a native desktop window.
- `apps/mobileapp` is scaffold-only for future expansion.
- Search uses a narrow provider seam with hardened DuckDuckGo HTML, Google Search, and Bing HTML adapters. Live runs no longer backfill seeded candidates.
- Completed runs can now save local outreach packs for shortlisted businesses, including contact-path recommendations, email drafts, short-form versions, and phone talking points, with optional OpenAI assistance grounded on stored Scout evidence.
- Presence typing uses deterministic URL, domain, redirect, and basic destination-state rules before audit.
- Acquisition now canonicalizes URLs, deduplicates across light query variants, and records sample-quality diagnostics.
- Runs are stored in Postgres through an explicit repository layer.
- Run execution is queued in Postgres and processed by a dedicated worker process.
- Existing local JSON runs in `data/runs` are treated as legacy import sources only.
- Screenshot evidence is stored locally in `data/evidence`.
- Audits are deterministic and use Playwright plus `@axe-core/playwright`.
- Reports now distinguish audited vs skipped candidates, show confidence more clearly, and rank shortlist items with operator-facing reasons.
- The homepage now shows recent Postgres-backed runs without adding a new dashboard surface.

## Monorepo Layout

```text
scout/
  apps/
    webapp/
    desktopapp/
    mobileapp/
  packages/
    shared-types/
    domain/
    api-contracts/
    validation/
    realtime/
    auth/
    geo/
    privacy/
    ui/
    config/
  scripts/
  docs/
  archive/
  data/
```

## Commands

- `pnpm run bootstrap`
- `pnpm run db:prepare`
- `pnpm run db:import:local-runs`
- `pnpm run check:env`
- `pnpm run check:packages`
- `pnpm run clean:local`
- `pnpm run clean:local:full`
- `pnpm run dev:web`
- `pnpm run dev:worker`
- `pnpm run dev:all`
- `pnpm run dev:desktop`
- `pnpm run start:desktop`
- `pnpm run launch:desktop`
- `pnpm run install:desktop`
- `pnpm run dev:mobile`
- `pnpm run dev:both`
- `pnpm run worker:start`
- `pnpm run build:web`
- `pnpm run build:desktop`
- `pnpm run build:mobile`
- `pnpm run package:desktop`
- `pnpm run package:desktop:release`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run verify:acquisition`
- `pnpm run verify:providers`
- `pnpm run verify:outreach`
- `pnpm run verify:persistence`
- `pnpm run verify:queue`
- `pnpm run verify:http-smoke`
- `pnpm run verify:web`
- `pnpm run verify:desktop`
- `pnpm run verify:mobile`
- `pnpm run verify:all`
- `pnpm run doctor`

## What The Web App Does

1. Accepts a single market query.
2. Resolves a deterministic market intent.
3. Persists a queued run record in Postgres and returns immediately.
4. Lets a dedicated worker process execute acquisition, presence typing, audit, and report assembly in the background.
5. Collects 10 to 15 candidate presences across a very small set of deterministic query variants.
6. Types each presence before any heavy audit work.
7. Audits eligible owned websites across desktop and mobile with a scored secondary-page selector.
8. Normalizes findings into stable issue types with severity, confidence, reproduction notes, and evidence.
9. Stores structured run data in Postgres and screenshot evidence locally.
10. Renders the market summary, acquisition diagnostics, business breakdowns, common issues, and shortlist.

## Desktop App

- `pnpm run dev:desktop`
  Starts a local Next.js dev server, starts the queued worker, and opens Scout in an Electron window on an isolated local port.
- `pnpm run start:desktop`
  Opens the same Electron shell against a production Next.js server started locally with `next start`.
- `pnpm run verify:desktop`
  Confirms the desktop package typechecks and that Electron can launch Scout's desktop runtime entrypoint.
- `pnpm run package:desktop`
  Builds a local macOS desktop package under `dist/desktop`, including an unpacked `.app`, a `.zip`, and a `.dmg`. Without Apple signing credentials, this uses ad-hoc signing and skips notarization.
- `pnpm run package:desktop:release`
  Requires Developer ID signing plus Apple notarization credentials, then builds the same macOS artifacts for release distribution. Supported notarization credential sets are `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, or `APPLE_KEYCHAIN_PROFILE`.
- `pnpm run install:desktop`
  Builds the packaged macOS app, installs it into `~/Applications/Scout by JAMARQ.app`, seeds `~/Library/Application Support/Scout by JAMARQ/.env` if needed, and opens Scout like a normal Mac app.
- `pnpm run launch:desktop`
  Opens the installed Scout app from `~/Applications` when present, otherwise falls back to the packaged build under `dist/desktop`.
- Desktop startup automatically prunes cache-heavy folders inside the interactive-search Chromium profile at most once per 24 hours. That keeps `.local` from growing indefinitely without throwing away the session state that helps DuckDuckGo and Google confirmation windows stay useful.
- `pnpm run clean:local`
  Prunes only the interactive-search browser caches under repo `.local`.
- `pnpm run clean:local:full`
  Removes the interactive-search profile, the desktop cleanup marker, and local screenshot evidence. Postgres run history is not deleted.
- The desktop app does not fork the product into a second surface. It wraps the same repository-backed web flow:
  input, queued run, worker execution, report.
- Completed report views now include a local outreach workspace for shortlist targets. Scout can inspect contact paths, recommend the best first channel, generate email plus short-form plus phone-ready copy, and save everything locally, but it still does not send outreach automatically.
- The packaged macOS app runs its own bundled `next start` server, bundled worker runtime, and bundled Chromium for audits.
- Desktop mode enables manual in-browser confirmation only for DuckDuckGo. If DuckDuckGo serves a human-check page, Scout can open a local browser-backed search window and continue after the operator clears it. Google is treated as fetch-only and simply degrades if it serves a challenge flow.
- The packaged app still needs `DATABASE_URL`, but Scout now auto-creates `~/Library/Application Support/Scout by JAMARQ/.env` on first packaged launch with `DATABASE_URL=postgresql:///scout` as the local default.
- Public macOS distribution should use `pnpm run package:desktop:release`, which fails before packaging if Developer ID signing or notarization credentials are missing.
- If you prefer a one-step local install instead of opening bundles from `dist/desktop`, use `pnpm run install:desktop` once and then launch Scout from Spotlight, Launchpad, Finder, or the Dock like a normal Mac app.

## Live Acquisition

- Default live path: DuckDuckGo HTML plus Google Search and Bing HTML as additional live providers on the same narrow seam.
- Live runs now either keep real live candidates or fail honestly when acquisition returns nothing usable.
- Acquisition diagnostics record provider attempts, source contribution counts, degradation reasons, and caution notes so the operator can see what happened upstream before a run completed or failed.
- In desktop mode, DuckDuckGo can open a real browser-backed challenge window so the operator can confirm the search was human and let Scout continue without synthetic fallback. Google does not use that path.
- Scout still keeps the provider layer intentionally narrow. There is no large multi-vendor search framework here.

## HTTP Smoke Verification

- `pnpm run verify:http-smoke`
  Starts a temporary local web server and one-shot worker on an isolated port, submits a real HTTP run, confirms the queued response, waits for `queued -> running -> completed`, fetches the final report from the real API, and cleans up the verification row plus local evidence.
- The smoke verifier uses `SCOUT_SEARCH_PROVIDER=seeded_stub` and smaller candidate limits so it proves the real HTTP lifecycle without depending on DuckDuckGo HTML stability.
- It proves submission, queue persistence, worker pickup, lifecycle transitions, and final report retrieval.
- It does not try to prove live provider stability or broad UI coverage.

## Known Boundaries

- No deep crawl.
- No authentication flow.
- No Redis, BullMQ, or separate cloud worker system.
- The desktop app is a thin local shell over the existing web app and worker, not a separate native feature set.
- Local desktop packages are ad-hoc signed by default. Notarized release packages require Apple Developer credentials through `pnpm run package:desktop:release`.
- Screenshot evidence is still local-only.
- The background worker currently uses a simple Postgres-backed queue loop.
- Live acquisition can still degrade when DuckDuckGo HTML, Google Search, or Bing HTML change or block requests, but Scout now records that degradation and fails without substituting seeded market results.
- No outreach automation or campaign system.
- No AI-generated discovery.

See [docs/PRODUCT_OVERVIEW.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/PRODUCT_OVERVIEW.md), [docs/MVP_SCOPE.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/MVP_SCOPE.md), and [docs/DEVELOPER_GUIDE.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/DEVELOPER_GUIDE.md) for the actual implementation details.
