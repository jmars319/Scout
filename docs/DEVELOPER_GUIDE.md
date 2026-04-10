# Developer Guide

## Toolchain

- Node `22.21.1`
- pnpm workspace
- TypeScript `5.9.x`
- Next.js `16`
- React `19`
- Playwright plus `@axe-core/playwright`

## First Run

1. Run `pnpm run bootstrap`.
2. Set `DATABASE_URL` in `.env` or your shell.
3. Run `pnpm run db:prepare`.
4. If you have older local run files in `data/runs`, run `pnpm run db:import:local-runs`.
5. Start the product with `pnpm run dev:web`.
6. Start the worker with `pnpm run dev:worker`.
7. Open `http://localhost:3000`.

`pnpm run dev:all` starts the web app and worker together in one local shell session.

`bootstrap` installs workspace dependencies, ensures local data directories exist, and installs the Chromium browser used by Playwright.

## How A Scout Run Works

1. The homepage posts `rawQuery` to `POST /api/scout/run`.
2. `apps/webapp/src/lib/server/scout-runner.ts` validates input, resolves market intent, creates a Postgres-backed `queued` run record, and returns the run id promptly.
3. `apps/webapp/src/lib/server/worker/scout-worker.ts` polls Postgres, claims queued runs, moves them to `running`, and executes the real Scout pipeline.
4. `packages/domain` resolves market intent, requests candidates, types presence, audits owned sites, classifies businesses, and builds the report.
5. The webapp server layer supplies the real dependencies:
   search provider, presence detector, Playwright auditor, Postgres run repository, local evidence storage.
6. The worker writes lifecycle state through the repository:
   `queued -> running -> completed|failed`
7. The completed or failed run record is upserted into Postgres with the explicit persisted shape.
8. Screenshot evidence is saved under `data/evidence/<runId>/...`.
9. The run page reads the saved report through the repository and renders either a status view or the final report.

## Search Behavior

- Default provider: DuckDuckGo HTML scrape.
- Fallback provider: seeded deterministic catalog.
- Query acquisition uses a very small deterministic variant set:
  raw query
  normalized market plus location form
  singularized variant only when it is safely derivable
- URLs are canonicalized before final candidate selection.
- Candidates are deduplicated before presence typing and audit.
- Domain logic never hardcodes a Google-specific assumption.

If live acquisition is weak, partial, or fallback-heavy, Scout records that in acquisition diagnostics and sample-quality notes.

## Audit Behavior

- Audit eligibility is limited to presences typed as `owned_website`.
- Presence typing uses deterministic rules over search-result URLs, redirected destinations, and simple destination-state checks to reduce false owned-site matches.
- Each eligible site gets:
  homepage audit
  one deterministic secondary-page audit if discovered
  desktop and mobile passes
- Secondary-page selection is ranked from obvious same-origin business links such as contact, services, menu, booking, locations, and about.
- Findings are normalized into stable issue types:
  console errors
  failed requests
  broken navigation
  missing primary CTA
  missing contact path
  accessibility issues
  tap target issues
  mobile layout issues
  blocked content
  dead page
  weak trust signal
- Severity and confidence are assigned during normalization instead of directly from raw browser events.

## Storage

- Runs: Postgres-backed persisted records in `scout_runs`
- Evidence: local screenshots in `data/evidence`
- Legacy local runs: import/read compatibility source in `data/runs`

Run storage and evidence storage both live behind explicit adapters. The worker and the web app both write through the same repository seam.

## Worker Model

- Queue storage: Postgres `scout_runs` rows with lifecycle timestamps and attempt metadata
- Worker command: `pnpm run dev:worker` or `pnpm run worker:start`
- Combined local start: `pnpm run dev:all`
- Poll configuration:
  `SCOUT_WORKER_POLL_MS`
  `SCOUT_WORKER_STALE_RUN_MS`
- If a worker attempt stalls past the stale-run threshold, the row is re-queued on the next worker loop with a short worker note.

## Verification

- `pnpm run verify:acquisition`
  Runs a small deterministic check over canonicalization, query variants, deduplication, and fallback diagnostics.
- `pnpm run verify:persistence`
  Applies the schema, creates a queued run record, saves a completed run record, reads it back, checks recent-run retrieval, and deletes the verification row.
- `pnpm run verify:queue`
  Applies the schema, creates queued runs, verifies worker claim behavior, verifies completed and failed lifecycle transitions, and deletes the verification rows.
- `pnpm run verify:web`
  Runs lint, typecheck, acquisition verification, persistence verification, queue verification, and the web build.

## Inactive App Surfaces

- `pnpm run dev:desktop`
  Prints a stable scaffold message and exits.
- `pnpm run dev:mobile`
  Prints a stable scaffold message and exits.

These apps are intentionally not activated in v1.
