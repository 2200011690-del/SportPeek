-- Migration: 202607180003_story_queue_backoff
-- Add backoff and retry limits to raw article story queue processing

alter table public.raw_articles
  add column if not exists processing_retry_after timestamptz;

-- Recreate recover_story_processing_queue
create or replace function public.recover_story_processing_queue(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recovered_links integer := 0;
  released_leases integer := 0;
  retired_articles integer := 0;
  completed_jobs integer := 0;
  failed_jobs integer := 0;
begin
  -- A persisted link means the expensive story write already succeeded. This
  -- repairs rows left pending/processing when a Worker died before finalizing.
  with recovered as (
    update public.raw_articles as article
    set
      processing_status = 'completed',
      processing_lease_expires_at = null,
      processing_error = null,
      processing_retry_after = null
    where article.processing_status <> 'completed'
      and exists (
        select 1
        from public.story_cluster_articles as link
        where link.raw_article_id = article.id
      )
    returning article.id
  )
  select count(*) into recovered_links from recovered;

  -- Sources intentionally disabled by editors must never consume backlog slots.
  with retired as (
    update public.raw_articles as article
    set
      processing_status = 'failed',
      processing_lease_expires_at = null,
      processing_error = 'Source is inactive; article retired from story queue.'
    from public.news_sources as source
    where source.id = article.source_id
      and not source.is_active
      and article.processing_status in ('pending', 'processing')
    returning article.id
  )
  select count(*) into retired_articles from retired;

  -- Unlinked work from a dead Worker becomes pending again after its lease.
  -- But we now mark it as failed with backoff and retry limitations so we don't
  -- crash-loop infinitely on malicious or failing articles.
  with released as (
    update public.raw_articles as article
    set
      processing_status = 'failed',
      processing_job_id = null,
      processing_claimed_at = null,
      processing_lease_expires_at = null,
      processing_error = 'Previous story-processing lease expired.',
      processing_retry_after = now() + (interval '2 minutes' * power(2, least(article.processing_attempts, 4))) * (0.8 + 0.4 * random())
    from public.news_sources as source
    where source.id = article.source_id
      and source.is_active
      and article.processing_status = 'processing'
      and (
        article.processing_lease_expires_at is null
        or article.processing_lease_expires_at <= p_now
      )
      and not exists (
        select 1
        from public.story_cluster_articles as link
        where link.raw_article_id = article.id
      )
    returning article.id
  )
  select count(*) into released_leases from released;

  -- If every claimed row reached a story link before a crash, the job itself
  -- can be recovered as completed instead of reporting a false failure.
  with completed as (
    update public.ingestion_jobs as job
    set
      status = 'completed',
      completed_at = coalesce(job.completed_at, p_now),
      error_code = null,
      error_message = null,
      metadata = coalesce(job.metadata, '{}'::jsonb) || jsonb_build_object(
        'recoveredAt', p_now,
        'recovery', 'all claimed articles already persisted'
      )
    where job.job_type = 'stories:process'
      and job.status = 'processing'
      and job.started_at < p_now - interval '10 minutes'
      and job.fetched_count > 0
      and (
        select count(*)
        from public.raw_articles as article
        where article.processing_job_id = job.id
          and article.processing_status = 'completed'
      ) >= job.fetched_count
    returning job.id
  )
  select count(*) into completed_jobs from completed;

  with failed as (
    update public.ingestion_jobs as job
    set
      status = 'failed',
      completed_at = coalesce(job.completed_at, p_now),
      error_code = coalesce(job.error_code, 'STORY_JOB_LEASE_EXPIRED'),
      error_message = coalesce(job.error_message, 'Story-processing Worker stopped before completion.'),
      metadata = coalesce(job.metadata, '{}'::jsonb) || jsonb_build_object('recoveredAt', p_now)
    where job.job_type = 'stories:process'
      and job.status = 'processing'
      and job.started_at < p_now - interval '10 minutes'
    returning job.id
  )
  select count(*) into failed_jobs from failed;

  return jsonb_build_object(
    'recoveredLinkedArticles', recovered_links,
    'releasedLeases', released_leases,
    'retiredArticles', retired_articles,
    'completedJobs', completed_jobs,
    'failedJobs', failed_jobs
  );
end;
$$;

-- Recreate claim_story_processing_batch
create or replace function public.claim_story_processing_batch(
  p_job_id uuid,
  p_limit integer default 8,
  p_oldest_first boolean default false,
  p_include_failed boolean default false,
  p_lease_seconds integer default 240
) returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.ingestion_jobs as job
    where job.id = p_job_id
      and job.job_type = 'stories:process'
      and job.status = 'processing'
  ) then
    raise exception 'Active stories:process ingestion job % does not exist', p_job_id;
  end if;

  perform public.recover_story_processing_queue(now());

  return query
  with candidates as (
    select article.id
    from public.raw_articles as article
    join public.news_sources as source on source.id = article.source_id
    where source.is_active
      and (
        article.processing_status = 'pending'
        or (p_include_failed and article.processing_status = 'failed')
      )
      and (article.processing_retry_after is null or article.processing_retry_after <= now())
      and article.processing_attempts < 5
      and not exists (
        select 1
        from public.story_cluster_articles as link
        where link.raw_article_id = article.id
      )
    order by
      case when p_oldest_first then article.published_at end asc,
      case when not p_oldest_first then article.published_at end desc,
      article.id asc
    limit greatest(1, least(coalesce(p_limit, 8), 1000))
    for update of article skip locked
  ), claimed as (
    update public.raw_articles as article
    set
      processing_status = 'processing',
      processing_job_id = p_job_id,
      processing_claimed_at = now(),
      processing_lease_expires_at = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 240), 3600))),
      processing_attempts = article.processing_attempts + 1,
      processing_error = null
    from candidates
    where article.id = candidates.id
    returning article.id
  )
  select claimed.id from claimed;
