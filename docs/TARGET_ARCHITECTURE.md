# NewsPeek target architecture

```text
Cloudflare Worker / Next-compatible routes
  ├─ public newsroom UI
  ├─ news/search/source/personalization APIs
  └─ one-minute scheduler
       ├─ RSS source sync
       └─ story clustering + AI summarization

RSS publishers
  → normalized metadata + canonical URLs
  → Supabase raw articles
  → event clusters
  → Gemini / Groq / Workers AI failover
  → Vietnamese editorial summary
  → feed cards and source-linked reader
```

The production runtime contains no dedicated sports-data provider. Sport is one editorial category and arrives through the same RSS/story pipeline as every other topic.

Legacy sports tables remain in old migrations only as rollback-compatible storage. New application code must not query them.

## Reliability rules

- RSS and AI failures are explicit in health state.
- AI output is grounded in retained source metadata.
- One provider failure advances to the next configured AI provider.
- A last-good summary is retained when remote AI is temporarily unavailable.
- Canonical links and publisher attribution are always preserved.
