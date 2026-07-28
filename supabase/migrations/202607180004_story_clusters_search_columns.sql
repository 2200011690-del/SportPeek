-- Migration: 202607180004_story_clusters_search_columns
-- Add search text, category, language, geography, region, and source names columns to story_clusters

alter table public.story_clusters
  add column if not exists search_text text,
  add column if not exists category text,
  add column if not exists language text,
  add column if not exists geography text,
  add column if not exists region text,
  add column if not exists source_names text[];

-- Enable trigram extension for accent-insensitive and case-insensitive substring searching
create extension if not exists pg_trgm;

-- Create indexes
create index if not exists story_clusters_search_text_trgm_idx on public.story_clusters using gin (search_text gin_trgm_ops);
create index if not exists story_clusters_category_idx on public.story_clusters (category);
create index if not exists story_clusters_language_idx on public.story_clusters (language);
create index if not exists story_clusters_region_idx on public.story_clusters (region);
create index if not exists story_clusters_source_names_gin_idx on public.story_clusters using gin (source_names);

-- Backfill from existing JSON payloads
update public.story_clusters
set
  category = coalesce(payload->>'category', 'Việt Nam'),
  language = coalesce(payload->>'language', 'vi'),
  region = coalesce(payload->>'region', case when payload->>'language' = 'en' then 'Thế giới' else 'Việt Nam' end),
  source_names = array(
    select jsonb_array_elements_text(coalesce(payload->'sourceNames', '[]'::jsonb))
  );
