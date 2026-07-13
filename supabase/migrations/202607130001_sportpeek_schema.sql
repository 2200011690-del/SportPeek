-- SportPeek Supabase PostgreSQL schema, indexes, triggers and RLS.
create extension if not exists pgcrypto;
create extension if not exists unaccent;

create type public.app_role as enum ('user', 'editor', 'admin');
create type public.match_status as enum ('scheduled', 'live', 'paused', 'finished', 'postponed', 'cancelled');
create type public.cluster_status as enum ('draft', 'review', 'published', 'archived');
create type public.job_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.transfer_status as enum ('rumor', 'negotiating', 'confirmed', 'cancelled');
create type public.follow_entity_type as enum ('sport', 'competition', 'team', 'player');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 2 and 80),
  avatar_url text,
  role public.app_role not null default 'user',
  preferred_language text not null default 'vi' check (preferred_language in ('vi','en')),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  is_active boolean not null default true
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  name text not null,
  slug text not null unique,
  country text,
  logo_url text,
  current_season text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  name text not null,
  short_name text not null,
  slug text not null unique,
  country text,
  logo_url text,
  stadium text,
  founded_year smallint check (founded_year between 1800 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competition_teams (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  season text not null,
  primary key (competition_id, team_id, season)
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  slug text not null unique,
  image_url text,
  nationality text,
  date_of_birth date,
  position text,
  shirt_number smallint check (shirt_number between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  season text not null,
  home_team_id uuid not null references public.teams(id) on delete restrict,
  away_team_id uuid not null references public.teams(id) on delete restrict,
  start_time timestamptz not null,
  status public.match_status not null default 'scheduled',
  minute smallint check (minute between 0 and 200),
  home_score smallint not null default 0 check (home_score >= 0),
  away_score smallint not null default 0 check (away_score >= 0),
  venue text,
  referee text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  unique (competition_id, external_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  related_player_id uuid references public.players(id) on delete set null,
  event_type text not null check (event_type in ('goal','own_goal','penalty','yellow_card','red_card','substitution','var','period')),
  minute smallint not null check (minute between 0 and 200),
  extra_minute smallint check (extra_minute between 0 and 30),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.match_statistics (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  possession numeric(5,2) check (possession between 0 and 100),
  shots smallint check (shots >= 0),
  shots_on_target smallint check (shots_on_target >= 0),
  corners smallint check (corners >= 0),
  fouls smallint check (fouls >= 0),
  yellow_cards smallint check (yellow_cards >= 0),
  red_cards smallint check (red_cards >= 0),
  expected_goals numeric(6,2) check (expected_goals >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique(match_id, team_id)
);

create table public.standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  season text not null,
  position smallint not null check (position > 0),
  played smallint not null default 0,
  won smallint not null default 0,
  drawn smallint not null default 0,
  lost smallint not null default 0,
  goals_for smallint not null default 0,
  goals_against smallint not null default 0,
  goal_difference smallint generated always as (goals_for - goals_against) stored,
  points smallint not null default 0,
  form text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (competition_id, team_id, season),
  unique (competition_id, season, position)
);

create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  rss_url text,
  logo_url text,
  language text not null default 'vi',
  reliability_score smallint not null default 50 check (reliability_score between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.raw_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete restrict,
  external_id text,
  original_url text not null,
  title text not null,
  excerpt text check (char_length(excerpt) <= 1000),
  author text,
  image_url text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  raw_metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  processing_status public.job_status not null default 'pending',
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,''))) stored,
  unique (source_id, external_id),
  unique (original_url),
  unique (content_hash)
);

create table public.news_clusters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text,
  key_points jsonb not null default '[]'::jsonb,
  image_url text,
  sport_id uuid references public.sports(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  primary_team_id uuid references public.teams(id) on delete set null,
  primary_player_id uuid references public.players(id) on delete set null,
  hotness_score smallint not null default 0 check (hotness_score between 0 and 100),
  reliability_score smallint not null default 0 check (reliability_score between 0 and 100),
  status public.cluster_status not null default 'draft',
  first_published_at timestamptz not null,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,''))) stored
);

