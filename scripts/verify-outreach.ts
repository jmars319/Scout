import { createServer } from "node:http";

import { createEmptyAcquisitionDiagnostics } from "../packages/domain/src/report.ts";
import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import type { OutreachProfile, ScoutRunReport } from "../packages/domain/src/model.ts";

import {
  analyzeOutreachCandidate,
  getOutreachWorkspaceState,
  saveOutreachDraftEdit
} from "../apps/webapp/src/lib/server/outreach/outreach-service.ts";
import { createOutreachProfileRepository } from "../apps/webapp/src/lib/server/storage/outreach-profile-repository.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";
import { getPostgresClient } from "../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const repository = createRunRepository();
const createdAt = new Date();
const runId = `verify-outreach-${createdAt.toISOString().replace(/[:.]/g, "-")}`;
const query = {
  rawQuery: "outreach verification shop in Winston-Salem, NC"
};
const intent = resolveMarketIntent(query);
const acquisition = createEmptyAcquisitionDiagnostics("verification");

const server = createServer((request, response) => {
  if ((request.url ?? "/") === "/contact") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html lang="en">
        <body>
          <main>
            <h1>Contact Outreach Verification Shop</h1>
            <a href="mailto:owner@verification.example">owner@verification.example</a>
            <a href="tel:13365550199">(336) 555-0199</a>
            <form action="/contact" method="post">
              <label>Name <input name="name" /></label>
              <label>Message <textarea name="message"></textarea></label>
              <button type="submit">Send</button>
            </form>
          </main>
        </body>
      </html>`);
    return;
  }

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
    <html lang="en">
      <body>
        <main>
          <h1>Outreach Verification Shop</h1>
          <p>Scout verification target.</p>
          <a href="/contact">Contact</a>
          <a href="mailto:owner@verification.example">Email us</a>
          <a href="tel:13365550199">Call us</a>
          <a href="https://www.facebook.com/outreachverification">Facebook</a>
        </main>
      </body>
    </html>`);
});

await new Promise<void>((resolve, reject) => {
  server.listen(0, "127.0.0.1", () => resolve());
  server.once("error", reject);
});

const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Outreach verification server did not expose a usable port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

const candidate = {
  candidateId: "lead-1",
  rank: 1,
  title: "Outreach Verification Shop",
  url: `${baseUrl}/`,
  domain: "127.0.0.1",
  snippet: "Verification-owned website.",
  source: "verification"
} as const;
let originalStoredProfile: OutreachProfile | null = null;

function toSaveProfileInput(profile: OutreachProfile) {
  return {
    senderName: profile.senderName,
    companyName: profile.companyName,
    roleTitle: profile.roleTitle,
    serviceLine: profile.serviceLine,
    serviceSummary: profile.serviceSummary,
    defaultCallToAction: profile.defaultCallToAction,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    websiteUrl: profile.websiteUrl,
    schedulerUrl: profile.schedulerUrl,
    toneNotes: profile.toneNotes,
    avoidPhrases: profile.avoidPhrases,
    signature: profile.signature
  };
}

