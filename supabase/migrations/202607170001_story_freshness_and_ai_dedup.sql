-- Separate publication, material-update and source-observation time. This
-- prevents a repeated/syndicated source from making an old event look new.
alter table public.story_clusters
  add column if not exists last_material_update_at timestamptz,
  add column if not exists last_source_seen_at timestamptz,
  add column if not exists lifecycle_status text not null default 'developing'
    check (lifecycle_status in ('developing','confirmed','updated','closed','corrected','disputed')),
  add column if not exists material_fingerprint text,
  add column if not exists summary_version integer not null default 1 check (summary_version > 0),
  add column if not exists summary_generated_at timestamptz,
  add column if not exists summary_metadata jsonb not null default '{}'::jsonb;

create or replace function public.story_material_fingerprint(
  story_payload jsonb,
  persisted_status text,
  persisted_facts jsonb,
  persisted_disputes jsonb
) returns text
language sql
immutable
set search_path = public
as $$
  with normalized_facts as (
    select coalesce(
      jsonb_agg(fact - 'sourceArticleIds' order by fact->>'text'),
      '[]'::jsonb
    ) as value
    from jsonb_array_elements(coalesce(story_payload->'agreedFacts', persisted_facts, '[]'::jsonb)) as fact
  ),
  normalized_disputes as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'topic', disputed->>'topic',
          'positions', normalized_positions.value
        ) order by disputed->>'topic'
      ),
      '[]'::jsonb
    ) as value
    from jsonb_array_elements(coalesce(story_payload->'disputedPoints', persisted_disputes, '[]'::jsonb)) as disputed
    left join lateral (
      select coalesce(
        jsonb_agg(claim_position - 'sourceArticleIds' order by claim_position->>'claim'),
        '[]'::jsonb
      ) as value
      from jsonb_array_elements(coalesce(disputed->'positions', '[]'::jsonb)) as claim_position
    ) as normalized_positions on true
  )
  select md5(concat_ws(chr(31),
    coalesce(story_payload->>'storyType', ''),
    coalesce(story_payload->>'status', persisted_status, ''),
    coalesce(story_payload->'linkedMatch', 'null'::jsonb)::text,
    coalesce(story_payload->'competition', 'null'::jsonb)::text,
    coalesce(story_payload->'teams', '[]'::jsonb)::text,
    coalesce(story_payload->'players', '[]'::jsonb)::text,
    normalized_facts.value::text,
    normalized_disputes.value::text
  ))
  from normalized_facts cross join normalized_disputes;
$$;

update public.story_clusters
set
  last_material_update_at = coalesce(
    last_material_update_at,
    (select max(article.published_at)
      from public.story_cluster_articles as link
      join public.raw_articles as article on article.id = link.raw_article_id
      where link.cluster_id = story_clusters.id
        and not link.is_syndicated),
    last_updated_at,
    first_published_at
  ),
  last_source_seen_at = coalesce(
    last_source_seen_at,
    (select max(article.fetched_at)
      from public.story_cluster_articles as link
      join public.raw_articles as article on article.id = link.raw_article_id
      where link.cluster_id = story_clusters.id),
    last_updated_at,
    first_published_at
  ),
  material_fingerprint = coalesce(
    material_fingerprint,
    public.story_material_fingerprint(payload, status, agreed_facts, disputed_points)
  ),
  summary_generated_at = case
    when ai_generated then coalesce(summary_generated_at, created_at, last_updated_at)
    else summary_generated_at
  end,
  lifecycle_status = case status
    when 'official' then 'confirmed'
    when 'reported' then 'confirmed'
    when 'completed' then 'closed'
    when 'correction' then 'corrected'
    when 'disputed' then 'disputed'
    else 'developing'
  end,
  summary_metadata = jsonb_strip_nulls(
    coalesce(summary_metadata, '{}'::jsonb) || jsonb_build_object(
      'version', summary_version,
      'aiGenerated', ai_generated,
      'provider', ai_provider,
      'reviewStatus', review_status,
      'generatedAt', case when ai_generated then coalesce(summary_generated_at, created_at, last_updated_at) else summary_generated_at end
    )
  );

alter table public.story_clusters
  alter column last_material_update_at set not null,
  alter column last_source_seen_at set not null;

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

drop trigger if exists story_clusters_freshness_metadata on public.story_clusters;
create trigger story_clusters_freshness_metadata
before insert or update on public.story_clusters
for each row execute function public.set_story_freshness_metadata();

create index if not exists story_clusters_material_update_idx
  on public.story_clusters(last_material_update_at desc, first_published_at desc);
create index if not exists story_clusters_source_seen_idx
  on public.story_clusters(last_source_seen_at desc);

-- Keep only one active AI job for the same story/task. Resolve pre-existing
-- duplicates deterministically before adding the partial unique index.
with ranked_active_jobs as (
  select id,
    row_number() over (
      partition by job_type, input_reference
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.ai_jobs
  where input_reference is not null
    and status in ('pending', 'processing')
)
update public.ai_jobs as job
set
  status = 'failed',
  error_message = coalesce(job.error_message, 'Superseded by an earlier active AI job during deduplication.'),
  completed_at = coalesce(job.completed_at, now())
from ranked_active_jobs as ranked
where job.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists ai_jobs_one_active_input_idx
  on public.ai_jobs(job_type, input_reference)
  where input_reference is not null
    and status in ('pending', 'processing');
