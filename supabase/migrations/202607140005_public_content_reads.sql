-- Content/cache reads are intentionally public for the private personal deployment.
-- Account-owned tables keep their user-scoped RLS policies.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'sports','competitions','teams','competition_teams','players','matches','match_events','match_statistics','standings',
    'news_sources','raw_articles','story_clusters','story_cluster_articles','story_entities','story_timeline',
    'provider_entity_mappings','entity_aliases','competition_provider_config','provider_capabilities','provider_sync_state','ingestion_jobs'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'content cache read', table_name);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', 'content cache read', table_name);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.sports, public.competitions, public.teams, public.competition_teams, public.players,
  public.matches, public.match_events, public.match_statistics, public.standings, public.news_sources,
  public.raw_articles, public.story_clusters, public.story_cluster_articles, public.story_entities, public.story_timeline,
  public.provider_entity_mappings, public.entity_aliases, public.competition_provider_config, public.provider_capabilities,
  public.provider_sync_state, public.ingestion_jobs to anon, authenticated;
