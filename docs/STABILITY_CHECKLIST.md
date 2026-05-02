# Stability Checklist

## Baseline Commands

- `pnpm run check:env`
- `pnpm run check:packages`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run db:prepare`
- `pnpm run verify:providers`
- `pnpm run verify:candidates`
- `pnpm run verify:outreach`
- `pnpm run verify:persistence`
- `pnpm run verify:queue`
- `pnpm run verify:http-smoke`
- `pnpm run build:web`
- `pnpm run verify:desktop`
- `pnpm run package:desktop`
- `pnpm run verify:mobile`
- `pnpm run doctor`

## Release-Only Command

- `pnpm run package:desktop:release`

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
- `verify:providers`
  Confirms the live-provider seam classifies success, empty-result pages, provider degradation, parse failure, and manual-confirmation diagnostics deterministically.
- `verify:candidates`
  Confirms completed reports can accept a manual candidate, promote a saved discarded result, rerun candidate evaluation, rebuild summaries, and clean up verification evidence.
- `verify:outreach`
  Confirms Scout can persist a local outreach draft against a completed run and retrieve it back through the outreach workspace seam.
- `verify:persistence`
  Confirms Postgres connectivity, schema readiness, run write/read behavior, and recent-run retrieval.
- `verify:queue`
  Confirms queued run creation, worker claim behavior, lifecycle transitions, and failure-note persistence.
- `verify:http-smoke`
  Confirms the real HTTP submit and retrieval path: the web server returns a queued response promptly, a worker picks the run up, lifecycle state moves through `queued -> running -> completed`, and the final persisted report is retrievable from the real API.
- `build:web`
  Confirms the active Next.js app builds successfully.
- `verify:desktop`
  Confirms the desktop package typechecks and that Electron can launch Scout's desktop runtime entrypoint.
- `package:desktop`
  Confirms Scout can build a local macOS desktop package with a bundled production web runtime, bundled worker entrypoint, and bundled Chromium assets.
- `package:desktop:release`
  Confirms the release environment has Developer ID signing and Apple notarization credentials before building. This command is expected to fail on machines that are only configured for local ad-hoc packages.
- `verify:mobile`
  Confirms the remaining mobile scaffold does not break workspace integrity.
- `doctor`
  Prints Node version, checks env and package map, and confirms Playwright CLI availability in the web app.

## Practical Smoke Coverage

The repo has been exercised with:

- a Postgres round-trip verification run
- a bulk import of one legacy local JSON run into Postgres
- an existing live end-to-end run with screenshots still present in root `data/evidence`

That coverage verifies schema bootstrap, repository persistence, legacy-import handling, screenshot storage, and report retrieval path.
That coverage also verifies the Postgres-backed queue loop and repository-driven lifecycle updates.
`verify:http-smoke` adds a real HTTP boundary check without introducing a larger end-to-end framework.
`verify:providers` adds direct protection for the hardened DuckDuckGo, Google, and Bing adapters plus manual-confirmation diagnostics without introducing a heavier test harness.

## Expected Limitations

- Live search stability still depends on upstream HTML providers.
- Run execution depends on a separate local worker process being started.
- The queue is intentionally simple and Postgres-backed, not a distributed job system.
- The desktop app is a thin Electron wrapper over the local web app and worker, not a second independent runtime architecture.
- The packaged desktop build still depends on `DATABASE_URL`; it is not a fully self-contained local-database app.
- Screenshot evidence is still local-only.
