# Repo Map

## Apps

- `apps/webapp`
  The active Next.js product surface. Owns the server-side search provider, Playwright audit implementation, local evidence storage, and run APIs.
- `apps/desktopapp`
  Active Electron shell that boots the local web app plus worker in development and can also be packaged into a macOS `.app`/`.dmg` without forking product logic.
- `apps/mobileapp`
  Scaffold-only app for future expansion. It typechecks and verifies, but does not expose a runtime surface yet.

## Shared Packages

- `packages/domain`
  Scout product truth. Defines query intent, candidates, presence types, findings, classifications, reports, and the `runScout` orchestration seam.
- `packages/validation`
  Zod schemas for query input, candidates, findings, and report payloads.
- `packages/api-contracts`
  Request and response contracts for Scout run creation and report retrieval.
- `packages/config`
  App constants, Scout limits, viewport presets, and environment helpers.
- `packages/privacy`
  Evidence naming and URL path helpers.
- `packages/geo`
  Narrow location parsing and normalization helpers used during query resolution.
- `packages/ui`
  Shared React presentation primitives used by the web app.
- `packages/shared-types`
  Low-level shared type helpers.
- `packages/auth`
  Inactive future seam for auth.
- `packages/realtime`
  Inactive future seam for queue and live updates.

## Root Folders

- `scripts`
  JAMARQ-style bootstrap, doctor, env, and package verification scripts.
- `docs`
  Product, repo, stability, and developer documentation.
- `archive`
  Reserved for retired experiments and superseded work.
- `data/runs`
  Legacy local run files kept only for explicit Postgres import and compatibility reads.
- `data/evidence`
  Screenshot evidence written by the local storage driver.

## Webapp Internals

- `src/app`
  App Router pages and API routes.
- `src/components`
  Thin UI components for run submission and report rendering.
- `src/lib/server/search`
  Search provider seam, live DuckDuckGo HTML implementation, seeded fallback, and presence detection.
- `src/lib/server/audit`
  Playwright audit implementation and page heuristics.
- `src/lib/server/storage`
  Postgres run repository, legacy local-run compatibility/import helpers, and local evidence storage implementation.
- `src/lib/server/report`
  Failure-report helper for partial or failed runs.
- `src/scripts`
  Reserved for app-local scripts if the web surface needs them later.
