import { createHash, randomUUID } from "node:crypto";
import { ConfigurationError, ProviderError, toSafeError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerFetch } from "@/lib/core/provider-fetch";
import { parseRssXml, readResponseText } from "./parser";
import { configuredRssSources, RETIRED_RSS_SOURCE_NAMES } from "./sources";
import { rssSourceSchema, type ParsedRssArticle, type RssSource } from "./types";

export type RssSyncSummary = { jobId: string; sources: number; succeeded: number; failed: number; notModified: number; fetched: number; inserted: number; skipped: number; errors: Array<{ source: string; message: string }> };

function admin() { const client = createAdminClient(); if (!client) throw new ConfigurationError("Thiếu Supabase service role cho RSS sync.", "supabase"); return client; }
export function rssContentHash(sourceId: string, article: Pick<ParsedRssArticle, "canonicalUrl" | "normalizedTitle" | "publishedAt">) { return createHash("sha256").update(`${sourceId}\0${article.canonicalUrl}\0${article.normalizedTitle}\0${article.publishedAt}`).digest("hex"); }

export async function ensureRssSources(): Promise<RssSource[]> {
  const client = admin();
  const configured = configuredRssSources();
  const configuredByName = new Map(configured.map((source) => [source.name, source]));
  const rows = configured.map((source) => ({ name: source.name, base_url: new URL(source.feedUrl).origin, rss_url: source.feedUrl, language: source.language, country: source.country, is_official: Boolean(source.official), reliability_score: source.reliability, is_active: true, fetch_interval_minutes: source.fetchIntervalMinutes ?? 15 }));
  if (rows.length) {
    const { error } = await client.from("news_sources").upsert(rows, { onConflict: "name" });
    if (error) throw new ProviderError("Không thể lưu danh mục RSS sources.", "supabase");
  }
  const retired = await client.from("news_sources").update({ is_active: false }).in("name", [...RETIRED_RSS_SOURCE_NAMES]);
  if (retired.error) throw new ProviderError("Không thể tắt nguồn RSS thể thao cũ.", "supabase");
  const { data, error } = await client.from("news_sources").select("id,name,base_url,rss_url,language,country,is_official,reliability_score,is_active,fetch_interval_minutes,last_fetched_at,last_error,etag,last_modified").not("rss_url", "is", null).order("name");
  if (error) throw new ProviderError("Không thể đọc RSS sources.", "supabase");
  return (data ?? []).flatMap((row): RssSource[] => { const parsed = rssSourceSchema.safeParse({ id: row.id, name: row.name, baseUrl: row.base_url, feedUrl: row.rss_url, language: row.language, country: row.country, official: row.is_official, reliability: row.reliability_score, active: row.is_active, defaultCategory: configuredByName.get(row.name)?.defaultCategory ?? null, fetchIntervalMinutes: row.fetch_interval_minutes, lastFetchedAt: row.last_fetched_at, lastError: row.last_error, etag: row.etag, lastModified: row.last_modified }); return parsed.success ? [parsed.data] : []; });
}

function due(source: RssSource, force: boolean) { return force || !source.lastFetchedAt || Date.now() - Date.parse(source.lastFetchedAt) >= source.fetchIntervalMinutes * 60_000; }

type ExistingRawArticle = { external_id: string | null; original_url: string; canonical_url: string | null; content_hash: string; normalized_title: string | null; published_at: string };
type ExistingUrlIdentity = Pick<ExistingRawArticle, "original_url" | "canonical_url">;
type PersistableRssArticle = ParsedRssArticle & { contentHash: string };
type SupabaseErrorLike = { code?: unknown; message?: unknown; hint?: unknown };
type RssWriteResult = { data: Array<{ id?: unknown }> | null; error: unknown | null };

