-- Phase 2: internal membership, normalized provider mappings and persisted story model.
create extension if not exists citext;

alter type public.follow_entity_type add value if not exists 'coach';
alter type public.follow_entity_type add value if not exists 'source';
alter type public.follow_entity_type add value if not exists 'journalist';
alter type public.follow_entity_type add value if not exists 'topic';

alter table public.profiles
  add column if not exists internal_role text not null default 'member' check (internal_role in ('owner','member'));

create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  role text not null default 'member' check (role in ('owner','member')),
  user_id uuid unique references auth.users(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_signed_in_at timestamptz
);

alter table public.news_sources
  add column if not exists country text,
  add column if not exists is_official boolean not null default false,
  add column if not exists fetch_interval_minutes integer not null default 15 check (fetch_interval_minutes between 5 and 1440),
  add column if not exists last_fetched_at timestamptz,
  add column if not exists last_error text,
  add column if not exists etag text,
  add column if not exists last_modified text;

alter table public.raw_articles
  add column if not exists canonical_url text,
  add column if not exists normalized_title text,
  add column if not exists language text not null default 'vi' check (language in ('vi','en'));

alter table public.matches
  add column if not exists provider text,
  add column if not exists provider_external_id text,
  add column if not exists source_timestamp timestamptz,
  add column if not exists data_freshness text not null default 'unknown' check (data_freshness in ('fresh','delayed','stale','unknown')),
  add column if not exists raw_metadata jsonb not null default '{}'::jsonb;

alter table public.standings
  add column if not exists provider text,
  add column if not exists source_timestamp timestamptz,
  add column if not exists data_freshness text not null default 'unknown' check (data_freshness in ('fresh','delayed','stale','unknown')),
  add column if not exists raw_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists matches_provider_external_idx
  on public.matches(provider, provider_external_id) where provider_external_id is not null;

create table public.story_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  slug text not null unique,
  title text not null,
  summary text,
  key_points jsonb not null default '[]'::jsonb,
  agreed_facts jsonb not null default '[]'::jsonb,
  disputed_points jsonb not null default '[]'::jsonb,
  status text not null default 'unverified' check (status in ('official','reported','rumor','disputed','unverified','developing','completed','correction')),
  hotness_score smallint check (hotness_score between 0 and 100),
  reliability_score smallint check (reliability_score between 0 and 100),
  sport_id uuid references public.sports(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  primary_team_id uuid references public.teams(id) on delete set null,
  primary_player_id uuid references public.players(id) on delete set null,
  linked_match_id uuid references public.matches(id) on delete set null,
  first_published_at timestamptz not null,
  last_updated_at timestamptz not null,
  ai_generated boolean not null default false,
  ai_provider text,
  review_status text not null default 'pending' check (review_status in ('pending','auto','reviewed')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.story_cluster_articles (
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  raw_article_id uuid not null references public.raw_articles(id) on delete cascade,
  similarity_score numeric(5,4) check (similarity_score between 0 and 1),
  is_primary_source boolean not null default false,
  is_syndicated boolean not null default false,
  primary key (cluster_id, raw_article_id)
);

create table public.story_entities (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  entity_type text not null check (entity_type in ('competition','team','player','coach','match','topic')),
  entity_id uuid,
  label text,
  relevance_score numeric(5,4) not null default 1 check (relevance_score between 0 and 1)
);

create table public.story_timeline (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.story_clusters(id) on delete cascade,
  occurred_at timestamptz not null,
  update_type text not null default 'source_update',
  content text not null,
  supporting_article_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.provider_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  entity_type text not null check (entity_type in ('sport','competition','team','player','match')),
  internal_id uuid not null,
  external_id text not null,
  season text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, entity_type, external_id, season),
  unique(provider, entity_type, internal_id, season)
);

create table public.entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('competition','team','player','coach')),
  internal_id uuid not null,
  alias text not null,
  normalized_alias text not null,
  language text,
  country text,
  created_at timestamptz not null default now(),
  unique(entity_type, normalized_alias, internal_id)
);