try {
  await applyScoutSchema();
  const profileRepository = createOutreachProfileRepository();
  originalStoredProfile = await profileRepository.getDefault();

  const savedProfile = await profileRepository.saveDefault({
    senderName: "Jordan Marshall",
    companyName: "JAMARQ",
    roleTitle: "Founder",
    serviceLine: "Website repairs and conversion improvements",
    serviceSummary: "I help small businesses fix broken website paths and make contact intent easier to act on.",
    defaultCallToAction: "Reply if you'd like a short summary of the fixes I noticed.",
    contactEmail: "jordan@jamarq.example",
    contactPhone: "(336) 555-0188",
    websiteUrl: "https://jamarq.example",
    schedulerUrl: "https://cal.example/jamarq",
    toneNotes: "Keep the note calm, brief, and useful.",
    avoidPhrases: ["just checking in", "synergy"],
    signature: "Jordan Marshall\nJAMARQ\njordan@jamarq.example"
  });

  if (savedProfile.companyName !== "JAMARQ" || savedProfile.senderName !== "Jordan Marshall") {
    throw new Error("Scout did not persist the outreach profile.");
  }

  await repository.createQueuedRun({
    runId,
    createdAt: createdAt.toISOString(),
    input: query,
    intent
  });

  const report: ScoutRunReport = {
    schemaVersion: 2,
    runId,
    status: "completed",
    createdAt: createdAt.toISOString(),
    query,
    intent,
    acquisition,
    searchSource: "verification",
    candidates: [candidate],
    presences: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        domain: candidate.domain,
        searchRank: 1,
        presenceType: "owned_website",
        auditEligible: true,
        secondaryUrls: [`${baseUrl}/contact`],
        detectionNotes: ["Owned website verified for outreach persistence smoke coverage."]
      }
    ],
    findings: [
      {
        id: "finding-1",
        candidateId: candidate.candidateId,
        pageUrl: candidate.url,
        pageLabel: "homepage",
        viewport: "desktop",
        issueType: "missing_contact_path",
        severity: "high",
        confidence: "confirmed",
        message: "The homepage makes it hard to find a clear contact path.",
        reproductionNote: "Primary navigation lacked a visible contact or booking path."
      }
    ],
    classifications: [
      {
        candidateId: candidate.candidateId,
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        rationale: ["Deterministic verification rationale."]
      }
    ],
    businessBreakdowns: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        searchRank: 1,
        presenceType: "owned_website",
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        findingCount: 1,
        highSeverityFindings: 1,
        audited: true,
        auditStatus: "audited",
        topIssues: ["missing_contact_path"],
        secondaryUrls: [`${baseUrl}/contact`],
        detectionNotes: ["Homepage contact path issue confirmed."]
      }
    ],
    shortlist: [
      {
        candidateId: candidate.candidateId,
        businessName: "Outreach Verification Shop",
        primaryUrl: candidate.url,
        presenceType: "owned_website",
        presenceQuality: "broken",
        opportunityTypes: ["repair", "conversion_improvement"],
        confidence: "confirmed",
        priorityScore: 120,
        reasons: [
          "Confirmed browser and navigation friction make the site worth repair work.",
          "The current site leaves contact or conversion intent harder to find than it should."
        ]
      }
    ],
    summary: {
      totalCandidates: 1,
      auditedPresences: 1,
      skippedPresences: 0,
      sampleQuality: acquisition.sampleQuality,
      presenceBreakdown: {
        owned_website: 1,
        facebook_only: 0,
        yelp_only: 0,
        directory_only: 0,
        marketplace: 0,
        dead: 0,
        blocked: 0,
        unknown: 0
      },
      qualityBreakdown: {
        none: 0,
        weak: 0,
        functional: 0,
        broken: 1,
        strong: 0
      },
      commonIssues: [
        {
          issueType: "missing_contact_path",
          count: 1
        }
      ]
    },
    notes: ["Outreach verification run."]
  };

  await repository.save(report);

  const analyzed = await analyzeOutreachCandidate({
    runId,
    candidateId: candidate.candidateId
  });

  if (analyzed.draft.recommendedChannel !== "email") {
    throw new Error("Scout did not recommend email as the strongest first contact path.");
  }

  if (analyzed.draft.contactChannels.length < 3) {
    throw new Error("Scout contact analysis did not preserve the expected channel set.");
  }

  if (!analyzed.draft.contactChannels.some((channel) => channel.kind === "phone")) {
    throw new Error("Scout contact analysis missed the phone path.");
  }

  const saved = await saveOutreachDraftEdit({
    runId,
    candidateId: candidate.candidateId,
    tone: "calm",
    length: "brief",
    subjectLine: "A quick website note for Outreach Verification Shop",
    body: "I took a look at your site and noticed it may be harder than it should be for visitors to find a clear contact path from the homepage. If helpful, I can share a couple concrete fixes that would make that path easier to spot and act on.",
    shortMessage:
      "Quick note: your homepage may be making contact intent harder to find than it needs to be. I can share a couple concrete fixes if useful.",
    phoneTalkingPoints: {
      opener: "Hi, I was looking at your site and noticed one quick thing that may be costing you leads.",
      keyPoints: [
        "The homepage makes the contact path harder to spot than it should be.",
        "A couple small navigation and CTA adjustments could make first contact easier."
      ],
      close: "If helpful, I can send a short summary with the specific fixes I noticed."
    }
  });

  if (saved.draft.candidateId !== candidate.candidateId) {
    throw new Error("Scout did not save the outreach draft for the expected candidate.");
  }

  if (saved.draft.shortMessage !==
    "Quick note: your homepage may be making contact intent harder to find than it needs to be. I can share a couple concrete fixes if useful.") {
    throw new Error("Scout did not persist the short-form outreach copy.");
  }

  if (!saved.draft.phoneTalkingPoints || saved.draft.phoneTalkingPoints.keyPoints.length !== 2) {
    throw new Error("Scout did not persist the phone talking points.");
  }

  const workspace = await getOutreachWorkspaceState(runId);
  const persisted = workspace.drafts.find((draft) => draft.candidateId === candidate.candidateId);

  if (!persisted) {
    throw new Error("Scout outreach workspace did not return the saved local draft.");
  }

  if (persisted.recommendedChannel !== "email") {
    throw new Error("Scout did not preserve the recommended contact channel in workspace state.");
  }

  if (!persisted.shortMessage || !persisted.phoneTalkingPoints) {
    throw new Error("Scout workspace state did not round-trip the full outreach pack.");
  }

  console.log("Outreach verification passed.");
} finally {
  server.close();
  const sql = getPostgresClient();
  await sql`delete from scout_outreach_drafts where run_id = ${runId}`;
  await sql`delete from scout_runs where run_id = ${runId}`;
  const profileRepository = createOutreachProfileRepository();
  if (originalStoredProfile) {
    await profileRepository.saveDefault(toSaveProfileInput(originalStoredProfile));
  } else {
    await sql`delete from scout_outreach_profiles where profile_id = 'default'`;
  }
  await closeScoutSchemaClient();
}
