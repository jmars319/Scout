# Scout

Scout by JAMARQ is a search-seeded market scanner that identifies, audits, and classifies business web presence to surface actionable opportunities.

Scout is not a crawler, an SEO suite, or an AI-first app. The v1 product shape is intentionally narrow: input, run, report.

## Current MVP State

- `apps/webapp` is the active product surface.
- `apps/desktopapp` is scaffold-only for a future operator shell.
- `apps/mobileapp` is scaffold-only for future expansion.
- Search uses a narrow provider seam with a hardened DuckDuckGo HTML adapter and an honest seeded fallback path.
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
- `pnpm run dev:web`
- `pnpm run dev:worker`
- `pnpm run dev:all`
- `pnpm run dev:desktop`
- `pnpm run dev:mobile`
- `pnpm run dev:both`
- `pnpm run worker:start`
- `pnpm run build:web`
- `pnpm run build:desktop`
- `pnpm run build:mobile`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run verify:acquisition`
- `pnpm run verify:providers`
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

## Live Acquisition

- Default live path: DuckDuckGo HTML.
- Seeded fallback path: deterministic catalog used only when live acquisition is disabled or too weak to hit Scout’s minimum sample threshold.
- Acquisition diagnostics now record provider attempts, source contribution counts, fallback triggers, and caution notes so the operator can see whether a run was mostly live, partially fallback-assisted, or effectively non-live.
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
- No second live search provider yet.
- Screenshot evidence is still local-only.
- The background worker currently uses a simple Postgres-backed queue loop.
- Live acquisition can still degrade when DuckDuckGo HTML changes or blocks requests, but Scout now records that degradation more explicitly before falling back.
- No outreach or campaign system.
- No AI-generated discovery.

See [docs/PRODUCT_OVERVIEW.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/PRODUCT_OVERVIEW.md), [docs/MVP_SCOPE.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/MVP_SCOPE.md), and [docs/DEVELOPER_GUIDE.md](/Users/jason_marshall/JAMARQ/Side Projects/Scout/docs/DEVELOPER_GUIDE.md) for the actual implementation details.