create table public.competition_provider_config (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  capability text not null,
  primary_provider text not null,
  fallback_providers text[] not null default '{}',
  season text not null default '',
  active boolean not null default true,
  cache_ttl_seconds integer not null default 300 check (cache_ttl_seconds between 10 and 86400),
  metadata jsonb not null default '{}'::jsonb,
  unique(competition_id, capability, season)
);

create table public.provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  capability text not null,
  supported boolean not null default false,
  verified_at timestamptz,
  limits jsonb not null default '{}'::jsonb,
  notes text,
  unique(provider, capability)
);

create table public.provider_sync_state (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  capability text not null,
  competition_id uuid references public.competitions(id) on delete cascade,
  season text not null default '',
  cursor jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  next_sync_at timestamptz,
  unique(provider, capability, competition_id, season)
);

create table public.provider_conflicts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  internal_id uuid,
  capability text not null,
  providers text[] not null,
  values jsonb not null,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  resolution jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  provider text,
  source_id uuid references public.news_sources(id) on delete set null,
  status public.job_status not null default 'pending',
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.bookmarks alter column news_cluster_id drop not null;
alter table public.bookmarks add column if not exists story_cluster_id uuid references public.story_clusters(id) on delete cascade;
alter table public.reading_history alter column news_cluster_id drop not null;
alter table public.reading_history add column if not exists story_cluster_id uuid references public.story_clusters(id) on delete cascade;
create unique index if not exists bookmarks_user_story_idx on public.bookmarks(user_id, story_cluster_id) where story_cluster_id is not null;

create index story_clusters_updated_idx on public.story_clusters(last_updated_at desc);
create index story_clusters_hotness_idx on public.story_clusters(hotness_score desc nulls last, last_updated_at desc);
create index story_cluster_articles_article_idx on public.story_cluster_articles(raw_article_id);
create index story_timeline_cluster_idx on public.story_timeline(cluster_id, occurred_at);
create index provider_mappings_internal_idx on public.provider_entity_mappings(entity_type, internal_id);
create index aliases_normalized_idx on public.entity_aliases(entity_type, normalized_alias);
create index provider_sync_due_idx on public.provider_sync_state(next_sync_at) where next_sync_at is not null;
create index ingestion_jobs_status_idx on public.ingestion_jobs(status, started_at desc);

create or replace function public.is_internal_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email::text) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users au
    where lower(au.email::text) = lower(coalesce(auth.jwt()->>'email','')) and au.role = 'owner'
  );
$$;

revoke all on function public.is_internal_member() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_internal_member(), public.is_owner() to authenticated;

alter table public.allowed_users enable row level security;
alter table public.story_clusters enable row level security;
alter table public.story_cluster_articles enable row level security;
alter table public.story_entities enable row level security;
alter table public.story_timeline enable row level security;
alter table public.provider_entity_mappings enable row level security;
alter table public.entity_aliases enable row level security;
alter table public.competition_provider_config enable row level security;
alter table public.provider_capabilities enable row level security;
alter table public.provider_sync_state enable row level security;
alter table public.provider_conflicts enable row level security;
alter table public.ingestion_jobs enable row level security;

drop policy if exists "sports public read" on public.sports;
drop policy if exists "competitions public read" on public.competitions;
drop policy if exists "teams public read" on public.teams;
drop policy if exists "competition teams public read" on public.competition_teams;
drop policy if exists "players public read" on public.players;
drop policy if exists "matches public read" on public.matches;
drop policy if exists "match events public read" on public.match_events;
drop policy if exists "match stats public read" on public.match_statistics;
drop policy if exists "standings public read" on public.standings;
drop policy if exists "sources public read" on public.news_sources;
drop policy if exists "clusters public read" on public.news_clusters;
drop policy if exists "cluster articles public read" on public.news_cluster_articles;
drop policy if exists "news entities public read" on public.news_entities;
drop policy if exists "transfers public read" on public.transfers;

