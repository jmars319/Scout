create table if not exists scout_runs (
  run_id text primary key,
  schema_version integer not null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  queued_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  attempt_count integer not null default 0,
  worker_id text,
  last_error_message text,
  raw_query text not null,
  normalized_query text not null,
  market_term text not null,
  categories text[] not null default '{}',
  location_label text,
  location_city text,
  location_region text,
  search_query text not null,
  search_provider text,
  search_source text,
  sample_quality text check (
    sample_quality is null
    or sample_quality in ('strong_sample', 'adequate_sample', 'partial_sample', 'weak_sample')
  ),
  acquisition jsonb,
  selected_candidates jsonb not null default '[]'::jsonb,
  business_results jsonb,
  shortlist jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  error_message text,
  persistence_metadata jsonb not null default '{}'::jsonb
);

alter table scout_runs add column if not exists queued_at timestamptz;
alter table scout_runs add column if not exists started_at timestamptz;
alter table scout_runs add column if not exists finished_at timestamptz;
alter table scout_runs add column if not exists attempt_count integer not null default 0;
alter table scout_runs add column if not exists worker_id text;
alter table scout_runs add column if not exists last_error_message text;

update scout_runs
set
  queued_at = coalesce(queued_at, created_at),
  started_at = coalesce(
    started_at,
    case when status in ('running', 'completed', 'failed') then created_at else null end
  ),
  finished_at = coalesce(
    finished_at,
    case when status in ('completed', 'failed') then updated_at else null end
  ),
  attempt_count = case
    when attempt_count > 0 then attempt_count
    when status = 'queued' then 0
    else 1
  end,
  last_error_message = coalesce(last_error_message, error_message)
where true;

create index if not exists scout_runs_created_at_idx on scout_runs (created_at desc);
create index if not exists scout_runs_status_created_at_idx on scout_runs (status, created_at desc);
