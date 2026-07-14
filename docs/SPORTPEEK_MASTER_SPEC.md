# SportPeek master specification

SportPeek is a private AI sports reader for an owner and a small invited team. Its primary content unit is a story cluster: one event, every retained source article, and one transparent Vietnamese reading view.

## Product invariants

- A publisher article is retained as metadata and a short excerpt; it is never replaced by its cluster and full publisher text is never stored.
- Feed and detail read the same persisted cluster repository.
- External news, sports and AI providers run in scheduled/manual jobs, never in a browser render path.
- Missing configuration produces `configuration_required`; provider failure produces `error` or `stale`. Production never silently substitutes fixtures.
- Internal UUIDs identify database records. Provider IDs live only in provider mappings.
- AI output is source-bounded, schema validated and stored before users read it.
- A disabled provider cannot crash unrelated surfaces.
- Internal Mode disables public signup, requires an invited identity, blocks indexing and persists user-owned data with RLS.

## Product surfaces

The existing three-column home is retained. The center feed renders clusters; the story reader exposes summary, sourced facts, disputes, timeline, official sources and every contributing article. Match Center renders only capabilities actually present in cached provider data. Personal feeds, bookmarks, follows, preferences and Telegram are user-owned.

## Delivery sequence

1. Stabilize route and data states.
2. Establish typed application/provider boundaries.
3. Add the complete Supabase model and Internal Mode.
4. Cache normalized sports providers.
5. Persist safe RSS ingestion.
6. Process clusters and AI jobs before reads.
7. Complete the reader and shared health state.
8. Complete capability-aware Match Center.
9. Persist personalization and optionally enable Telegram.
10. Provide minimal operational scripts.
11. Run final QA and publish the validated source.

