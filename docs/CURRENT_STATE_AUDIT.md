# NewsPeek current-state audit

Updated 17 July 2026.

## Active product

- General-news aggregator for Vietnam and international publishers.
- 25 default RSS feeds across world, economy, technology, politics, health, science, culture, sport and general news.
- Story clustering, Vietnamese summaries, source links, bookmarks, source follows and Telegram-ready notifications.
- AI failover chain: Gemini → Groq → Cloudflare Workers AI, with OpenAI supported as an optional provider.
- Cloudflare cron alternates RSS synchronization and story/AI processing every minute.

## Removed runtime surface

- Live scores, fixtures, results and standings.
- Team, player, competition and transfer pages.
- API-Football, football-data and OpenLigaDB adapters.
- Sports synchronization jobs, scripts and provider health checks.

Old database tables are intentionally not dropped in this change so rollback does not destroy data.

## Verification baseline

- TypeScript strict check.
- ESLint.
- Unit and integration suite.
- Vinext production build.
- Local production smoke checks for newsroom routes and removal of sports API endpoints.
