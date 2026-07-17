-- Repair freshness values written by the first rollout and make the processor's
-- evidence fingerprint authoritative. fetched_at is observation time only and
-- must never make an old event appear materially new.
drop trigger if exists story_clusters_freshness_metadata on public.story_clusters;

update public.story_clusters as cluster
set
  last_material_update_at = greatest(
    cluster.first_published_at,
    coalesce(
      (select max(article.published_at)
        from public.story_cluster_articles as link
        join public.raw_articles as article on article.id = link.raw_article_id
        where link.cluster_id = cluster.id
          and not link.is_syndicated),
      cluster.last_updated_at,
      cluster.first_published_at
    )
  ),
  last_source_seen_at = greatest(
    cluster.last_source_seen_at,
    coalesce(
      (select max(article.fetched_at)
        from public.story_cluster_articles as link
        join public.raw_articles as article on article.id = link.raw_article_id
        where link.cluster_id = cluster.id),
      cluster.last_updated_at,
      cluster.first_published_at
    )
  );

create or replace function public.set_story_freshness_metadata()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_fingerprint text;
  material_changed boolean;
  summary_changed boolean;
  observed_source_at timestamptz;
begin
  next_fingerprint := coalesce(
    new.material_fingerprint,
    public.story_material_fingerprint(new.payload, new.status, new.agreed_facts, new.disputed_points)
  );
  select max((article->>'fetchedAt')::timestamptz)
  into observed_source_at
  from jsonb_array_elements(coalesce(new.payload->'articles', '[]'::jsonb)) as article
  where article->>'fetchedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';

  if tg_op = 'INSERT' then
    new.last_material_update_at := coalesce(
      new.last_material_update_at,
      new.last_updated_at,
      new.first_published_at
    );
    new.last_source_seen_at := coalesce(
      new.last_source_seen_at,
      observed_source_at,
      new.last_updated_at,
      new.first_published_at
    );
    new.summary_version := greatest(coalesce(new.summary_version, 1), 1);
    if new.ai_generated then
      new.summary_generated_at := coalesce(new.summary_generated_at, now());
    end if;
  else
    material_changed := next_fingerprint is distinct from old.material_fingerprint;
    summary_changed := new.summary is distinct from old.summary
      or new.key_points is distinct from old.key_points
      or new.ai_generated is distinct from old.ai_generated
      or new.ai_provider is distinct from old.ai_provider;

    new.last_source_seen_at := greatest(
      coalesce(old.last_source_seen_at, '-infinity'::timestamptz),
      coalesce(new.last_source_seen_at, '-infinity'::timestamptz),
      coalesce(observed_source_at, '-infinity'::timestamptz),
      coalesce(new.last_updated_at, '-infinity'::timestamptz),
      new.first_published_at
    );

    if material_changed then
      new.last_material_update_at := greatest(
        coalesce(old.last_material_update_at, '-infinity'::timestamptz),
        coalesce(new.last_updated_at, '-infinity'::timestamptz),
        new.first_published_at
      );
    else
      new.last_material_update_at := old.last_material_update_at;
    end if;

    if summary_changed then
      new.summary_version := greatest(coalesce(old.summary_version, 1) + 1, 2);
      if new.ai_generated then
        new.summary_generated_at := now();
      end if;
    else
      new.summary_version := old.summary_version;
      new.summary_generated_at := old.summary_generated_at;
    end if;
  end if;

  new.material_fingerprint := next_fingerprint;
  new.lifecycle_status := case new.status
    when 'official' then case when tg_op = 'UPDATE' and material_changed then 'updated' else 'confirmed' end
    when 'reported' then case when tg_op = 'UPDATE' and material_changed then 'updated' else 'confirmed' end
    when 'completed' then 'closed'
    when 'correction' then 'corrected'
    when 'disputed' then 'disputed'
    else 'developing'
  end;
  new.summary_metadata := jsonb_strip_nulls(
    coalesce(new.summary_metadata, '{}'::jsonb) || jsonb_build_object(
      'version', new.summary_version,
      'aiGenerated', new.ai_generated,
      'provider', new.ai_provider,
      'reviewStatus', new.review_status,
      'generatedAt', new.summary_generated_at
    )
  );
  return new;
end;
$$;

create trigger story_clusters_freshness_metadata
before insert or update on public.story_clusters
for each row execute function public.set_story_freshness_metadata();

create index if not exists raw_articles_pending_published_idx
  on public.raw_articles(published_at desc)
  where processing_status = 'pending';

create index if not exists ai_jobs_summary_retry_idx
  on public.ai_jobs(input_reference, created_at desc)
  where job_type = 'summarize_cluster';