create policy "allowed user self read" on public.allowed_users for select to authenticated using (lower(email::text) = lower(coalesce(auth.jwt()->>'email','')) or public.is_owner());
create policy "allowed users owner manage" on public.allowed_users for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "members read sports" on public.sports for select to authenticated using (public.is_internal_member());
create policy "members read competitions" on public.competitions for select to authenticated using (public.is_internal_member());
create policy "members read teams" on public.teams for select to authenticated using (public.is_internal_member());
create policy "members read competition teams" on public.competition_teams for select to authenticated using (public.is_internal_member());
create policy "members read players" on public.players for select to authenticated using (public.is_internal_member());
create policy "members read matches" on public.matches for select to authenticated using (public.is_internal_member());
create policy "members read match events" on public.match_events for select to authenticated using (public.is_internal_member());
create policy "members read match statistics" on public.match_statistics for select to authenticated using (public.is_internal_member());
create policy "members read standings" on public.standings for select to authenticated using (public.is_internal_member());
create policy "members read sources" on public.news_sources for select to authenticated using (public.is_internal_member());
create policy "members read raw articles" on public.raw_articles for select to authenticated using (public.is_internal_member());
create policy "members read legacy clusters" on public.news_clusters for select to authenticated using (public.is_internal_member());
create policy "members read legacy cluster articles" on public.news_cluster_articles for select to authenticated using (public.is_internal_member());
create policy "members read legacy story entities" on public.news_entities for select to authenticated using (public.is_internal_member());
create policy "members read transfers" on public.transfers for select to authenticated using (public.is_internal_member());
create policy "members read story clusters" on public.story_clusters for select to authenticated using (public.is_internal_member());
create policy "members read story articles" on public.story_cluster_articles for select to authenticated using (public.is_internal_member());
create policy "members read story entities" on public.story_entities for select to authenticated using (public.is_internal_member());
create policy "members read story timeline" on public.story_timeline for select to authenticated using (public.is_internal_member());
create policy "members read provider mappings" on public.provider_entity_mappings for select to authenticated using (public.is_internal_member());
create policy "members read aliases" on public.entity_aliases for select to authenticated using (public.is_internal_member());
create policy "members read provider config" on public.competition_provider_config for select to authenticated using (public.is_internal_member());
create policy "members read provider capabilities" on public.provider_capabilities for select to authenticated using (public.is_internal_member());

drop policy if exists "follows own select" on public.user_follows;
drop policy if exists "follows own insert" on public.user_follows;
drop policy if exists "follows own delete" on public.user_follows;
drop policy if exists "bookmarks own select" on public.bookmarks;
drop policy if exists "bookmarks own insert" on public.bookmarks;
drop policy if exists "bookmarks own delete" on public.bookmarks;
drop policy if exists "history own select" on public.reading_history;
drop policy if exists "history own insert" on public.reading_history;
drop policy if exists "notification own select" on public.notification_preferences;
drop policy if exists "notification own insert" on public.notification_preferences;
drop policy if exists "notification own update" on public.notification_preferences;
drop policy if exists "telegram own manage" on public.telegram_connections;

create policy "members own follows" on public.user_follows for all to authenticated using (user_id = auth.uid() and public.is_internal_member()) with check (user_id = auth.uid() and public.is_internal_member());
create policy "members own bookmarks" on public.bookmarks for all to authenticated using (user_id = auth.uid() and public.is_internal_member()) with check (user_id = auth.uid() and public.is_internal_member());
create policy "members own history" on public.reading_history for all to authenticated using (user_id = auth.uid() and public.is_internal_member()) with check (user_id = auth.uid() and public.is_internal_member());
create policy "members own notifications" on public.notification_preferences for all to authenticated using (user_id = auth.uid() and public.is_internal_member()) with check (user_id = auth.uid() and public.is_internal_member());
create policy "members own telegram" on public.telegram_connections for all to authenticated using (user_id = auth.uid() and public.is_internal_member()) with check (user_id = auth.uid() and public.is_internal_member());

grant select on public.allowed_users, public.story_clusters, public.story_cluster_articles, public.story_entities, public.story_timeline, public.provider_entity_mappings, public.entity_aliases, public.competition_provider_config, public.provider_capabilities to authenticated;
grant select, insert, update, delete on public.allowed_users to authenticated;

