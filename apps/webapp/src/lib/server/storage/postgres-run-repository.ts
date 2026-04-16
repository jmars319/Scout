import type { MarketSampleQuality, ScoutRunReport } from "@scout/domain";
import { persistedRunRecordSchema } from "@scout/validation";

import {
  createPersistedRunRecord,
  createQueuedPersistedRunRecord,
  type PersistedRunRecord,
  type PersistedRunRecordOptions,
  type PersistenceMetadataInput,
  type QueuedRunRecordInput,
  toScoutRunReport
} from "./persisted-run-record.ts";
import { getPostgresClient } from "./postgres-client.ts";

export interface RecentRunSummary {
  runId: string;
  status: PersistedRunRecord["status"];
  createdAt: string;
  updatedAt: string;
  rawQuery: string;
  marketTerm: string;
  sampleQuality?: MarketSampleQuality;
}

interface ScoutRunRow {
  run_id: string;
  schema_version: number;
  status: PersistedRunRecord["status"];
  created_at: string | Date;
  updated_at: string | Date;
  queued_at: string | Date;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  attempt_count: number;
  worker_id: string | null;
  last_error_message: string | null;
  raw_query: string;
  normalized_query: string;
  market_term: string;
  categories: string[];
  location_label: string | null;
  location_city: string | null;
  location_region: string | null;
  search_query: string;
  search_provider: string | null;
  search_source: string | null;
  sample_quality: MarketSampleQuality | null;
  acquisition: PersistedRunRecord["acquisition"] | null;
  selected_candidates: PersistedRunRecord["selectedCandidates"];
  business_results: PersistedRunRecord["businessResults"] | null;
  shortlist: PersistedRunRecord["shortlist"];
  notes: PersistedRunRecord["notes"];
  error_message: string | null;
  persistence_metadata: PersistedRunRecord["persistence"];
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRowToRecord(row: ScoutRunRow): PersistedRunRecord {
  const record = persistedRunRecordSchema.parse({
    schemaVersion: row.schema_version,
    runId: row.run_id,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    execution: {
      queuedAt: toIsoString(row.queued_at),
      attemptCount: row.attempt_count,
      ...(row.started_at ? { startedAt: toIsoString(row.started_at) } : {}),
      ...(row.finished_at ? { finishedAt: toIsoString(row.finished_at) } : {}),
      ...(row.worker_id ? { workerId: row.worker_id } : {}),
      ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {})
    },
    input: {
      rawQuery: row.raw_query
    },
    intent: {
      originalQuery: row.raw_query,
      normalizedQuery: row.normalized_query,
      marketTerm: row.market_term,
      categories: row.categories,
      locationLabel: row.location_label ?? undefined,
      locationCity: row.location_city ?? undefined,
      locationRegion: row.location_region ?? undefined,
      searchQuery: row.search_query
    },
    acquisition: row.acquisition,
    selectedCandidates: row.selected_candidates,
    businessResults: row.business_results,
    shortlist: row.shortlist,
    notes: row.notes,
    errorMessage: row.error_message ?? undefined,
    persistence: row.persistence_metadata
  });

  return record;
}

