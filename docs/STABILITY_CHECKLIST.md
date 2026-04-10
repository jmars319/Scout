# Stability Checklist

## Baseline Commands

- `pnpm run check:env`
- `pnpm run check:packages`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run db:prepare`
- `pnpm run verify:persistence`
- `pnpm run verify:queue`
- `pnpm run build:web`
- `pnpm run verify:desktop`
- `pnpm run verify:mobile`
- `pnpm run doctor`

## What They Guarantee

- `check:env`
  Confirms Scout’s current env shape is valid for the implemented v1 slice.
- `check:packages`
  Confirms the expected workspace package map is present.
- `lint`
  Catches workspace-wide code issues.
- `typecheck`
  Validates the shared packages and all three app surfaces.
- `db:prepare`
  Applies the explicit `scout_runs` schema, including queue lifecycle columns, to the configured Postgres database.
- `verify:persistence`
  Confirms Postgres connectivity, schema readiness, run write/read behavior, and recent-run retrieval.
- `verify:queue`
  Confirms queued run creation, worker claim behavior, lifecycle transitions, and failure-note persistence.
- `build:web`
  Confirms the active Next.js app builds successfully.
- `verify:desktop` and `verify:mobile`
  Confirm the inactive app scaffolds do not break workspace integrity.
- `doctor`
  Prints Node version, checks env and package map, and confirms Playwright CLI availability in the web app.

## Practical Smoke Coverage

The repo has been exercised with:

- a Postgres round-trip verification run
- a bulk import of one legacy local JSON run into Postgres
- an existing seeded end-to-end run with screenshots still present in root `data/evidence`

That coverage verifies schema bootstrap, repository persistence, legacy-import handling, screenshot storage, and report retrieval path.
That coverage also verifies the Postgres-backed queue loop and repository-driven lifecycle updates.

## Expected Limitations

- Live search stability depends on the HTML structure of DuckDuckGo.
- Run execution depends on a separate local worker process being started.
- The queue is intentionally simple and Postgres-backed, not a distributed job system.
- Screenshot evidence is still local-only.
