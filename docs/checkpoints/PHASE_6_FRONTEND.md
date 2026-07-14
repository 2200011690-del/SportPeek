# Phase 6 checkpoint — AI sports reader frontend

Status: complete on 2026-07-14.

## Reader experience

The existing SportPeek visual language and responsive three-column home are preserved. Feed cards represent story clusters, open the canonical `/news/[slug]`, display status/hotness/reliability, total source articles, independent publisher count and official-source count, and keep publisher images with an explicit no-image fallback.

The detail reader includes conditional Summary, Timeline, Agreements, Disputes, Official Sources and All Sources tabs. Each source card renders plain text only, labels first/official/syndicated sources where applicable, and opens only validated HTTP(S) links with `noopener noreferrer`. Stories without remote AI show “Chưa xử lý bởi AI” and remain readable instead of showing an indefinite loader.

Loading, empty, not-found, stale, configuration and error paths have finite timeout/retry behavior. Mobile retains the drawer/bottom navigation and horizontal-safe tab layout.

## Unified health

`getHealthSnapshot` is now the single source for banner and footer status. It inspects real RSS jobs/sources, story jobs/clusters, sports cache/sync state, AI mode and Telegram configuration. States are exactly `operational`, `degraded`, `stale`, `unavailable`, `configuration_required` or `development_mock`.

Current live snapshot: RSS operational with 12 sources; Stories operational with 413 clusters; Sports operational with 47 cached records; remote AI configuration required (heuristic summaries are available); Telegram configuration required. Therefore the overall state is truthfully `configuration_required`, not “system normal.”

## Validation

Health precedence has unit coverage, and feed/detail integration still verifies a shared repository and canonical slug. Final phase checks run after the checkpoint update.