export function createPostgresRunRepository() {
  const sql = getPostgresClient();

  async function upsertRecord(record: PersistedRunRecord): Promise<PersistedRunRecord> {
    const [row] = await sql<ScoutRunRow[]>`
      insert into scout_runs (
        run_id,
        schema_version,
        status,
        created_at,
        updated_at,
        queued_at,
        started_at,
        finished_at,
        attempt_count,
        worker_id,
        last_error_message,
        raw_query,
        normalized_query,
        market_term,
        categories,
        location_label,
        location_city,
        location_region,
        search_query,
        search_provider,
        search_source,
        sample_quality,
        acquisition,
        selected_candidates,
        business_results,
        shortlist,
        notes,
        error_message,
        persistence_metadata
      )
      values (
        ${record.runId},
        ${record.schemaVersion},
        ${record.status},
        ${record.createdAt},
        ${record.updatedAt},
        ${record.execution.queuedAt},
        ${record.execution.startedAt ?? null},
        ${record.execution.finishedAt ?? null},
        ${record.execution.attemptCount},
        ${record.execution.workerId ?? null},
        ${record.execution.lastErrorMessage ?? null},
        ${record.input.rawQuery},
        ${record.intent.normalizedQuery},
        ${record.intent.marketTerm},
        ${sql.array(record.intent.categories)},
        ${record.intent.locationLabel ?? null},
        ${record.intent.locationCity ?? null},
        ${record.intent.locationRegion ?? null},
        ${record.intent.searchQuery},
        ${record.acquisition?.provider ?? null},
        ${
          record.acquisition
            ? (() => {
                const selectedSources = [
                  ...new Set(
                    record.acquisition.candidateSources
                      .filter((source) => source.selectedCandidateCount > 0)
                      .map((source) => source.source)
                  )
                ];

                if (selectedSources.length > 0) {
                  return selectedSources.join(" + ");
                }

                return record.acquisition.fallbackUsed
                  ? `${record.acquisition.provider} + seeded_stub`
                  : record.acquisition.provider;
              })()
            : null
        },
        ${record.acquisition?.sampleQuality ?? record.businessResults?.summary.sampleQuality ?? null},
        ${record.acquisition ? sql.json(record.acquisition) : null},
        ${sql.json(record.selectedCandidates)},
        ${record.businessResults ? sql.json(record.businessResults) : null},
        ${sql.json(record.shortlist)},
        ${sql.json(record.notes)},
        ${record.errorMessage ?? null},
        ${sql.json(record.persistence)}
      )
      on conflict (run_id) do update
      set
        schema_version = excluded.schema_version,
        status = excluded.status,
        updated_at = excluded.updated_at,
        queued_at = excluded.queued_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        attempt_count = excluded.attempt_count,
        worker_id = excluded.worker_id,
        last_error_message = excluded.last_error_message,
        raw_query = excluded.raw_query,
        normalized_query = excluded.normalized_query,
        market_term = excluded.market_term,
        categories = excluded.categories,
        location_label = excluded.location_label,
        location_city = excluded.location_city,
        location_region = excluded.location_region,
        search_query = excluded.search_query,
        search_provider = excluded.search_provider,
        search_source = excluded.search_source,
        sample_quality = excluded.sample_quality,
        acquisition = excluded.acquisition,
        selected_candidates = excluded.selected_candidates,
        business_results = excluded.business_results,
        shortlist = excluded.shortlist,
        notes = excluded.notes,
        error_message = excluded.error_message,
        persistence_metadata = excluded.persistence_metadata
      returning
        run_id,
        schema_version,
        status,
        created_at,
        updated_at,
        queued_at,
        started_at,
        finished_at,
        attempt_count,
        worker_id,
        last_error_message,
        raw_query,
        normalized_query,
        market_term,
        categories,
        location_label,
        location_city,
        location_region,
        search_query,
        search_provider,
        search_source,
        sample_quality,
        acquisition,
        selected_candidates,
        business_results,
        shortlist,
        notes,
        error_message,
        persistence_metadata
    `;

    if (!row) {
      throw new Error(`Failed to persist Scout run ${record.runId} to Postgres.`);
    }

    return mapRowToRecord(row);
  }

  async function buildFinalizedRecordOptions(
    report: ScoutRunReport,
    persistence: PersistenceMetadataInput
  ): Promise<PersistedRunRecordOptions> {
    const existing = await repository.getRecord(report.runId);

    const execution = existing
      ? {
          queuedAt: existing.execution.queuedAt,
          attemptCount: existing.execution.attemptCount,
          finishedAt: new Date().toISOString(),
          ...(existing.execution.startedAt ? { startedAt: existing.execution.startedAt } : {}),
          ...(existing.execution.workerId ? { workerId: existing.execution.workerId } : {}),
          ...(report.errorMessage
            ? { lastErrorMessage: report.errorMessage }
            : existing.execution.lastErrorMessage
              ? { lastErrorMessage: existing.execution.lastErrorMessage }
              : {})
        }
      : undefined;

    return {
      ...(execution ? { execution } : {}),
      persistence
    };
  }

  const repository = {
    async createQueuedRun(input: QueuedRunRecordInput): Promise<PersistedRunRecord> {
      return upsertRecord(createQueuedPersistedRunRecord(input));
    },

    async save(
      report: ScoutRunReport,
      persistence: PersistenceMetadataInput = {}
    ): Promise<PersistedRunRecord> {
      return upsertRecord(
        createPersistedRunRecord(report, await buildFinalizedRecordOptions(report, persistence))
      );
    },

    upsertRecord,

    async claimNextQueuedRun(workerId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        with next_run as (
          select run_id
          from scout_runs
          where status = 'queued'
          order by queued_at asc, created_at asc
          for update skip locked
          limit 1
        )
        update scout_runs
        set
          status = 'running',
          updated_at = now(),
          started_at = now(),
          finished_at = null,
          attempt_count = attempt_count + 1,
          worker_id = ${workerId},
          last_error_message = null
        where run_id in (select run_id from next_run)
        returning
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          attempt_count,
          worker_id,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async requeueStaleRuns(staleRunMs: number): Promise<number> {
      const rows = await sql<Array<{ run_id: string }>>`
        update scout_runs
        set
          status = 'queued',
          updated_at = now(),
          queued_at = now(),
          finished_at = null,
          worker_id = null,
          last_error_message = coalesce(
            last_error_message,
            'Scout worker did not finish the previous attempt. The run was re-queued.'
          )
        where status = 'running'
          and started_at is not null
          and started_at < now() - (${Math.max(staleRunMs, 1000)} * interval '1 millisecond')
        returning run_id
      `;

      return rows.length;
    },

    async getRecord(runId: string): Promise<PersistedRunRecord | null> {
      const [row] = await sql<ScoutRunRow[]>`
        select
          run_id,
          schema_version,
          status,
          created_at,
          updated_at,
          queued_at,
          started_at,
          finished_at,
          attempt_count,
          worker_id,
          last_error_message,
          raw_query,
          normalized_query,
          market_term,
          categories,
          location_label,
          location_city,
          location_region,
          search_query,
          search_provider,
          search_source,
          sample_quality,
          acquisition,
          selected_candidates,
          business_results,
          shortlist,
          notes,
          error_message,
          persistence_metadata
        from scout_runs
        where run_id = ${runId}
        limit 1
      `;

      return row ? mapRowToRecord(row) : null;
    },

    async get(runId: string): Promise<ScoutRunReport | null> {
      const record = await repository.getRecord(runId);
      return record ? toScoutRunReport(record) : null;
    },

    async listRecent(limit = 6): Promise<RecentRunSummary[]> {
      const rows = await sql<
        Array<{
          run_id: string;
          status: PersistedRunRecord["status"];
          created_at: string | Date;
          updated_at: string | Date;
          raw_query: string;
          market_term: string;
          sample_quality: MarketSampleQuality | null;
        }>
      >`
        select
          run_id,
          status,
          created_at,
          updated_at,
          raw_query,
          market_term,
          sample_quality
        from scout_runs
        order by created_at desc
        limit ${Math.max(1, Math.min(limit, 20))}
      `;

      return rows.map((row) => ({
        runId: row.run_id,
        status: row.status,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
        rawQuery: row.raw_query,
        marketTerm: row.market_term,
        ...(row.sample_quality ? { sampleQuality: row.sample_quality } : {})
      }));
    }
  };

  return repository;
}