create table public.news_cluster_articles (
  cluster_id uuid not null references public.news_clusters(id) on delete cascade,
  raw_article_id uuid not null references public.raw_articles(id) on delete cascade,
  similarity_score numeric(5,4) check (similarity_score between 0 and 1),
  is_primary_source boolean not null default false,
  primary key (cluster_id, raw_article_id)
);

create table public.news_entities (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.news_clusters(id) on delete cascade,
  entity_type text not null check (entity_type in ('team','player','competition','topic')),
  entity_id uuid,
  topic text,
  relevance_score numeric(5,4) not null default 1 check (relevance_score between 0 and 1),
  check ((entity_type = 'topic' and topic is not null and entity_id is null) or (entity_type <> 'topic' and entity_id is not null and topic is null))
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  from_team_id uuid references public.teams(id) on delete set null,
  to_team_id uuid references public.teams(id) on delete set null,
  transfer_type text not null default 'permanent',
  fee_text text,
  status public.transfer_status not null default 'rumor',
  reliability_score smallint not null default 50 check (reliability_score between 0 and 100),
  transfer_date date,
  source_cluster_id uuid references public.news_clusters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type public.follow_entity_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  news_cluster_id uuid not null references public.news_clusters(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, news_cluster_id)
);

create table public.reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  news_cluster_id uuid not null references public.news_clusters(id) on delete cascade,
  read_at timestamptz not null default now(),
  reading_duration_seconds integer not null default 0 check (reading_duration_seconds >= 0)
);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  breaking_news boolean not null default true,
  match_start boolean not null default true,
  goal_alert boolean not null default true,
  match_result boolean not null default true,
  transfer_news boolean not null default true,
  daily_digest boolean not null default false,
  telegram_enabled boolean not null default false,
  browser_enabled boolean not null default true,
  email_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time
);

