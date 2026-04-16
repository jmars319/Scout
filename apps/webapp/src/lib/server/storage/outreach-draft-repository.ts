import type { OutreachDraft, OutreachLength, OutreachTone } from "@scout/domain";
import { outreachDraftSchema } from "@scout/validation";

import { getPostgresClient } from "./postgres-client.ts";

interface OutreachDraftRow {
  draft_id: string;
  run_id: string;
  candidate_id: string;
  created_at: string;
  updated_at: string;
  business_name: string;
  primary_url: string;
  tone: OutreachTone;
  draft_length: OutreachLength;
  subject_line: string;
  body: string;
  grounding: OutreachDraft["grounding"];
  model: string | null;
}

export interface SaveOutreachDraftInput {
  runId: string;
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  tone: OutreachTone;
  length: OutreachLength;
  subjectLine: string;
  body: string;
  grounding: string[];
  model?: string | undefined;
}

export interface OutreachDraftRepository {
  listByRun: (runId: string) => Promise<OutreachDraft[]>;
  get: (runId: string, candidateId: string) => Promise<OutreachDraft | null>;
  save: (input: SaveOutreachDraftInput) => Promise<OutreachDraft>;
}

function createDraftId(runId: string, candidateId: string): string {
  return `${runId}:${candidateId}`;
}

function mapRowToDraft(row: OutreachDraftRow): OutreachDraft {
  return outreachDraftSchema.parse({
    draftId: row.draft_id,
    runId: row.run_id,
    candidateId: row.candidate_id,
    businessName: row.business_name,
    primaryUrl: row.primary_url,
    tone: row.tone,
    length: row.draft_length,
    subjectLine: row.subject_line,
    body: row.body,
    grounding: row.grounding,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.model ? { model: row.model } : {})
  });
}

export function createOutreachDraftRepository(): OutreachDraftRepository {
  const sql = getPostgresClient();

  return {
    async listByRun(runId) {
      const rows = await sql<OutreachDraftRow[]>`
        select
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          subject_line,
          body,
          grounding,
          model
        from scout_outreach_drafts
        where run_id = ${runId}
        order by updated_at desc
      `;

      return rows.map(mapRowToDraft);
    },

    async get(runId, candidateId) {
      const rows = await sql<OutreachDraftRow[]>`
        select
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          subject_line,
          body,
          grounding,
          model
        from scout_outreach_drafts
        where run_id = ${runId} and candidate_id = ${candidateId}
        limit 1
      `;

      return rows[0] ? mapRowToDraft(rows[0]) : null;
    },

    async save(input) {
      const now = new Date().toISOString();
      const rows = await sql<OutreachDraftRow[]>`
        insert into scout_outreach_drafts (
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          subject_line,
          body,
          grounding,
          model
        )
        values (
          ${createDraftId(input.runId, input.candidateId)},
          ${input.runId},
          ${input.candidateId},
          ${now},
          ${now},
          ${input.businessName},
          ${input.primaryUrl},
          ${input.tone},
          ${input.length},
          ${input.subjectLine},
          ${input.body},
          ${sql.json(input.grounding)},
          ${input.model ?? null}
        )
        on conflict (run_id, candidate_id) do update
        set
          updated_at = excluded.updated_at,
          business_name = excluded.business_name,
          primary_url = excluded.primary_url,
          tone = excluded.tone,
          draft_length = excluded.draft_length,
          subject_line = excluded.subject_line,
          body = excluded.body,
          grounding = excluded.grounding,
          model = excluded.model
        returning
          draft_id,
          run_id,
          candidate_id,
          created_at,
          updated_at,
          business_name,
          primary_url,
          tone,
          draft_length,
          subject_line,
          body,
          grounding,
          model
      `;

      if (!rows[0]) {
        throw new Error("Scout could not persist the outreach draft.");
      }

      return mapRowToDraft(rows[0]);
    }
  };
}
