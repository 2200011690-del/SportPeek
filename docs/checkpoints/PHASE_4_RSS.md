# Phase 4 checkpoint — Persistent RSS ingestion

Status: complete on 2026-07-14.

## Pipeline

RSS and Atom are now scheduled/manual ingestion inputs, never browser read dependencies. The job initializes configured `news_sources`, checks the fetch interval, sends ETag/Last-Modified conditional headers, enforces a 12-second timeout and 2 MB streamed-response limit, rejects entity/DOCTYPE declarations, parses metadata only, normalizes HTTP(S) URLs and persists batches in Supabase. Gzip/Brotli are accepted and decoded by the runtime.

Dedupe is source-aware: external ID, original/canonical URL, content hash and normalized title/time are checked without collapsing separate publishers that cover the same event. Raw records remain `pending` for the clustering job and are never deleted when a story is created. No article full text, paywalled content or video is copied.

A failed source gets its own `last_error`; other sources continue. `ingestion_jobs` records counts and partial failures. The protected `/api/cron/ingest` endpoint now runs persistent RSS sync instead of the old in-memory demo path.

## Real data verified

All 12 configured Vietnamese/international feeds were contacted successfully in the full run: VFF, VPF, VnExpress, Tuổi Trẻ, Thanh Niên, VietNamNet, Dân trí, VOV, BBC Sport, The Guardian, ESPN and Sky Sports. The run persisted 446 real raw articles from RSS metadata with no source failure. A forced BBC re-run fetched 50 entries and skipped all 50 as duplicates, proving persistent dedupe.

## Browser read path

The default story repository is now `createPersistedStoryRepository`. Feed/detail requests read `story_clusters.payload` and sync metadata from Supabase only; they do not fetch RSS and do not call AI. Before Phase 5 processes pending articles, an empty cluster cache returns an explicit empty state rather than falling back to live RSS or mock data.

## Commands and validation

Added `rss:test`, `rss:sync`, `rss:sync-source` and `rss:report`, with `--dry-run`, `--force` and source selection. Unit tests cover RSS 2.0, Atom, URL cleanup, source-scoped hashes, unsafe URLs and entity declarations. Type-check, lint and 40 tests passed before final build validation.
