# Phase 0.4 checkpoint — Story reading

Date: 2026-07-14

Status: complete. This checkpoint stops at Phase 0.4; no later phase has been started.

## Root cause

The story page previously searched the latest 60 feed items already loaded by the global client. It had no dedicated detail endpoint or durable repository lookup. A story therefore disappeared when its cluster was no longer in that feed window, and legacy slugs could not be resolved. The page also waited on a global `Promise.allSettled` request that included sports endpoints. Because the shared fetch helper had no timeout, one stalled dependency could leave the story route in an infinite loading state.

Production news endpoints also silently returned demo news with HTTP 200 when RSS failed. This made an unavailable provider look healthy and made it impossible for the UI to distinguish empty, stale, configuration, and error states.

## Architecture before and after

Before:

`RSS aggregation -> /api/news -> NewsItem[] in global UI state -> detail searches the current feed`

After:

`RSS aggregation/cache -> StoryRepository -> validated StoryCluster/RawArticle -> /api/stories and /api/stories/:slug -> explicit reader state machine`

The existing `NewsItem` card interface remains behind `storyToNewsItem`, a presentation adapter. Feed and detail now read the same repository and the story page no longer depends on sports requests or global feed state. AI translation/synthesis stays in ingestion; it is never invoked while a React story component renders.

## Domain model

`RawArticle` contains:

- identity: `id`, `sourceId`, `sourceName`;
- safe source links: `originalUrl`, optional `canonicalUrl`, optional source logo;
- source content metadata: `title`, optional `excerpt`, image and author;
- provenance: `publishedAt`, `fetchedAt`, official-source flag, language and processing status.

`StoryCluster` contains:

- stable `id`, canonical `slug`, and `legacySlugs`;
- title, short summary, long summary, category and language;
- editorial status, hotness/reliability, publish/update times and image;
- unique publisher count/names and official-source articles;
- agreed facts, disputed points, timeline and optional linked match;
- competition/team/player entities;
- every contributing `RawArticle` plus AI/review metadata.

Zod validates both models at the repository/API boundary. External article and image URLs only accept HTTP or HTTPS.

## Repository and API contract

`lib/stories/repository.ts` owns these reads:

- `getStoryFeed()` / `getLatestStories()`
- `getStoryBySlug()` / `getStoryById()`
- `getStorySources()`
- `getRelatedStories()`

New endpoints:

- `GET /api/stories`
- `GET /api/stories/:slug`

The existing `/api/news`, `/api/search`, and `/api/feed/for-you` compatibility paths now use the same repository. Responses use one envelope with `status`, `data`, `meta`, and a safe structured `error`. Supported statuses are `success`, `empty`, `not_found`, `stale`, `configuration_required`, `unauthorized`, and `error`. Missing stories return a real API HTTP 404.

Example detail response shape:

```json
{
  "status": "success",
  "data": {
    "story": { "slug": "story-alpha-001", "articles": [] },
    "relatedStories": []
  },
  "meta": {
    "source": "aggregated-rss",
    "cached": true,
    "stale": false,
    "lastUpdatedAt": "2026-07-14T08:00:00.000Z",
    "canonicalSlug": "story-alpha-001"
  },
  "error": null
}
```

## Slug compatibility

Canonical slugs are ID-based (`story-<stable-id>`), so translation or title changes do not change the route and duplicate titles do not collide. Current `rss-*` slugs and prior item IDs are retained in `legacySlugs`. A successful legacy lookup returns `canonicalSlug`; the client replaces the URL without losing the open story.

## Reader states, timeout and retry

The story reader implements `idle`, `loading`, `success`, `stale`, `empty`, `not_found`, `configuration_required`, `unauthorized`, and `error`. Its request has a finite timeout (12 seconds by default), aborts stalled work, retries at most once, and never retries a valid 404. Timeout and retry count can be changed with the documented public environment variables.

The loading view is a bounded skeleton. Error/configuration/not-found states provide retry or navigation actions. A stale cache is rendered with a visible warning instead of being reported as fresh.

## Cache, mock, AI and summary fallback

- Fresh RSS data is cached as before. If every current RSS request fails but an expired cache exists, the repository returns `stale` with cache metadata.
- Production news does not silently fall back to `lib/demo-data.ts`. Test fixtures live only under `tests/`.
- `AI_PROVIDER=off` is the safe default. AI translation is an ingestion concern and is not called when a story opens.
- A story without an AI summary uses source-backed reading paragraphs/excerpts, then the short summary or title. No full publisher article is copied.

## Supabase readiness audit

The repository contains migrations for `news_sources`, `raw_articles`, and `news_clusters`, but the current live RSS ingestion path does not persist its results there. Public RLS is not ready for raw-article detail reads, and the available seed data is demonstrative. For this phase, aggregated RSS plus its server cache remains the truthful source of record.

Moving story reads to Supabase later requires an ingestion writer, cluster/article relations populated with real feeds, suitable server-side credentials/RLS, retention and deduplication rules, and migration/rollback verification. None of that was started in Phase 0.4.

## Story experience

The detail page keeps SportPeek's dark visual identity and adds:

- source-backed image and credit;
- source/status/time/hotness metadata;
- accessible keyboard-operated tabs for summary, all source articles, timeline, agreed facts, disputed points, and official sources when available;
- compact source cards with original headline, publisher, published time, excerpt, lead/official labels, and safe original links;
- related stories, related match when data exists, bookmark/share actions, and a responsive mobile layout without horizontal overflow.

The homepage's three-column layout and fixtures/live/results/standings pages were not redesigned.

## Verification

Automated checks on 2026-07-14:

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 30/30 tests.
- `npm run build`: passed.
- `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`: passed, 7/7 checks.

New unit/integration coverage checks stable slugs, unsafe URLs, shared feed/detail identity, legacy lookup, missing summary fallback, stale/configuration states, real not-found, finite timeout, one-retry maximum, and source lists. E2E checks the feed-to-detail API contract and missing-story HTTP 404 without calling live APIs from unit tests.

Manual browser verification covered the home feed, canonical detail, legacy redirect, missing detail, multi-source tabs, keyboard navigation, safe original links, finite loading, desktop layout, and a 390 x 844 mobile viewport.

## Known limitations

- Next/Vinext's SPA catch-all still serves the application shell for `/news/<missing>`; the detail API supplies the real HTTP 404 and the rendered route shows a not-found state.
- Live stories are not yet persisted in Supabase, so availability still depends on RSS/cache health.
- Reading history was not added because there is no authenticated persistence service in the current scope; bookmark/share behavior remains.
- Linked matches, disputed points, and official-source tabs appear only when real data exists.
- Clustering quality is inherited from the current ingestion heuristic; broad coverage of the same event can produce a long source list. Improving the clustering engine is outside Phase 0.4.
