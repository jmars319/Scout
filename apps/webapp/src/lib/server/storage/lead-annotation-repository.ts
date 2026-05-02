import type {
  BusinessBreakdown,
  LeadAnnotation,
  LeadOpportunity,
  LeadStatus,
  MarketSampleQuality,
  SearchCandidate
} from "@scout/domain";
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

interface LeadAnnotationRunRow extends LeadAnnotationRow {
  run_created_at: string | Date;
  run_updated_at: string | Date;
  raw_query: string;
  market_term: string;
  location_label: string | null;
  sample_quality: MarketSampleQuality | null;
  selected_candidates: SearchCandidate[];
  business_results: {
    businessBreakdowns: BusinessBreakdown[];
  } | null;
  shortlist: LeadOpportunity[];
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
  listWithRunContext: (limit?: number) => Promise<LeadAnnotationRunRecord[]>;
  getWithRunContext: (
    runId: string,
    candidateId: string
  ) => Promise<LeadAnnotationRunRecord | null>;
  get: (runId: string, candidateId: string) => Promise<LeadAnnotation | null>;
  save: (input: SaveLeadAnnotationInput) => Promise<LeadAnnotation>;
}

export interface LeadAnnotationRunRecord {
  annotation: LeadAnnotation;
  run: {
    runId: string;
    createdAt: string;
    updatedAt: string;
    rawQuery: string;
    marketTerm: string;
    locationLabel?: string | undefined;
    sampleQuality?: MarketSampleQuality | undefined;
    selectedCandidates: SearchCandidate[];
    businessBreakdowns: BusinessBreakdown[];
    shortlist: LeadOpportunity[];
  };
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

function normalizeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return 200;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function mapRowToRunRecord(row: LeadAnnotationRunRow): LeadAnnotationRunRecord {
  return {
    annotation: mapRowToAnnotation(row),
    run: {
      runId: row.run_id,
      createdAt: toIsoString(row.run_created_at),
      updatedAt: toIsoString(row.run_updated_at),
      rawQuery: row.raw_query,
      marketTerm: row.market_term,
      ...(row.location_label ? { locationLabel: row.location_label } : {}),
      ...(row.sample_quality ? { sampleQuality: row.sample_quality } : {}),
      selectedCandidates: row.selected_candidates,
      businessBreakdowns: row.business_results?.businessBreakdowns ?? [],
      shortlist: row.shortlist
    }
  };
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

    async listWithRunContext(limit) {
      const rows = await sql<LeadAnnotationRunRow[]>`
        select
          annotations.run_id,
          annotations.candidate_id,
          annotations.created_at,
          annotations.updated_at,
          annotations.state,
          annotations.operator_note,
          annotations.follow_up_date,
          runs.created_at as run_created_at,
          runs.updated_at as run_updated_at,
          runs.raw_query,
          runs.market_term,
          runs.location_label,
          runs.sample_quality,
          runs.selected_candidates,
          runs.business_results,
          runs.shortlist
        from scout_lead_annotations annotations
        join scout_runs runs on runs.run_id = annotations.run_id
        order by annotations.updated_at desc
        limit ${normalizeLimit(limit)}
      `;

      return rows.map(mapRowToRunRecord);
    },

    async getWithRunContext(runId, candidateId) {
      const rows = await sql<LeadAnnotationRunRow[]>`
        select
          annotations.run_id,
          annotations.candidate_id,
          annotations.created_at,
          annotations.updated_at,
          annotations.state,
          annotations.operator_note,
          annotations.follow_up_date,
          runs.created_at as run_created_at,
          runs.updated_at as run_updated_at,
          runs.raw_query,
          runs.market_term,
          runs.location_label,
          runs.sample_quality,
          runs.selected_candidates,
          runs.business_results,
          runs.shortlist
        from scout_lead_annotations annotations
        join scout_runs runs on runs.run_id = annotations.run_id
        where annotations.run_id = ${runId} and annotations.candidate_id = ${candidateId}
        limit 1
      `;

      return rows[0] ? mapRowToRunRecord(rows[0]) : null;
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
