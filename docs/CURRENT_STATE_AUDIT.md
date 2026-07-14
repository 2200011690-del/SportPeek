# Current state audit

Audit date: 2026-07-14. Baseline commit: `348dfe2`.

## Stack and deployment

- Vinext/Next App Router, React 19, TypeScript strict, Zod and a Cloudflare Worker entry.
- Cloudflare Worker configuration exists in `wrangler.jsonc`; Sites configuration exists in `.openai/hosting.json`.
- Supabase URL, publishable key, server secret and football-data credentials are present locally without being committed.
- Baseline lint, type-check, 30 tests and production build pass.

## Truthful production data

- News: twelve public RSS/Atom sources are fetched, normalized, clustered in memory and cached for five minutes. Phase 0.4 added one repository contract for feed/detail, stable slugs and finite reader states.
- Sports: football-data.org and API-Football adapters exist. Before this audit, any missing key or provider error silently returned demo matches/standings.
- Supabase: the original migration is installed but its content tables are empty. Live RSS and sports responses are not yet persisted.
- AI: Cloudflare translation and OpenAI enrichment exist, but the generic AI registry incorrectly returns a mock provider for several disabled/error cases.
- User state: bookmark, follow and settings are still device-local despite README claims that production persists them.

## Initial defects

1. Sports endpoints returned mock HTTP 200 after provider configuration or network errors.
2. The global client merged real responses with demo matches/standings, so banners and content could disagree.
3. `/register` remained reachable in Internal Mode.
4. Internal Mode did not protect ordinary pages or check an invite allowlist.
5. Match detail depended on a global feed window instead of a dedicated cached-detail service.
6. RSS and sports providers were invoked from read requests rather than scheduled persistence jobs.
7. The old schema has 24 tables but lacks allowlists, provider mappings/config/capabilities/conflicts/sync state, story timeline, story entity relations and the normalized cluster fields required by the product.
8. The README overstates working persistence, provider coverage and admin behavior.

## Phase 0 corrections

- Disabled sports providers now return a typed configuration state; production does not substitute mock results.
- The client no longer injects demo matches or standings after failed requests.
- Internal Mode redirects public registration and emits global noindex/nofollow directives.
- Central config parsing, typed errors and a secret-redacting logger were introduced for later phases.

