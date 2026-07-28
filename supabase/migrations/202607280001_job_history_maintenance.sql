-- Bound operational job history without losing auditability.
-- Terminal jobs are rolled up by UTC day before their detail rows are pruned.
-- Raw articles are never deleted: expired retries are retained as terminal rows.

create table if not exists public.job_history_daily_metrics (
  metric_day date not null,
  job_source text not null check (job_source in ('ingestion_jobs', 'ai_jobs')),
  job_type text not null,
  status public.job_status not null check (status in ('completed', 'failed')),
  provider text not null default 'unknown',
  error_key text not null default 'none',
  job_count bigint not null default 0 check (job_count >= 0),
  fetched_count bigint not null default 0 check (fetched_count >= 0),
  inserted_count bigint not null default 0 check (inserted_count >= 0),
  updated_count bigint not null default 0 check (updated_count >= 0),
  skipped_count bigint not null default 0 check (skipped_count >= 0),
  first_aggregated_at timestamptz not null default now(),
  last_aggregated_at timestamptz not null default now(),
  primary key (metric_day, job_source, job_type, status, provider, error_key)
);

create table if not exists public.job_history_maintenance_state (
  singleton_key boolean primary key default true check (singleton_key),
  last_run_day date,
  last_run_at timestamptz,
  last_result jsonb not null default '{}'::jsonb
);

insert into public.job_history_maintenance_state (singleton_key)
values (true)
on conflict (singleton_key) do nothing;

alter table public.job_history_daily_metrics enable row level security;
alter table public.job_history_maintenance_state enable row level security;

revoke all on table public.job_history_daily_metrics from public, anon, authenticated;
revoke all on table public.job_history_maintenance_state from public, anon, authenticated;
grant select on table public.job_history_daily_metrics to service_role;
grant select on table public.job_history_maintenance_state to service_role;

create index if not exists ingestion_jobs_terminal_retention_idx
  on public.ingestion_jobs ((coalesce(completed_at, started_at)))
  where status in ('completed', 'failed');

create index if not exists ai_jobs_terminal_retention_idx
  on public.ai_jobs ((coalesce(completed_at, created_at)))
  where status in ('completed', 'failed');