function safeDatabaseText(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-token]")
    .replace(/\b(authorization|api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function describeSupabaseError(error: unknown): { code: string; message: string; hint: string | null } {
  const record = error && typeof error === "object" ? error as SupabaseErrorLike : {};
  return {
    code: safeDatabaseText(record.code, "SUPABASE_ERROR").slice(0, 64),
    message: safeDatabaseText(record.message, "Supabase request failed"),
    hint: typeof record.hint === "string" && record.hint.trim() ? safeDatabaseText(record.hint, "") : null,
  };
}

function providerErrorFromSupabase(action: string, event: string, error: unknown, context: Record<string, unknown>): ProviderError {
  const detail = describeSupabaseError(error);
  logger.error(event, { provider: "supabase", code: detail.code, databaseMessage: detail.message, hint: detail.hint, ...context });
  return new ProviderError(`${action} (Supabase ${detail.code}: ${detail.message}).`, "supabase");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && String((error as SupabaseErrorLike).code ?? "") === "23505");
}

/**
 * Keep source-scoped identifiers and title heuristics local to a publisher,
 * while treating URL identity as global because raw_articles.original_url is
 * globally unique. The first stored row remains the attribution owner.
 */
export function selectPersistableRssArticles(
  sourceId: string,
  articles: ParsedRssArticle[],
  existingForSource: ExistingRawArticle[],
  existingUrlIdentities: ExistingUrlIdentity[],
): PersistableRssArticle[] {
  const externalIds = new Set(existingForSource.map((row) => row.external_id).filter((value): value is string => Boolean(value)));
  const hashes = new Set(existingForSource.map((row) => row.content_hash));
  const knownUrls = new Set(
    [...existingForSource, ...existingUrlIdentities]
      .flatMap((row) => [row.original_url, row.canonical_url])
      .filter((value): value is string => Boolean(value)),
  );
  const titleTimes = new Map<string, number[]>();
  for (const row of existingForSource) {
    if (!row.normalized_title) continue;
    const list = titleTimes.get(row.normalized_title) ?? [];
    list.push(Date.parse(row.published_at));
    titleTimes.set(row.normalized_title, list);
  }

  const accepted: PersistableRssArticle[] = [];
  for (const article of articles) {
    const contentHash = rssContentHash(sourceId, article);
    const published = Date.parse(article.publishedAt);
    const titleDuplicate = (titleTimes.get(article.normalizedTitle) ?? [])
      .some((timestamp) => Number.isFinite(timestamp) && Math.abs(timestamp - published) <= 6 * 60 * 60_000);
    if (
      externalIds.has(article.externalId)
      || knownUrls.has(article.originalUrl)
      || knownUrls.has(article.canonicalUrl)
      || hashes.has(contentHash)
      || titleDuplicate
    ) continue;

    accepted.push({ ...article, contentHash });
    externalIds.add(article.externalId);
    knownUrls.add(article.originalUrl);
    knownUrls.add(article.canonicalUrl);
    hashes.add(contentHash);
    const times = titleTimes.get(article.normalizedTitle) ?? [];
    times.push(published);
    titleTimes.set(article.normalizedTitle, times);
  }
  return accepted;
}

/** Try the fast batch write first, then isolate only unique-conflict rows. */
export async function persistRowsWithConflictIsolation<T>(
  rows: T[],
  write: (batch: T[]) => Promise<RssWriteResult>,
  onConflict?: (error: unknown) => void,
): Promise<{ inserted: number; skipped: number }> {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const result = await write(rows);
  if (!result.error) {
    const inserted = Math.min(rows.length, result.data?.length ?? 0);
    return { inserted, skipped: rows.length - inserted };
  }
  if (!isUniqueViolation(result.error)) throw result.error;
  if (rows.length === 1) {
    onConflict?.(result.error);
    return { inserted: 0, skipped: 1 };
  }

  const middle = Math.ceil(rows.length / 2);
  const [left, right] = await Promise.all([
    persistRowsWithConflictIsolation(rows.slice(0, middle), write, onConflict),
    persistRowsWithConflictIsolation(rows.slice(middle), write, onConflict),
  ]);
  return { inserted: left.inserted + right.inserted, skipped: left.skipped + right.skipped };
}

async function persistArticles(source: RssSource, articles: ParsedRssArticle[]): Promise<{ inserted: number; skipped: number }> {
  if (!articles.length) return { inserted: 0, skipped: 0 };
  const client = admin();
  const { data: existing, error: lookupError } = await client.from("raw_articles").select("external_id,original_url,canonical_url,content_hash,normalized_title,published_at").eq("source_id", source.id).order("published_at", { ascending: false }).limit(2000);
  if (lookupError) throw providerErrorFromSupabase("Không thể kiểm tra RSS duplicate", "rss.duplicate_lookup_failed", lookupError, { sourceId: source.id, sourceName: source.name, scope: "source" });

  const candidateUrls = [...new Set(articles.flatMap((article) => [article.originalUrl, article.canonicalUrl]))];
  const [byOriginal, byCanonical] = await Promise.all([
    client.from("raw_articles").select("original_url,canonical_url").in("original_url", candidateUrls),
    client.from("raw_articles").select("original_url,canonical_url").in("canonical_url", candidateUrls),
  ]);
  if (byOriginal.error) throw providerErrorFromSupabase("Không thể kiểm tra RSS URL trùng", "rss.global_url_lookup_failed", byOriginal.error, { sourceId: source.id, sourceName: source.name, column: "original_url" });
  if (byCanonical.error) throw providerErrorFromSupabase("Không thể kiểm tra RSS URL trùng", "rss.global_url_lookup_failed", byCanonical.error, { sourceId: source.id, sourceName: source.name, column: "canonical_url" });

  const accepted = selectPersistableRssArticles(source.id, articles, (existing ?? []) as ExistingRawArticle[], [...(byOriginal.data ?? []), ...(byCanonical.data ?? [])] as ExistingUrlIdentity[]);
  let inserted = 0;
  const fetchedAt = new Date().toISOString();
  for (let index = 0; index < accepted.length; index += 50) {
    const batch = accepted.slice(index, index + 50).map((article) => {
      const fullContent = article.fullContent?.trim() || null;
      const measuredWords = fullContent ? fullContent.split(/\s+/).filter(Boolean).length : 0;
      const contentWordCount = fullContent ? Math.max(article.contentWordCount ?? 0, measuredWords) : 0;
      const contentAvailable = Boolean(fullContent && contentWordCount >= 120);
      return { source_id: source.id, external_id: article.externalId, original_url: article.originalUrl, canonical_url: article.canonicalUrl, title: article.title, normalized_title: article.normalizedTitle, excerpt: article.excerpt, author: article.author, image_url: article.imageUrl, published_at: article.publishedAt, fetched_at: fetchedAt, content_hash: article.contentHash, language: article.language, processing_status: "pending", raw_metadata: article.rawMetadata, full_content: contentAvailable ? fullContent : null, content_status: contentAvailable ? "available" : "pending", content_source: contentAvailable ? article.contentSource ?? "rss" : null, content_fetched_at: contentAvailable ? fetchedAt : null, content_word_count: contentAvailable ? contentWordCount : 0, content_error: null, content_lease_expires_at: null };
    });
    try {
      const result = await persistRowsWithConflictIsolation(
        batch,
        async (rows) => client.from("raw_articles").upsert(rows, { onConflict: "original_url", ignoreDuplicates: true }).select("id"),
        (error) => {
          const detail = describeSupabaseError(error);
          logger.warn("rss.article_conflict_skipped", { provider: "supabase", code: detail.code, databaseMessage: detail.message, sourceId: source.id, sourceName: source.name });
        },
      );
      inserted += result.inserted;
    } catch (error) {
      throw providerErrorFromSupabase("Không thể lưu batch raw article", "rss.raw_article_persist_failed", error, { sourceId: source.id, sourceName: source.name, batchSize: batch.length });
    }
  }
  return { inserted, skipped: articles.length - inserted };
}

async function syncSource(source: RssSource): Promise<{ status: "success" | "not_modified"; fetched: number; inserted: number; skipped: number }> {
  const headers: Record<string, string> = { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "user-agent": `NewsPeek/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://newspeek.local"})`, "accept-encoding": "gzip, br" };
  if (source.etag) headers["if-none-match"] = source.etag;
  if (source.lastModified) headers["if-modified-since"] = source.lastModified;
  const response = await providerFetch(`rss:${source.id}`, source.feedUrl, { headers, redirect: "follow" }, { timeoutMs: 12_000, retries: 1, minimumIntervalMs: 100 });
  const now = new Date().toISOString();
  if (response.status === 304) { await admin().from("news_sources").update({ last_fetched_at: now, last_error: null }).eq("id", source.id); return { status: "not_modified", fetched: 0, inserted: 0, skipped: 0 }; }
  const xml = await readResponseText(response); const parsedArticles = parseRssXml(xml, source); const articles = source.defaultCategory ? parsedArticles.map((article) => ({ ...article, rawMetadata: { ...article.rawMetadata, categories: [...new Set([source.defaultCategory, ...(Array.isArray(article.rawMetadata.categories) ? article.rawMetadata.categories.filter((value): value is string => typeof value === "string") : [])])] } })) : parsedArticles; const { inserted, skipped } = await persistArticles(source, articles);
  await admin().from("news_sources").update({ last_fetched_at: now, last_error: null, etag: response.headers.get("etag"), last_modified: response.headers.get("last-modified") }).eq("id", source.id);
  return { status: "success", fetched: articles.length, inserted, skipped };
}

export async function syncRss(options: { source?: string; force?: boolean; dryRun?: boolean; maxSources?: number } = {}): Promise<RssSyncSummary> {
  const all = await ensureRssSources(); const dueSources = all.filter((source) => source.active && (!options.source || source.id === options.source || source.name.toLowerCase() === options.source.toLowerCase()) && due(source, Boolean(options.force))); const maxSources = options.maxSources === undefined ? dueSources.length : Math.max(1, Math.min(12, Math.floor(options.maxSources))); const selected = dueSources.slice(0, maxSources);
  const jobId = randomUUID(); const summary: RssSyncSummary = { jobId, sources: selected.length, succeeded: 0, failed: 0, notModified: 0, fetched: 0, inserted: 0, skipped: 0, errors: [] };
  if (options.dryRun) return summary;
  const client = admin();
  const staleJobs = await client.from("ingestion_jobs").update({ status: "failed", error_code: "LEASE_EXPIRED", error_message: "RSS sync exceeded its execution lease.", completed_at: new Date().toISOString() }).eq("job_type", "rss:sync").eq("status", "processing").lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (staleJobs.error) throw new ProviderError("Không thể giải phóng RSS job quá hạn.", "supabase");
  const { data: activeJobs, error: activeCheckError } = await client.from("ingestion_jobs").select("id").eq("job_type", "rss:sync").eq("status", "processing").gt("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (activeCheckError) throw new ProviderError("Không thể kiểm tra trạng thái job.", "supabase");
  if (activeJobs && activeJobs.length > 0) {
    console.log("[RSS Sync] Another sync job is already processing. Skipping execution.");
    return summary;
  }
  const started = await client.from("ingestion_jobs").insert({ id: jobId, job_type: "rss:sync", provider: "rss", status: "processing", metadata: { source: options.source ?? null, force: Boolean(options.force), maxSources } });
  if (started.error) throw new ProviderError("Không thể tạo RSS sync job.", "supabase");
  for (const source of selected) {
    try { const result = await syncSource(source); summary.succeeded += 1; summary.notModified += result.status === "not_modified" ? 1 : 0; summary.fetched += result.fetched; summary.inserted += result.inserted; summary.skipped += result.skipped; }
    catch (error) { const safe = toSafeError(error); summary.failed += 1; summary.errors.push({ source: source.name, message: safe.message }); await client.from("news_sources").update({ last_fetched_at: new Date().toISOString(), last_error: safe.message.slice(0, 500) }).eq("id", source.id); }
  }
  await client.from("ingestion_jobs").update({ status: summary.failed === selected.length && selected.length ? "failed" : "completed", fetched_count: summary.fetched, inserted_count: summary.inserted, skipped_count: summary.skipped, error_code: summary.failed ? "PARTIAL_FAILURE" : null, error_message: summary.errors.map((item) => `${item.source}: ${item.message}`).join("; ").slice(0, 1000) || null, metadata: { sources: summary.sources, succeeded: summary.succeeded, failed: summary.failed, notModified: summary.notModified }, completed_at: new Date().toISOString() }).eq("id", jobId);
  return summary;
}

export async function rssReport() {
  const client = admin(); const [sources, pending, jobs] = await Promise.all([client.from("news_sources").select("id,name,rss_url,language,country,is_official,is_active,last_fetched_at,last_error,fetch_interval_minutes").order("name"), client.from("raw_articles").select("id", { count: "exact", head: true }).eq("processing_status", "pending"), client.from("ingestion_jobs").select("id,status,fetched_count,inserted_count,skipped_count,error_code,started_at,completed_at").eq("job_type", "rss:sync").order("started_at", { ascending: false }).limit(10)]);
  if (sources.error ?? pending.error ?? jobs.error) throw new ProviderError("Không thể tạo RSS report.", "supabase");
  return { generatedAt: new Date().toISOString(), sources: sources.data ?? [], pendingArticles: pending.count ?? 0, recentJobs: jobs.data ?? [] };
}
