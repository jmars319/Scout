import type { LeadAnnotation, LeadStatus } from "@scout/domain";
import { leadAnnotationSchema } from "@scout/validation";

import { getPostgresClient } from "./postgres-client.ts";

interface LeadAnnotationRow {
  run_id: string;
  candidate_id: string;
  created_at: string | Date;
  updated_at: string | Date;
  state: LeadStatus;
  operator_note: string;
  follow_up_date: string | Date | null;
}

export interface SaveLeadAnnotationInput {
  runId: string;
  candidateId: string;
  state: LeadStatus;
  operatorNote: string;
  followUpDate?: string | undefined;
}

export interface LeadAnnotationRepository {
  listByRun: (runId: string) => Promise<LeadAnnotation[]>;
  get: (runId: string, candidateId: string) => Promise<LeadAnnotation | null>;
  save: (input: SaveLeadAnnotationInput) => Promise<LeadAnnotation>;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateString(value: string | Date | null): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function mapRowToAnnotation(row: LeadAnnotationRow): LeadAnnotation {
  return leadAnnotationSchema.parse({
    runId: row.run_id,
    candidateId: row.candidate_id,
    state: row.state,
    operatorNote: row.operator_note,
    followUpDate: toDateString(row.follow_up_date),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at)
  });
}

export function createLeadAnnotationRepository(): LeadAnnotationRepository {
  const sql = getPostgresClient();

  return {
    async listByRun(runId) {
      const rows = await sql<LeadAnnotationRow[]>`
        select
          run_id,
          candidate_id,
          created_at,
          updated_at,
          state,
          operator_note,
          follow_up_date
        from scout_lead_annotations
        where run_id = ${runId}
        order by updated_at desc
      `;

      return rows.map(mapRowToAnnotation);
    },

    async get(runId, candidateId) {
      const rows = await sql<LeadAnnotationRow[]>`
        select
          run_id,
          candidate_id,
          created_at,
          updated_at,
          state,
          operator_note,
          follow_up_date
        from scout_lead_annotations
        where run_id = ${runId} and candidate_id = ${candidateId}
        limit 1
      `;

      return rows[0] ? mapRowToAnnotation(rows[0]) : null;
    },

    async save(input) {
      const now = new Date().toISOString();
      const rows = await sql<LeadAnnotationRow[]>`
        insert into scout_lead_annotations (
          run_id,
          candidate_id,
          created_at,
          updated_at,
          state,
          operator_note,
          follow_up_date
        )
        values (
          ${input.runId},
          ${input.candidateId},
          ${now},
          ${now},
          ${input.state},
          ${input.operatorNote},
          ${input.followUpDate ?? null}
        )
        on conflict (run_id, candidate_id) do update
        set
          updated_at = excluded.updated_at,
          state = excluded.state,
          operator_note = excluded.operator_note,
          follow_up_date = excluded.follow_up_date
        returning
          run_id,
          candidate_id,
          created_at,
          updated_at,
          state,
          operator_note,
          follow_up_date
      `;

      if (!rows[0]) {
        throw new Error("Scout could not persist the lead annotation.");
      }

      return mapRowToAnnotation(rows[0]);
    }
  };
}
