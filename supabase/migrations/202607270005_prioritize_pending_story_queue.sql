-- Prevent years-old retryable failures from starving pending articles.
-- Historical failures remain stored for audit, but only failures fetched in
-- the last seven days are eligible for automatic retry. Pending rows always
-- win before retry candidates.

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
        or (
          p_include_failed
          and article.processing_status = 'failed'
          and article.fetched_at >= now() - interval '7 days'
        )
      )
      and (article.processing_retry_after is null or article.processing_retry_after <= now())
      and article.processing_attempts < 5
      and not exists (
        select 1
        from public.story_cluster_articles as link
        where link.raw_article_id = article.id
      )
    order by
      case when article.processing_status = 'pending' then 0 else 1 end,
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
      processing_lease_expires_at = now() + make_interval(
        secs => greatest(60, least(coalesce(p_lease_seconds, 240), 3600))
      ),
      processing_attempts = article.processing_attempts + 1,
      processing_error = null
    from candidates
    where article.id = candidates.id
    returning article.id
  )
  select claimed.id from claimed;
end;
$$;

revoke all on function public.claim_story_processing_batch(
  uuid, integer, boolean, boolean, integer
) from public;
grant execute on function public.claim_story_processing_batch(
  uuid, integer, boolean, boolean, integer
) to service_role;

