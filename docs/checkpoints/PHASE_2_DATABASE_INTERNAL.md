# Phase 2 checkpoint — Database and Internal Mode

Status: complete on 2026-07-14.

## Database

Migration `202607140001_internal_platform.sql` was applied to the configured Supabase project. It preserves the original sports/news tables and adds the internal-platform records required for story persistence, source traceability, provider mapping, sync jobs and conflicts. All domain rows use SportPeek UUIDs; provider IDs are stored only in `provider_entity_mappings` or provider metadata.

The schema now contains the 31 requested table groups, including `allowed_users`, `story_clusters`, `story_cluster_articles`, `story_entities`, `story_timeline`, `provider_capabilities`, `provider_sync_state`, `provider_conflicts`, `ingestion_jobs`, personalization records and Telegram connections. Raw articles are retained after clustering.

## Internal Mode

- Public signup is disabled when `INTERNAL_MODE=true` or `ALLOW_PUBLIC_SIGNUP=false`.
- All routes except login, password recovery, auth callback, protected cron and Telegram webhook require a Supabase session and an invited email.
- Membership can come from `ALLOWED_EMAILS` / `ADMIN_EMAILS` or `allowed_users`.
- Only `owner` and `member` are exposed as internal roles.
- RLS limits personal records to the current user and shared sports/news reads to invited members.
- Bookmark, follow, settings and reset operations use Supabase. Browser storage is used only for the theme preference.
- Internal pages publish `noindex, nofollow`; `robots.txt` disallows crawling.

No Auth user or invited user existed in the remote project at checkpoint time, so the owner email must be added with the operations script or Supabase before Internal Mode is enabled on the hosted site.

## Validation

The migration was pushed successfully to the configured remote database. Lint passed; type-check passed after null-safe personalization reads; 33/33 tests passed; production build passed. No production mock or hard-coded secret was introduced.
