# Phase 7 checkpoint — capability-aware Match Center

Status: complete on 2026-07-14.

## Persisted sports reads

Match, competition, team and player detail endpoints now read only the Supabase sports cache. Feed navigation and search use the same persisted 13 competitions and 68 teams; no UI route imports the demo catalog. The current provider cache contains 27 FIFA World Cup matches, 20 Premier League standings rows and no player records, so the player catalog truthfully remains empty until a provider with player capability is synchronized.

The repository joins internal UUIDs, slugs, provider/source timestamps and freshness. `/api/matches/[id]`, `/api/competitions/[slug]`, `/api/teams/[slug]` and `/api/players/[slug]` return explicit success, not-found or error states. Competition pages expose fixtures, results, standings, teams and configured provider coverage; team pages expose profile, next/recent matches and standings context.

## Capability rules

Match tabs are derived from persisted records, not merely from a provider marketing capability. Events, statistics, standings and form appear only when their tables contain data for that match or competition. Lineups, head-to-head, preview, recap and official highlights stay hidden while absent. Scheduled, postponed and cancelled states never render a fake score.

Live views label delayed/stale data and never call it real-time. Fixtures support a GMT+7 date picker, previous/next day navigation, competition and team filters, grouping by competition, and scheduled/postponed/cancelled states. Standings can be selected by cached competition and show the stored season/provider/freshness.

## Live data verification

Direct repository checks succeeded against the configured Supabase project: 25 results were readable, all 13 competition profiles resolved, FIFA World Cup returned 48 teams/2 fixtures/25 results, Premier League returned 20 teams/20 standings rows, and match detail correctly exposed only the score capability where no event/statistics/standings rows existed.

## Validation

The capability derivation has unit coverage. Phase checks passed with 45 tests, lint, strict type-check and the Vinext production build.
