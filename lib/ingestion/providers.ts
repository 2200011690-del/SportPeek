import { news } from "@/lib/demo-data";
import { normalizeArticle } from "./utils";
import type { ExternalArticle, NewsProvider } from "./types";

export class MockNewsProvider implements NewsProvider {
  readonly name = "mock";
  async fetchArticles(): Promise<ExternalArticle[]> { return news.slice(0, 5).map((item) => ({ externalId: item.id, url: `https://example.com/demo/${item.slug}`, title: item.title, excerpt: item.summary, publishedAt: new Date().toISOString() })); }
  async normalizeArticle(article: ExternalArticle, sourceId: string) { return normalizeArticle(article, sourceId); }
}

async function fetchWithRetry(url: string, attempts = 2): Promise<Response> {
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "NewsPeek/1.0 (+https://newspeek.2200011690.workers.dev/sources)" } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response; } catch (caught) { error = caught; }
  }
  throw error instanceof Error ? error : new Error("Không thể tải nguồn tin");
}

export class JsonNewsProvider implements NewsProvider {
  readonly name = "json";
  constructor(private readonly endpoint: string) {}
  async fetchArticles(): Promise<ExternalArticle[]> { const response = await fetchWithRetry(this.endpoint); const data: unknown = await response.json(); if (!Array.isArray(data)) throw new Error("JSON provider phải trả về một mảng"); return data as ExternalArticle[]; }
  async normalizeArticle(article: ExternalArticle, sourceId: string) { return normalizeArticle(article, sourceId); }
}

export class RssNewsProvider implements NewsProvider {
  readonly name = "rss";
  constructor(private readonly feedUrl: string) {}
  async fetchArticles(): Promise<ExternalArticle[]> { const xml = await (await fetchWithRetry(this.feedUrl)).text(); return [...xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g)].slice(0, 30).map((match, index) => ({ externalId: `${index}-${match[2]}`, url: match[2].trim(), title: match[1].trim(), excerpt: "Trích đoạn ngắn từ RSS.", publishedAt: new Date().toISOString() })); }
  async normalizeArticle(article: ExternalArticle, sourceId: string) { return normalizeArticle(article, sourceId); }
}