create or replace function public.maintain_newspeek_job_history(
  p_now timestamptz default now(),
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_run_day date;
  v_last_run_day date;
  v_stale_ingestion integer := 0;
  v_stale_ai integer := 0;
  v_terminal_articles integer := 0;
  v_metric_groups integer := 0;
  v_pruned_ingestion integer := 0;
  v_pruned_ai integer := 0;
  v_result jsonb;
begin
  v_run_day := (v_now at time zone 'UTC')::date;

  -- Serialize forced/manual runs as well as the normal daily cron invocation.
  perform pg_advisory_xact_lock(
    hashtextextended('newspeek:job-history-maintenance', 0)
  );

  insert into public.job_history_maintenance_state (singleton_key)
  values (true)
  on conflict (singleton_key) do nothing;

  select state.last_run_day
  into v_last_run_day
  from public.job_history_maintenance_state as state
  where state.singleton_key = true
  for update;

  if not coalesce(p_force, false)
    and v_last_run_day is not null
    and v_last_run_day >= v_run_day
  then
    return jsonb_build_object(
      'status', 'skipped',
      'reason', 'already_ran_today',
      'runDay', v_run_day,
      'lastRunDay', v_last_run_day
    );
  end if;

  -- Close Worker jobs whose process disappeared without finalizing the row.
  with expired as (
    update public.ingestion_jobs as job
    set
      status = 'failed',
      completed_at = coalesce(job.completed_at, v_now),
      error_code = 'LEASE_EXPIRED',
      error_message = case
        when job.job_type = 'ai:backfill'
          then 'AI backfill Worker exceeded its 10-minute lease.'
        else 'Ingestion Worker exceeded its 5-minute lease.'
      end,
      metadata = coalesce(job.metadata, '{}'::jsonb) || jsonb_build_object(
        'leaseExpiredAt', v_now,
        'maintenance', 'maintain_newspeek_job_history'
      )
    where job.status = 'processing'
      and (
        (
          job.job_type in ('rss:sync', 'stories:process')
          and job.started_at <= v_now - interval '5 minutes'
        )
        or (
          job.job_type = 'ai:backfill'
          and job.started_at <= v_now - interval '10 minutes'
        )
      )
    returning job.id
  )
  select count(*)::integer into v_stale_ingestion from expired;

  with expired as (
    update public.ai_jobs as job
    set
      status = 'failed',
      completed_at = coalesce(job.completed_at, v_now),
      error_message = 'LEASE_EXPIRED: summarize_cluster job exceeded its 10-minute lease.'
    where job.job_type = 'summarize_cluster'
      and job.status in ('pending', 'processing')
      and job.created_at <= v_now - interval '10 minutes'
    returning job.id
  )
  select count(*)::integer into v_stale_ai from expired;

  -- Failed articles leave the retry queue after seven days, but remain available
  -- for audit and future manual repair.
  with terminalized as (
    update public.raw_articles as article
    set
      processing_attempts = greatest(article.processing_attempts, 5),
      processing_retry_after = null,
      processing_job_id = null,
      processing_claimed_at = null,
      processing_lease_expires_at = null,
      processing_error = left(
        concat_ws(
          ' | ',
          nullif(article.processing_error, ''),
          'Retry window expired; retained for audit as terminal.'
        ),
        1000
      )
    where article.processing_status = 'failed'
      and article.fetched_at <= v_now - interval '7 days'
      and (
        article.processing_attempts < 5
        or article.processing_retry_after is not null
      )
    returning article.id
  )
  select count(*)::integer into v_terminal_articles from terminalized;

  -- Roll up only rows eligible for this transaction's pruning. The additive
  -- upsert is safe because the same detail rows are deleted later in this
  -- transaction; rollback restores both sides if any statement fails.
  with terminal_jobs as (
    select
      (job.started_at at time zone 'UTC')::date as metric_day,
      'ingestion_jobs'::text as job_source,
      job.job_type,
      job.status,
      coalesce(nullif(job.provider, ''), 'unknown') as provider,
      left(
        coalesce(
          nullif(job.error_code, ''),
          nullif(job.error_message, ''),
          'none'
        ),
        240
      ) as error_key,
      1::bigint as job_count,
      greatest(job.fetched_count, 0)::bigint as fetched_count,
      greatest(job.inserted_count, 0)::bigint as inserted_count,
      greatest(job.updated_count, 0)::bigint as updated_count,
      greatest(job.skipped_count, 0)::bigint as skipped_count
    from public.ingestion_jobs as job
    where (
      job.status = 'completed'
      and coalesce(job.completed_at, job.started_at)
        <= v_now - interval '14 days'
    ) or (
      job.status = 'failed'
      and coalesce(job.completed_at, job.started_at)
        <= v_now - interval '90 days'
    )

    union all

    select
      (job.created_at at time zone 'UTC')::date as metric_day,
      'ai_jobs'::text as job_source,
      job.job_type,
      job.status,
      coalesce(nullif(job.provider, ''), 'unknown') as provider,
      left(coalesce(nullif(job.error_message, ''), 'none'), 240) as error_key,
      1::bigint as job_count,
      0::bigint as fetched_count,
      0::bigint as inserted_count,
      0::bigint as updated_count,
      0::bigint as skipped_count
    from public.ai_jobs as job
    where (
      job.status = 'completed'
      and coalesce(job.completed_at, job.created_at)
        <= v_now - interval '30 days'
    ) or (
      job.status = 'failed'
      and coalesce(job.completed_at, job.created_at)
        <= v_now - interval '90 days'
    )
  ), daily as (
    select
      terminal_jobs.metric_day,
      terminal_jobs.job_source,
      terminal_jobs.job_type,
      terminal_jobs.status,
      terminal_jobs.provider,
      terminal_jobs.error_key,
      sum(terminal_jobs.job_count)::bigint as job_count,
      sum(terminal_jobs.fetched_count)::bigint as fetched_count,
      sum(terminal_jobs.inserted_count)::bigint as inserted_count,
      sum(terminal_jobs.updated_count)::bigint as updated_count,
      sum(terminal_jobs.skipped_count)::bigint as skipped_count
    from terminal_jobs
    group by
      terminal_jobs.metric_day,
      terminal_jobs.job_source,
      terminal_jobs.job_type,
      terminal_jobs.status,
      terminal_jobs.provider,
      terminal_jobs.error_key
  )
  insert into public.job_history_daily_metrics (
    metric_day,
    job_source,
    job_type,
    status,
    provider,
    error_key,
    job_count,
    fetched_count,
    inserted_count,
    updated_count,
    skipped_count,
    first_aggregated_at,
    last_aggregated_at
  )
  select
    daily.metric_day,
    daily.job_source,
    daily.job_type,
    daily.status,
    daily.provider,
    daily.error_key,
    daily.job_count,
    daily.fetched_count,
    daily.inserted_count,
    daily.updated_count,
    daily.skipped_count,
    v_now,
    v_now
  from daily
  on conflict (metric_day, job_source, job_type, status, provider, error_key)
  do update set
    job_count = public.job_history_daily_metrics.job_count + excluded.job_count,
    fetched_count =
      public.job_history_daily_metrics.fetched_count + excluded.fetched_count,
    inserted_count =
      public.job_history_daily_metrics.inserted_count + excluded.inserted_count,
    updated_count =
      public.job_history_daily_metrics.updated_count + excluded.updated_count,
    skipped_count =
      public.job_history_daily_metrics.skipped_count + excluded.skipped_count,
    last_aggregated_at = excluded.last_aggregated_at;

  get diagnostics v_metric_groups = row_count;

  -- Every delete predicate is explicitly terminal; pending and processing jobs
  -- are never retention candidates.
  with pruned as (
    delete from public.ingestion_jobs as job
    where (
      job.status = 'completed'
      and coalesce(job.completed_at, job.started_at)
        <= v_now - interval '14 days'
    ) or (
      job.status = 'failed'
      and coalesce(job.completed_at, job.started_at)
        <= v_now - interval '90 days'
    )
    returning job.id
  )
  select count(*)::integer into v_pruned_ingestion from pruned;

  with pruned as (
    delete from public.ai_jobs as job
    where (
      job.status = 'completed'
      and coalesce(job.completed_at, job.created_at)
        <= v_now - interval '30 days'
    ) or (
      job.status = 'failed'
      and coalesce(job.completed_at, job.created_at)
        <= v_now - interval '90 days'
    )
    returning job.id
  )
  select count(*)::integer into v_pruned_ai from pruned;

  v_result := jsonb_build_object(
    'status', 'completed',
    'runDay', v_run_day,
    'staleIngestionJobsFailed', v_stale_ingestion,
    'staleAiJobsFailed', v_stale_ai,
    'rawArticlesTerminalized', v_terminal_articles,
    'metricGroupsUpserted', v_metric_groups,
    'ingestionJobsPruned', v_pruned_ingestion,
    'aiJobsPruned', v_pruned_ai
  );

  update public.job_history_maintenance_state
  set
    last_run_day = v_run_day,
    last_run_at = v_now,
    last_result = v_result
  where singleton_key = true;

  return v_result;
end;
$$;

comment on function public.maintain_newspeek_job_history(timestamptz, boolean) is
  'Once-daily lease recovery, retry terminalization, UTC job rollup, and terminal-detail retention. Set p_force only for tests or manual maintenance.';

revoke all on function public.maintain_newspeek_job_history(timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.maintain_newspeek_job_history(timestamptz, boolean)
  to service_role;
