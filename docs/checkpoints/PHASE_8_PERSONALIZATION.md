# Phase 8 checkpoint — personalization and optional Telegram

Status: complete on 2026-07-14.

## Account-owned personalization

Bookmark identity is corrected to use the internal story UUID end to end; the earlier UUID/cluster-key mismatch is removed. Bookmark, follow, notification settings and reading history all use authenticated Supabase rows protected by member RLS. The reader records duration after five seconds and periodically updates the current day's history record without blocking anonymous users.

The personal feed uses a deterministic rule-based ranker. Signals include followed entities, competitions and sources, freshness, hotness, reliability, bookmarks, reading history and a diversity penalty. Previously read stories receive a repeat penalty while related entities can inform future ranking. Each recommended card says “Vì sao bạn thấy tin này.” Anonymous mode is explicitly trending-only, not falsely labeled personalized.

Team, competition, player and source UI actions now submit real internal UUIDs. The source catalog reads 12 persisted Supabase sources and exposes language, official status, configured reliability, last fetch and real error state. Coach, journalist and topic remain supported by the follow contract/schema and will become selectable only after those entity catalogs contain provider data.

## Telegram

Telegram is disabled safely unless both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` exist. Link codes are account-owned, one-time and expire after 15 minutes. The webhook validates Telegram's secret header and deduplicates `update_id`. Commands implemented: `/start`, `/link CODE`, `/today`, `/live`, `/following` and `/stop`.

Notification delivery supports breaking news, match start, match result, transfer and daily digest preferences. It respects the account timezone and same-day/overnight quiet hours. A unique user/channel/type/reference/version record prevents duplicate delivery unless the caller provides a materially new version key. No live message is sent in the current environment because Telegram is intentionally `configuration_required`.

Migrations `202607140003_telegram_delivery.sql` and `202607140004_telegram_link_expiry.sql` were applied to the configured remote Supabase database. Both operational tables are queryable; no delivery/update rows were fabricated.

## Validation

Rule ranking, diversity, UUID validation, disabled-provider behavior, notification mapping and quiet-hour boundaries have unit coverage. Final Phase 8 checks passed with 50 tests, lint, strict type-check and the Vinext production build.
