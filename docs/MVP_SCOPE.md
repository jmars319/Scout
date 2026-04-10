# MVP Scope

## In Scope For v1

- Single query input
- Deterministic query normalization into market intent
- 10 to 15 collected candidates
- Presence typing before heavy audit work
- Retaining non-owned presences as part of the report
- Owned-site audit of:
  homepage
  one deterministic secondary page
  desktop viewport
  mobile viewport
- Deterministic checks for:
  console errors
  failed network requests
  broken navigation
  missing primary CTA
  missing contact path
  accessibility violations via axe
  simple mobile layout issues
  obvious blocked or dead pages
  basic trust-signal weakness where the heuristic is clear
- Screenshot evidence capture
- Business classification
- Market summary and shortlist report
- Postgres-backed storage for structured run data
- Local screenshot evidence storage

## Explicitly Out Of Scope For v1

- Deep crawling
- Login flows
- Outreach automation
- Multi-step campaign systems
- AI-generated discovery
- AI replacing deterministic checks
- Heavy admin or dashboard surfaces
- Queue-first orchestration

## Temporary Seams

- Search provider fallback
  A seeded fallback exists when live search cannot return enough candidates.
- Persistence
  Legacy local JSON runs remain import-compatible through `data/runs`, but Postgres is now the structured source of truth.
- Queueing
  The orchestration seam supports future background execution, but runs are synchronous today.