end;
$$;

-- Recreate finish_story_processing_job
create or replace function public.finish_story_processing_job(
  p_job_id uuid,
  p_succeeded_ids uuid[] default '{}'::uuid[],
  p_failed_ids uuid[] default '{}'::uuid[],
  p_summary jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_articles integer := 0;
  failed_articles integer := 0;
  final_status public.job_status;
begin
  -- Persisted links win even if the caller reports a later subrequest error.
  with completed as (
    update public.raw_articles as article
    set
      processing_status = 'completed',
      processing_lease_expires_at = null,
      processing_error = null,
      processing_retry_after = null
    where article.processing_job_id = p_job_id
      and (
        article.id = any(coalesce(p_succeeded_ids, '{}'::uuid[]))
        or exists (
          select 1
          from public.story_cluster_articles as link
          where link.raw_article_id = article.id
        )
      )
      and exists (
        select 1
        from public.story_cluster_articles as link
        where link.raw_article_id = article.id
      )
    returning article.id
  )
  select count(*) into completed_articles from completed;

  with failed as (
    update public.raw_articles as article
    set
      processing_status = 'failed',
      processing_lease_expires_at = null,
      processing_error = left(coalesce(p_error_message, 'Story could not be persisted.'), 1000),
      processing_retry_after = now() + (interval '2 minutes' * power(2, least(article.processing_attempts, 4))) * (0.8 + 0.4 * random())
    where article.processing_job_id = p_job_id
      and article.processing_status = 'processing'
      and (
        article.id = any(coalesce(p_failed_ids, '{}'::uuid[]))
        or not exists (
          select 1
          from public.story_cluster_articles as link
          where link.raw_article_id = article.id
        )
      )
    returning article.id
  )
  select count(*) into failed_articles from failed;

  final_status := case
    when p_error_code is not null or p_error_message is not null or failed_articles > 0
      then 'failed'::public.job_status
    else 'completed'::public.job_status
  end;

  update public.ingestion_jobs as job
  set
    status = final_status,
    fetched_count = coalesce((p_summary->>'inputArticles')::integer, job.fetched_count),
    inserted_count = coalesce((p_summary->>'createdClusters')::integer, job.inserted_count),
    updated_count = coalesce((p_summary->>'updatedClusters')::integer, job.updated_count),
    skipped_count = coalesce((p_summary->>'failedArticles')::integer, failed_articles),
    error_code = case when final_status = 'failed' then coalesce(p_error_code, 'PARTIAL_FAILURE') else null end,
    error_message = case when final_status = 'failed' then left(coalesce(p_error_message, 'One or more stories failed.'), 1000) else null end,
    metadata = coalesce(job.metadata, '{}'::jsonb) || coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
      'completedArticles', completed_articles,
      'failedArticlesFinalized', failed_articles
    ),
    completed_at = coalesce(job.completed_at, now())
  where job.id = p_job_id
    and job.job_type = 'stories:process';

  return jsonb_build_object(
    'status', final_status,
    'completedArticles', completed_articles,
    'failedArticles', failed_articles
  );
end;
$$;

revoke all on function public.recover_story_processing_queue(timestamptz) from public;
revoke all on function public.claim_story_processing_batch(uuid, integer, boolean, boolean, integer) from public;
revoke all on function public.finish_story_processing_job(uuid, uuid[], uuid[], jsonb, text, text) from public;

grant execute on function public.recover_story_processing_queue(timestamptz) to service_role;
grant execute on function public.claim_story_processing_batch(uuid, integer, boolean, boolean, integer) to service_role;
grant execute on function public.finish_story_processing_job(uuid, uuid[], uuid[], jsonb, text, text) to service_role;

select public.recover_story_processing_queue(now());
