# Phase 3 checkpoint — Multi-provider sports engine

Status: complete on 2026-07-14.

## Architecture

Provider adapters are job-only. `FootballDataSyncAdapter` and `ApiFootballSyncAdapter` normalize provider payloads into competitions, teams, matches and standings with provider ID, source/fetch timestamps, freshness and raw metadata. TheSportsDB is a metadata adapter; OpenLigaDB and StatsBomb Open Data are opt-in adapters. Disabled adapters return configuration errors and never substitute mock data.

`SportsCacheRepository` is the only read path used by browser-facing sports APIs. It reads Supabase and reports empty/stale/configuration/error states. `resolveProvider` implements fresh-cache → primary → fallback → stale-cache → unavailable ordering for scheduled jobs. Entity matching uses persisted mapping, aliases, normalized name and context; low-confidence matches remain unresolved. Ambiguous match team mappings create `provider_conflicts` instead of guessing.

Provider requests have timeout, bounded retries, Retry-After/backoff handling, per-process request spacing and no authentication-error retry. Internal UUIDs remain primary keys; provider IDs live in mapping columns/tables.

## Real data verified

The configured football-data.org key returned 13 competitions: `BSA`, `ELC`, `PL`, `CL`, `EC`, `FL1`, `BL1`, `SA`, `DED`, `PPL`, `CLI`, `PD`, and `WC`. All 13 were persisted. Premier League teams and standings were synced (20 each). World Cup teams (48), recent results (25 persisted) and known fixtures (2 persisted) were synced. Two World Cup fixtures with unresolved placeholder teams were skipped rather than mapped incorrectly.

The standings schema was corrected in migration `202607140002_sports_cache.sql`: provider data can contain tied placeholder positions before play begins, so position is indexed but not unique.

API-Football, TheSportsDB, OpenLigaDB and StatsBomb are currently disabled because their keys/flags are not configured. Therefore Vietnamese leagues are not claimed as covered yet.

## Commands

The project now exposes `discover:providers`, `discover:competitions`, all requested `sync:*` commands, and `report:coverage`. Every command supports `--dry-run`; provider/competition can be selected with flags.

## Validation

Unit coverage includes alias/entity matching, match deduplication and provider cache/fallback resolution. Type-check and lint passed before real sync. Final phase validation runs after the checkpoint additions.