create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  telegram_chat_id text unique,
  verification_code text unique,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  input_reference text,
  provider text not null,
  model text,
  status public.job_status not null default 'pending',
  result jsonb,
  error_message text,
  token_usage jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id) on delete set null,
  status public.job_status not null default 'processing',
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Query indexes.
create index competitions_sport_idx on public.competitions(sport_id);
create index teams_sport_idx on public.teams(sport_id);
create index players_team_idx on public.players(team_id);
create index matches_competition_idx on public.matches(competition_id);
create index matches_teams_idx on public.matches(home_team_id, away_team_id);
create index matches_start_time_idx on public.matches(start_time desc);
create index matches_status_start_idx on public.matches(status, start_time);
create index match_events_match_idx on public.match_events(match_id, minute);
create index standings_competition_season_idx on public.standings(competition_id, season, position);
create index raw_articles_source_idx on public.raw_articles(source_id);
create index raw_articles_published_idx on public.raw_articles(published_at desc);
create index raw_articles_status_idx on public.raw_articles(processing_status);
create index raw_articles_search_idx on public.raw_articles using gin(search_vector);
create index news_clusters_published_idx on public.news_clusters(first_published_at desc);
create index news_clusters_hotness_idx on public.news_clusters(hotness_score desc, last_updated_at desc);
create index news_clusters_status_idx on public.news_clusters(status);
create index news_clusters_search_idx on public.news_clusters using gin(search_vector);
create index news_cluster_articles_article_idx on public.news_cluster_articles(raw_article_id);
create index news_entities_cluster_idx on public.news_entities(cluster_id);
create index news_entities_lookup_idx on public.news_entities(entity_type, entity_id);
create index transfers_status_date_idx on public.transfers(status, transfer_date desc);
create index user_follows_user_idx on public.user_follows(user_id, entity_type);
create index bookmarks_user_created_idx on public.bookmarks(user_id, created_at desc);
create index reading_history_user_read_idx on public.reading_history(user_id, read_at desc);
create index ai_jobs_status_created_idx on public.ai_jobs(status, created_at desc);
create index ingestion_logs_started_idx on public.ingestion_logs(started_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger competitions_updated before update on public.competitions for each row execute function public.set_updated_at();
create trigger teams_updated before update on public.teams for each row execute function public.set_updated_at();
create trigger players_updated before update on public.players for each row execute function public.set_updated_at();
create trigger matches_updated before update on public.matches for each row execute function public.set_updated_at();
create trigger news_sources_updated before update on public.news_sources for each row execute function public.set_updated_at();
create trigger transfers_updated before update on public.transfers for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- RLS: public sports data is readable; writes are admin-only.
alter table public.profiles enable row level security;
alter table public.sports enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.competition_teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.match_statistics enable row level security;
alter table public.standings enable row level security;
alter table public.news_sources enable row level security;
alter table public.raw_articles enable row level security;
alter table public.news_clusters enable row level security;
alter table public.news_cluster_articles enable row level security;
alter table public.news_entities enable row level security;
alter table public.transfers enable row level security;
alter table public.user_follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reading_history enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ingestion_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "sports public read" on public.sports for select using (true);
create policy "competitions public read" on public.competitions for select using (true);
create policy "teams public read" on public.teams for select using (true);
create policy "competition teams public read" on public.competition_teams for select using (true);
create policy "players public read" on public.players for select using (true);
create policy "matches public read" on public.matches for select using (true);
create policy "match events public read" on public.match_events for select using (true);
create policy "match stats public read" on public.match_statistics for select using (true);
create policy "standings public read" on public.standings for select using (true);
create policy "sources public read" on public.news_sources for select using (is_active = true or public.is_admin());
create policy "clusters public read" on public.news_clusters for select using (status = 'published' or public.is_admin());
create policy "cluster articles public read" on public.news_cluster_articles for select using (exists(select 1 from public.news_clusters c where c.id = cluster_id and c.status = 'published') or public.is_admin());
create policy "news entities public read" on public.news_entities for select using (exists(select 1 from public.news_clusters c where c.id = cluster_id and c.status = 'published') or public.is_admin());
create policy "transfers public read" on public.transfers for select using (true);

create policy "follows own select" on public.user_follows for select to authenticated using (user_id = auth.uid());
create policy "follows own insert" on public.user_follows for insert to authenticated with check (user_id = auth.uid());
create policy "follows own delete" on public.user_follows for delete to authenticated using (user_id = auth.uid());
create policy "bookmarks own select" on public.bookmarks for select to authenticated using (user_id = auth.uid());
create policy "bookmarks own insert" on public.bookmarks for insert to authenticated with check (user_id = auth.uid());
create policy "bookmarks own delete" on public.bookmarks for delete to authenticated using (user_id = auth.uid());
create policy "history own select" on public.reading_history for select to authenticated using (user_id = auth.uid());
create policy "history own insert" on public.reading_history for insert to authenticated with check (user_id = auth.uid());
create policy "notification own select" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy "notification own insert" on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy "notification own update" on public.notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "telegram own manage" on public.telegram_connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admin CRUD policies. Service-role bypasses RLS and must only be used server-side.
create policy "sports admin write" on public.sports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "competitions admin write" on public.competitions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "teams admin write" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "competition teams admin write" on public.competition_teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "players admin write" on public.players for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "matches admin write" on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "events admin write" on public.match_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "stats admin write" on public.match_statistics for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "standings admin write" on public.standings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "sources admin write" on public.news_sources for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "raw articles admin read" on public.raw_articles for select to authenticated using (public.is_admin());
create policy "raw articles admin write" on public.raw_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "clusters admin write" on public.news_clusters for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cluster links admin write" on public.news_cluster_articles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "entities admin write" on public.news_entities for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "transfers admin write" on public.transfers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ai jobs admin" on public.ai_jobs for select to authenticated using (public.is_admin());
create policy "ingestion logs admin" on public.ingestion_logs for select to authenticated using (public.is_admin());
create policy "audit admin read" on public.admin_audit_logs for select to authenticated using (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.sports, public.competitions, public.teams, public.competition_teams, public.players, public.matches, public.match_events, public.match_statistics, public.standings, public.news_sources, public.news_clusters, public.news_cluster_articles, public.news_entities, public.transfers to anon, authenticated;
grant select, insert, update, delete on public.user_follows, public.bookmarks, public.reading_history, public.notification_preferences, public.telegram_connections to authenticated;
grant select, update on public.profiles to authenticated;
