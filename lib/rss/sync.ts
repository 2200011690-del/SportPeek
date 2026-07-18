import { createHash, randomUUID } from "node:crypto";
import { ConfigurationError, ProviderError, toSafeError } from "@/lib/core/errors";
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

async function persistArticles(source: RssSource, articles: ParsedRssArticle[]): Promise<{ inserted: number; skipped: number }> {
  const client = admin(); const { data: existing, error: lookupError } = await client.from("raw_articles").select("external_id,original_url,canonical_url,content_hash,normalized_title,published_at").eq("source_id", source.id).order("published_at", { ascending: false }).limit(2000);
  if (lookupError) throw new ProviderError("Không thể kiểm tra RSS duplicate.", "supabase");
  const rows = existing ?? []; const externalIds = new Set(rows.map((row) => row.external_id).filter(Boolean)); const originals = new Set(rows.map((row) => row.original_url)); const canonicals = new Set(rows.map((row) => row.canonical_url).filter(Boolean)); const hashes = new Set(rows.map((row) => row.content_hash));
  const titleTimes = new Map<string, number[]>(); for (const row of rows) { if (!row.normalized_title) continue; const list = titleTimes.get(row.normalized_title) ?? []; list.push(Date.parse(row.published_at)); titleTimes.set(row.normalized_title, list); }
  const accepted: Array<ParsedRssArticle & { contentHash: string }> = [];
  for (const article of articles) {
    const contentHash = rssContentHash(source.id, article); const published = Date.parse(article.publishedAt); const titleDuplicate = (titleTimes.get(article.normalizedTitle) ?? []).some((timestamp) => Math.abs(timestamp - published) <= 6 * 60 * 60_000);
    if (externalIds.has(article.externalId) || originals.has(article.originalUrl) || canonicals.has(article.canonicalUrl) || hashes.has(contentHash) || titleDuplicate) continue;
    accepted.push({ ...article, contentHash }); externalIds.add(article.externalId); originals.add(article.originalUrl); canonicals.add(article.canonicalUrl); hashes.add(contentHash); const times = titleTimes.get(article.normalizedTitle) ?? []; times.push(published); titleTimes.set(article.normalizedTitle, times);
  }
  let inserted = 0;
  for (let index = 0; index < accepted.length; index += 50) {
    const batch = accepted.slice(index, index + 50).map((article) => ({ source_id: source.id, external_id: article.externalId, original_url: article.originalUrl, canonical_url: article.canonicalUrl, title: article.title, normalized_title: article.normalizedTitle, excerpt: article.excerpt, author: article.author, image_url: article.imageUrl, published_at: article.publishedAt, fetched_at: new Date().toISOString(), content_hash: article.contentHash, language: article.language, processing_status: "pending", raw_metadata: article.rawMetadata }));
    const { data, error } = await client.from("raw_articles").upsert(batch, { onConflict: "content_hash", ignoreDuplicates: true }).select("id");
    if (error) throw new ProviderError("Không thể lưu batch raw article.", "supabase");
    inserted += data?.length ?? 0;
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
