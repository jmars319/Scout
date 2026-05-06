import fs from "node:fs";
import path from "node:path";

const contracts = [
  ["tenra-registry.ledger-export.v1", "Registry", "Ledger"],
  ["tenra-registry.assembly-document-request.v1", "Registry", "Assembly"],
  ["tenra-assembly.proxy-notice-handoff.v1", "Assembly", "Proxy"],
  ["tenra-scout.opportunity-handoff.v1", "Scout", "Assembly, Proxy"],
  ["tenra-align.alignment-snapshot.v1", "Align", "Suite review surfaces"],
  ["tenra-align.review-reply-route.v1", "Align", "Guardrail, Proxy"],
  ["tenra-partition.lab-validation-request.v1", "Partition", "Lab validation, Guardrail review"],
  ["tenra-partition.lab-validation-result.v1", "Partition", "Lab validation, Guardrail review"],
  ["tenra-guardrail.external-action-review.v1", "Source apps", "Guardrail"],
  ["tenra-guardrail.external-action-decision.v1", "Guardrail", "Source apps"],
  ["Proxy shape request and preset request", "Proxy", "Scout, Guardrail, Partition, Assembly"],
  ["tenra-facet.orientation-packet.v1", "Facet", "Derive, Assembly, Sentinel"],
  ["tenra-derive.reasoning-brief.v1", "Derive", "Assembly, Guardrail, Sentinel, Proxy"],
  ["tenra-sentinel.risk-brief.v1", "Sentinel", "Derive, Guardrail, Assembly"],
  ["tenra-vicina.workflow-handoff.v1", "Vicina", "Assembly, Guardrail, Sentinel, Proxy"]
];

const content = `# Suite Handoff Registry

Generated from the suite handoff contract inventory by \`scripts/generate-handoff-registry.mjs\`.

This repository participates in tenra-suite local handoffs. Handoffs are explicit JSON payloads moved through local UI actions, API routes, exports, imports, or fixtures. Apps should not read another app's private storage directly.

Envelope baseline:

- \`schema\`: exact contract id when the payload has one.
- \`sourceApp\`: producing app when the contract supports it.
- \`exportId\`: stable producer export id when duplicate-safe reconciliation is needed.
- \`exportedAt\` or \`exportedAtMs\`: creation timestamp.
- \`traceId\` or source artifact metadata when a downstream app needs audit context.
- Target apps are advisory routing metadata, not hidden coupling.

Registered contracts:

| Contract | Owner | Consumers |
| --- | --- | --- |
${contracts.map(([contract, owner, consumers]) => `| \`${contract}\` | ${owner} | ${consumers} |`).join("\n")}

Validation entrypoint:

- Run the repository's \`verify:handoffs\` script before changing or consuming a handoff fixture.
`;

const outputPath = path.resolve("docs/HANDOFF_REGISTRY.md");
const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";

if (process.argv.includes("--check")) {
  if (current !== content) {
    throw new Error("docs/HANDOFF_REGISTRY.md is out of date. Run node scripts/generate-handoff-registry.mjs.");
  }
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
}
