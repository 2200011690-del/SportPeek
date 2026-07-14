# Phase 1 checkpoint — Foundation

Status: complete on 2026-07-14.

## Architecture introduced

- `lib/application`: route-facing story, sports and AI use cases.
- `lib/providers/registry.ts`: one registry for sports, news, AI and notification provider state/capabilities.
- `lib/core/errors.ts`: typed configuration/auth/provider/rate-limit/validation/not-found/conflict/stale errors.
- `lib/core/logger.ts`: structured logger with secret-key redaction and development-only debug output.
- `lib/config`: strict Internal Mode and fixture policy parsing.

API routes now call application services rather than sports/AI adapters directly. Mock AI, news and sports classes remain importable for tests but must be injected explicitly. Disabled or missing providers return configuration errors.

## Provider state

- football-data.org: configured locally, live adapter retained.
- RSS: configured, persistence is Phase 4.
- Cloudflare/OpenAI/Gemini: selected only when explicitly configured and usable; generic AI calls no longer become mock.
- Telegram: disabled safely without a token.

## Validation

Foundation tests cover Internal Mode, allowlists, typed safe errors and disabled-provider reporting. Lint passed, type-check passed, 33/33 tests passed and production build passed.
