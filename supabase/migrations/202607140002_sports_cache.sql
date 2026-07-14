-- Provider tables may legitimately return tied/placeholder positions before a season starts.
alter table public.standings drop constraint if exists standings_competition_id_season_position_key;
create index if not exists standings_competition_season_position_idx
  on public.standings(competition_id, season, position);
