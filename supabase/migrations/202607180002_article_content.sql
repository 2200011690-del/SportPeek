-- Optional full-reader cache. Metadata ingestion remains independent so a
-- publisher page failure can never block a fresh headline from entering the
-- story queue.
alter table public.raw_articles
  add column if not exists full_content text,
  add column if not exists content_status text not null default 'source_only',
  add column if not exists content_source text,
  add column if not exists content_fetched_at timestamptz,
  add column if not exists content_word_count integer not null default 0,
  add column if not exists content_error text,
  add column if not exists content_lease_expires_at timestamptz;

alter table public.raw_articles
  alter column content_status set default 'source_only';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_articles_content_status_check'
      and conrelid = 'public.raw_articles'::regclass
  ) then
    alter table public.raw_articles
      add constraint raw_articles_content_status_check
      check (content_status in ('pending','processing','available','source_only','failed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_articles_content_source_check'
      and conrelid = 'public.raw_articles'::regclass
  ) then
    alter table public.raw_articles
      add constraint raw_articles_content_source_check
      check (content_source is null or content_source in ('rss','publisher'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'raw_articles_content_word_count_check'
      and conrelid = 'public.raw_articles'::regclass
  ) then
    alter table public.raw_articles
      add constraint raw_articles_content_word_count_check
      check (content_word_count >= 0);
  end if;
end
$$;

update public.raw_articles
set
  content_status = 'available',
  content_word_count = greatest(
    content_word_count,
    array_length(regexp_split_to_array(trim(full_content), '\s+'), 1)
  )
where full_content is not null
  and char_length(trim(full_content)) > 0;

update public.raw_articles
set content_status = 'source_only'
where full_content is null
  and content_status = 'pending';

create index if not exists raw_articles_content_pending_idx
  on public.raw_articles(published_at desc)
  where content_status in ('pending','failed');

create index if not exists raw_articles_content_lease_idx
  on public.raw_articles(content_lease_expires_at)
  where content_status = 'processing';
