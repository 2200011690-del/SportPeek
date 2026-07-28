-- Tighten typo matching so a short misspelling does not turn the entire archive
-- into candidates. Exact full-text and trigram matches remain unchanged.

create or replace function public.search_story_clusters(
  p_query text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_category text default null,
  p_source text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_language text default null,
  p_geography text default null,
  p_min_hotness integer default 0,
  p_sort text default null
)
returns table (
  id uuid,
  slug text,
  payload jsonb,
  first_published_at timestamptz,
  last_material_update_at timestamptz,
  last_source_seen_at timestamptz,
  last_updated_at timestamptz,
  lifecycle_status text,
  summary_version integer,
  summary_generated_at timestamptz,
  ai_generated boolean,
  ai_provider text,
  search_rank double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select public.normalize_news_search_text(p_query) as query_text
  ),
  candidates as (
    select
      story.id,
      story.slug,
      story.payload,
      story.first_published_at,
      story.last_material_update_at,
      story.last_source_seen_at,
      story.last_updated_at,
      story.lifecycle_status,
      story.summary_version,
      story.summary_generated_at,
      story.ai_generated,
      story.ai_provider,
      coalesce(story.hotness_score, 0) as sort_hotness,
      coalesce(story.reliability_score, 0) as sort_reliability,
      (
        ts_rank_cd(
          to_tsvector('simple', coalesce(story.search_text, '')),
          plainto_tsquery('simple', input.query_text)
        ) * 5
        + public.similarity(coalesce(story.search_text, ''), input.query_text) * 2
        + public.word_similarity(input.query_text, coalesce(story.search_text, '')) * 3
        + case
            when coalesce(story.search_text, '') like input.query_text || '%' then 2
            when coalesce(story.search_text, '') like '%' || input.query_text || '%' then 1
            else 0
          end
        + coalesce(story.reliability_score, 50)::double precision / 250
        + coalesce(story.hotness_score, 0)::double precision / 500
        + greatest(
            0,
            1 - extract(epoch from (
              now() - coalesce(story.last_material_update_at, story.first_published_at)
            )) / 604800
          ) * 0.75
      )::double precision as search_rank
    from public.story_clusters story
    cross join input
    where input.query_text <> ''
      and (
        to_tsvector('simple', coalesce(story.search_text, ''))
          @@ plainto_tsquery('simple', input.query_text)
        or coalesce(story.search_text, '') operator(public.%) input.query_text
        or public.word_similarity(input.query_text, coalesce(story.search_text, '')) >= 0.38
      )
      and (p_category is null or story.category = p_category)
      and (
        p_source is null
        or public.normalize_news_search_text(p_source) = any (
          select public.normalize_news_search_text(source_name)
          from unnest(coalesce(story.source_names, array[]::text[])) as sources(source_name)
        )
      )
      and (p_date_from is null or story.first_published_at >= p_date_from)
      and (p_date_to is null or story.first_published_at <= p_date_to)
      and (p_language is null or story.language = p_language)
      and (p_geography is null or story.geography = p_geography)
      and coalesce(story.hotness_score, 0) >= greatest(0, least(100, p_min_hotness))
  )
  select
    candidates.id,
    candidates.slug,
    candidates.payload,
    candidates.first_published_at,
    candidates.last_material_update_at,
    candidates.last_source_seen_at,
    candidates.last_updated_at,
    candidates.lifecycle_status,
    candidates.summary_version,
    candidates.summary_generated_at,
    candidates.ai_generated,
    candidates.ai_provider,
    candidates.search_rank,
    count(*) over() as total_count
  from candidates
  order by
    case when p_sort = 'hotness' then candidates.sort_hotness end desc nulls last,
    case when p_sort = 'reliability' then candidates.sort_reliability end desc nulls last,
    case when p_sort = 'freshness' then coalesce(candidates.last_material_update_at, candidates.first_published_at) end desc nulls last,
    candidates.search_rank desc,
    coalesce(candidates.last_material_update_at, candidates.first_published_at) desc
  limit greatest(1, least(48, p_limit))
  offset greatest(0, p_offset);
$$;

