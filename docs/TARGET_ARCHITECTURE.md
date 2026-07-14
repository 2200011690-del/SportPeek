# Target architecture

```text
React UI
  -> application services / API envelopes
    -> repositories
      -> Supabase PostgreSQL cache and user-owned records

Scheduled/manual jobs
  -> provider registry and capability resolver
    -> RSS / football-data / API-Football / metadata / AI / Telegram adapters
      -> normalization + validation + dedupe
        -> Supabase repositories
```

## Boundaries

- `lib/core`: typed errors, logging and common result/status contracts.
- `lib/config`: environment parsing and Internal Mode policy.
- `lib/application`: feed, story, sports, personalization and health use cases.
- `lib/providers`: capability registry and external adapters.
- `lib/repositories`: Supabase reads/writes; no UI imports.
- `lib/news`: RSS normalization, dedupe, clustering and AI job orchestration.
- `lib/sports`: normalized sports models, provider mapping and sync.
- `lib/auth`: invited-user policy and authenticated user context.

Read APIs never call AI or live sports providers. They read persisted data and return explicit `success`, `empty`, `not_found`, `stale`, `configuration_required`, `unauthorized` or `error` states. Jobs use bounded retries, provider-specific cache intervals and safe structured logs.

## Data ownership

Supabase is the source of truth for raw articles, clusters, sports cache, mappings and user state. Provider external IDs are unique mapping attributes, never primary keys. RLS owns all user writes. Service credentials stay in server/jobs only.

