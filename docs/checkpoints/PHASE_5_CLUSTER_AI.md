# Phase 5 checkpoint — Story clustering and AI jobs

Status: complete on 2026-07-14.

## Processing model

The persisted pipeline is now:

`raw_articles → normalize/event type → candidate window → heuristic similarity → merge/create → source-backed summary/timeline → story_clusters + links + entities`.

Clustering compares normalized titles, meaningful-token overlap, publisher, event type and publication window. It uses a longer window for transfers, but rejects incompatible event types such as preview/result and injury/recovery. High confidence merges automatically; medium confidence may call the configured remote AI evaluator; low confidence creates a new cluster. Low-confidence entity mappings are never guessed.

Every raw article remains in `raw_articles` and is linked through `story_cluster_articles`. The story payload exposes total articles, independent publishers, official sources, status, reliability, hotness, agreed facts, disputed points and a source-backed timeline. A cluster without AI is immediately readable and explicitly remains `reviewStatus=pending`.

## AI abstraction

`AIProvider` now supports classification, cluster-match evaluation, entity extraction, summarization, timeline, agreements, disputes and context-only answers. Implementations exist for Gemini, OpenAI, Cloudflare Workers AI and deterministic heuristic fallback. Remote output is Zod-validated and supporting IDs must belong to the input. No invalid response is persisted.

AI runs only in processing/summarization scripts. The default browser repository performs Supabase reads only. No model is called when a user opens a feed or story.

## Real processing result

The first real run processed all 446 pending RSS articles into 413 story clusters, merged 33 articles into existing event clusters, created 446 durable article links, and left zero failed/pending articles. No remote AI key was active, so all 413 clusters use the transparent heuristic summary and `aiGenerated=false`; this is not represented as an AI translation.

## Commands and validation

Added `stories:process`, guarded dry-run `stories:recluster` (requires `--apply` for destructive rebuild), `stories:summarize`, `stories:retry-failed` and `stories:report`. Tests cover high-confidence clustering, incompatible event types, source-backed outputs and the no-AI-on-read contract.
