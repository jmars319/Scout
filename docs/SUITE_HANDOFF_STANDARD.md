# Suite Handoff Standard

Generated from `tenra Registry/contracts/handoff-catalog.json` by `tenra Registry/scripts/generate-suite-contract-docs.mjs`.

## App Role

lead discovery and opportunity source

keep unique; other apps should consume Scout opportunities, while Scout can use Proxy and Guardrail as reusable services.

## Accepted Inputs

- No accepted suite contract is registered yet.

## Emitted Outputs

- `tenra-scout.opportunity-handoff.v1` to tenra Assembly, tenra Proxy, tenra Guardrail

## Standard Controls

- schema badge
- destination presets
- preview payload
- send or export
- history

## Status Vocabulary

- `draft`: Payload or route exists locally but has not been previewed.
- `previewed`: Payload was built and inspected without delivery.
- `queued`: Delivery is waiting for an endpoint, retry, or operator action.
- `sent`: Producer posted or exported the payload successfully.
- `accepted`: Consumer parsed and retained the payload.
- `rejected`: Consumer refused the payload for schema, routing, safety, or policy reasons.
- `failed`: Delivery failed before acceptance or rejection was known.
- `replayed`: Registry or a producer regenerated a prior payload for another delivery attempt.
- `received`: Consumer acknowledged receipt back to the source app.
- `dismissed`: Operator intentionally removed an item from an inbox, queue, or retry list.

## Local Storage

Prefix: `tenra.scout`

- `tenra.scout.handoffEndpoints.v1`
- `tenra.scout.outboundHistory.v1`

## Endpoints

- GET `/api/handoffs/opportunity/[runId]/[candidateId]` - Opportunity payload
- POST `/api/handoffs/deliver/[runId]/[candidateId]` - Direct delivery
- GET `/api/handoffs/health` - Handoff health
