import { formatDistanceToNowStrict } from "date-fns";
import { vi } from "date-fns/locale";
import { XMLParser } from "fast-xml-parser";
import { decode } from "html-entities";
import { enrichInternationalNewsWithCloudflare, hasWorkersAIBinding } from "@/lib/ai/cloudflare";
import { enrichInternationalNews } from "@/lib/ai/openai";
import { calculateHotness, calculateReliability } from "@/lib/scoring";
import type { NewsItem, NewsSourceDetail } from "@/lib/types";
import { contentHash } from "./utils";

export type NewsLanguage = "vi" | "en";
type FeedConfig = { name: string; url: string; reliability: number; language: NewsLanguage; official?: boolean };
type RssItem = {
  title?: string;
  link?: string | { "#text"?: string; "@_href"?: string };
  guid?: string | { "#text"?: string };
  description?: string;
  pubDate?: string;
  published?: string;
  updated?: string;
  category?: unknown;
};
type RawArticle = {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  published: Date;
  category: string;
  source: FeedConfig;
  translatedByAI: boolean;
  importance?: number;
  keyPoints?: string[];
  topic?: string;
};

// RSS feeds deliberately exposed by each publisher for syndication. SportPeek only
// stores metadata, short excerpts and outbound links; it never republishes full text.
const DEFAULT_FEEDS: FeedConfig[] = [
  { name: "VFF", url: "https://vff.org.vn/feed/", reliability: 98, language: "vi", official: true },
  { name: "VPF", url: "https://vpf.vn/feed/", reliability: 98, language: "vi", official: true },
  { name: "VnExpress Thể thao", url: "https://vnexpress.net/rss/the-thao.rss", reliability: 92, language: "vi" },
  { name: "Tuổi Trẻ Thể thao", url: "https://tuoitre.vn/rss/the-thao.rss", reliability: 91, language: "vi" },
  { name: "Thanh Niên Thể thao", url: "https://thanhnien.vn/rss/the-thao.rss", reliability: 90, language: "vi" },
  { name: "VietNamNet Thể thao", url: "https://vietnamnet.vn/rss/the-thao.rss", reliability: 89, language: "vi" },
  { name: "Dân trí Thể thao", url: "https://dantri.com.vn/rss/the-thao.rss", reliability: 89, language: "vi" },
  { name: "VOV Thể thao", url: "https://vov.vn/rss/the-thao.rss", reliability: 91, language: "vi" },
  { name: "BBC Sport Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", reliability: 94, language: "en" },
  { name: "The Guardian Football", url: "https://www.theguardian.com/football/rss", reliability: 92, language: "en" },
  { name: "ESPN Soccer", url: "https://www.espn.com/espn/rss/soccer/news", reliability: 90, language: "en" },
  { name: "Sky Sports Football", url: "https://www.skysports.com/rss/12040", reliability: 90, language: "en" },
];

export type NewsAIStatus = { provider: "cloudflare" | "openai" | "off"; state: "ok" | "off" | "error"; translatedCount: number };
type AggregatedNews = { data: NewsItem[]; sources: string[]; aiTranslation: boolean; aiStatus: NewsAIStatus };
const cache = new Map<string, AggregatedNews & { expiresAt: number }>();
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const STOP_WORDS = new Set("cua và với trong trên cho sau trước khi là đã sẽ một những các được từ về tại theo vào ra qua do this that with from after before over into says said for the and but are was were has have had not new latest more than its their his her của những các được trong trên với một khi sau trước theo cho tại từ về đã đang sẽ không".split(/\s+/));

function cleanText(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : value && typeof value === "object" && "#text" in value ? String((value as { "#text"?: unknown })["#text"] ?? "") : "";
  return decode(raw).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function feedsFromEnvironment(): FeedConfig[] {
  const configured = process.env.NEWS_RSS_FEEDS?.trim();
  if (!configured) return DEFAULT_FEEDS;
  try {
    const parsed = JSON.parse(configured) as FeedConfig[];
    return parsed.filter((feed) => feed.name && feed.url?.startsWith("https://") && ["vi", "en"].includes(feed.language));
  } catch {
    return configured.split(",").map((url, index) => ({ name: `Nguồn tùy chỉnh ${index + 1}`, url: url.trim(), reliability: 85, language: "vi" as const })).filter((feed) => feed.url.startsWith("https://"));
  }
}

function valueOfLink(link: RssItem["link"], fallback: string): string {
  if (typeof link === "string") return link;
  return link?.["@_href"] ?? link?.["#text"] ?? fallback;
}

export function normalizePublishedDate(value?: string, now = new Date(), assumeVietnamTime = false): Date | null {
  if (!value) return null;
  const normalized = value.replace(/[\u00a0\u202f]/g, " ").trim();
  const vietnameseLocal = assumeVietnamTime && normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  let parsed: Date;
  if (vietnameseLocal) {
    const [, month, day, year, rawHour, minute, second = "0", period] = vietnameseLocal;
    let hour = Number(rawHour) % 12;
    if (period.toUpperCase() === "PM") hour += 12;
    parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour - 7, Number(minute), Number(second)));
  } else if (/\bBST$/i.test(normalized)) {
    const wallClock = new Date(normalized.replace(/\bBST$/i, "GMT"));
    parsed = new Date(wallClock.getTime() - 60 * 60_000);
  } else if (/\bEST$/i.test(normalized)) {
    const wallClock = new Date(normalized.replace(/\bEST$/i, "GMT"));
    const daylightSaving = wallClock.getUTCMonth() >= 2 && wallClock.getUTCMonth() <= 10;
    parsed = new Date(wallClock.getTime() + (daylightSaving ? 4 : 5) * 60 * 60_000);
  } else {
    parsed = new Date(normalized);
  }
  if (Number.isNaN(parsed.getTime())) return null;
  // A few publisher feeds occasionally expose a future timestamp because of
  // timezone mistakes. Do not let those entries look newer than real news.
  if (parsed.getTime() > now.getTime() + 10 * 60_000) return now;
  return parsed;
}

async function fetchFeed(feed: FeedConfig): Promise<RawArticle[]> {
  const response = await fetch(feed.url, {
    headers: { accept: "application/rss+xml, application/xml;q=0.9", "user-agent": "SportPeek/1.0 (+https://sportpeek-vn-demo.dangkhoa1546.chatgpt.site/sources)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
  const parsed = parser.parse(await response.text()) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
    feed?: { entry?: RssItem | RssItem[] };
  };
  const items = parsed.rss?.channel?.item ?? parsed.feed?.entry;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.slice(0, 16).flatMap((item) => {
    const title = cleanText(item.title);
    const url = valueOfLink(item.link, feed.url);
    if (!title || !url.startsWith("http")) return [];
    const guid = typeof item.guid === "string" ? item.guid : item.guid?.["#text"];
    const published = normalizePublishedDate(item.pubDate ?? item.published ?? item.updated, new Date(), feed.language === "vi");
    if (!published) return [];
    return [{
      id: contentHash({ title, url: guid ?? url }),
      title,
      excerpt: cleanText(item.description).slice(0, 520) || "Đọc nội dung đầy đủ tại nguồn gốc.",
      url,
      published,
      category: cleanText(Array.isArray(item.category) ? item.category[0] : item.category) || "Thể thao",
      source: feed,
      translatedByAI: false,
    }];
  });
}

function tokens(value: string): Set<string> {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  return new Set(normalized.split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function sameStory(left: RawArticle, right: RawArticle): boolean {
  if (Math.abs(left.published.getTime() - right.published.getTime()) > 72 * 3_600_000) return false;
  const a = tokens(left.title); const b = tokens(right.title);
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared >= 3 && shared / Math.max(1, Math.min(a.size, b.size)) >= 0.52;
}

function clusterArticles(articles: RawArticle[]): RawArticle[][] {
  const clusters: RawArticle[][] = [];
  for (const article of articles.sort((a, b) => b.published.getTime() - a.published.getTime())) {
    const existing = clusters.find((cluster) => cluster.some((candidate) => sameStory(article, candidate)));
    if (existing) existing.push(article); else clusters.push([article]);
  }
  return clusters;
}

function importanceFromText(article: RawArticle): number {
  if (article.importance) return article.importance;
  const text = `${article.title} ${article.category}`.toLowerCase();
  if (/chung kết|final|vô địch|champion|world cup|đội tuyển việt nam|vietnam/.test(text)) return 88;
  if (/champions league|premier league|la liga|serie a|v.league|chuyển nhượng|transfer/.test(text)) return 76;
  return 58;
}

function toNewsItem(cluster: RawArticle[], index: number): NewsItem {
  const sources = [...new Map(cluster.map((article) => [article.source.name, article.source])).values()];
  const lead = [...cluster].sort((a, b) => Number(b.translatedByAI) - Number(a.translatedByAI) || b.published.getTime() - a.published.getTime() || b.source.reliability - a.source.reliability)[0];
  const ageHours = Math.max(0, (Date.now() - lead.published.getTime()) / 3_600_000);
  const averageReliability = sources.reduce((sum, source) => sum + source.reliability, 0) / sources.length;
  const official = sources.some((source) => source.official);
  const speculative = /tin đồn|có thể|được cho là|reportedly|rumou?r|could|may /.test(`${lead.title} ${lead.excerpt}`.toLowerCase());
  const reliability = calculateReliability({ sourceScores: sources.map((source) => source.reliability), independentSources: sources.length, official, speculativeLanguage: speculative });
  const importance = Math.max(...cluster.map(importanceFromText));
  const hotness = calculateHotness({ ageHours, sourceCount: sources.length, averageSourceReliability: averageReliability, entityPopularity: importance, readVelocity: Math.min(100, 28 + sources.length * 17 + Math.max(0, 24 - ageHours)), eventImportance: importance, verified: official || sources.length >= 2 });
  const details: NewsSourceDetail[] = cluster.map((article) => ({ name: article.source.name, url: article.url, reliability: article.source.reliability, language: article.source.language }));
  const keyPoints = lead.keyPoints?.length ? lead.keyPoints : [lead.excerpt, ...cluster.filter((article) => article.id !== lead.id).slice(0, 2).map((article) => article.title)].map((value) => value.slice(0, 190));
  const international = lead.source.language === "en";
  return {
    id: `rss-${lead.id}`,
    title: lead.title,
    slug: `rss-${lead.id}`,
    summary: lead.excerpt.slice(0, 420),
    keyPoints: keyPoints.slice(0, 3),
    category: international ? `${lead.topic ?? lead.category} · Quốc tế` : `${lead.category} · Việt Nam`,
    competition: lead.topic ?? (international ? "Bóng đá quốc tế" : "Thể thao Việt Nam"),
    team: international ? "Bóng đá quốc tế" : "Thể thao Việt Nam",
    publishedAt: formatDistanceToNowStrict(lead.published, { addSuffix: true, locale: vi }),
    publishedTimestamp: lead.published.toISOString(),
    hotness,
    reliability,
    sources: sources.map((source) => source.name),
    sourceDetails: details,
    originalUrl: lead.url,
    originalLanguage: lead.source.language,
    translatedByAI: lead.translatedByAI,
    trendingReasons: [
      sources.length >= 2 ? `${sources.length} nguồn độc lập cùng đưa tin` : "Mới xuất hiện trên một nguồn",
      ageHours <= 6 ? "Được đăng trong 6 giờ gần đây" : "Độ mới đang giảm theo thời gian",
      importance >= 76 ? "Liên quan đội tuyển, giải đấu hoặc sự kiện lớn" : "Mức quan tâm được ước tính từ chủ đề",
    ],
    imageTone: ["red", "green", "blue", "amber", "cyan"][index % 5],
    featured: index < 2,
  };
}

async function translateInternational(articles: RawArticle[]): Promise<NewsAIStatus> {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  if (requested !== "cloudflare" && requested !== "openai") return { provider: "off", state: "off", translatedCount: 0 };
  const provider = requested as "cloudflare" | "openai";
  const available = provider === "cloudflare" ? hasWorkersAIBinding() : Boolean(process.env.OPENAI_API_KEY);
  if (!available) return { provider, state: "error", translatedCount: 0 };
  const candidates = articles.filter((article) => article.source.language === "en").sort((a, b) => b.published.getTime() - a.published.getTime()).slice(0, 8);
  if (!candidates.length) return { provider, state: "ok", translatedCount: 0 };
  const input = candidates.map((article) => ({ id: article.id, title: article.title, excerpt: article.excerpt }));
  const enriched = provider === "cloudflare"
    ? await enrichInternationalNewsWithCloudflare(input)
    : await enrichInternationalNews(input);
  const byId = new Map(enriched.map((item) => [item.id, item]));
  for (const article of candidates) {
    const result = byId.get(article.id);
    if (!result) continue;
    article.title = result.titleVi;
    article.excerpt = result.summaryVi;
    article.keyPoints = result.keyPoints;
    article.topic = result.topic;
    article.importance = result.importance;
    article.translatedByAI = true;
  }
  if (!enriched.length) return { provider, state: "error", translatedCount: 0 };
  return { provider, state: "ok", translatedCount: enriched.length };
}

export async function getOfficialNews(): Promise<NewsItem[]> {
  return (await getAggregatedNews()).data;
}

export async function getAggregatedNews(): Promise<AggregatedNews> {
  const feeds = feedsFromEnvironment();
  const key = feeds.map((feed) => feed.url).join("|") + `|${process.env.AI_PROVIDER ?? "mock"}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const settled = await Promise.allSettled(feeds.map(fetchFeed));
  const articles = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!articles.length) throw new Error("Không tải được các nguồn RSS");
  const deduplicated = [...new Map(articles.map((article) => [article.url, article])).values()];
  let aiStatus: NewsAIStatus;
  try { aiStatus = await translateInternational(deduplicated); }
  catch { aiStatus = { provider: process.env.AI_PROVIDER?.toLowerCase() === "openai" ? "openai" : "cloudflare", state: "error", translatedCount: 0 }; }
  const aiTranslation = aiStatus.translatedCount > 0;
  // The main newsroom promises "latest", so recency is the primary order.
  // Hotness remains visible and is used separately for the home highlights.
  const data = clusterArticles(deduplicated).map(toNewsItem).sort((a, b) => {
    const newest = Date.parse(b.publishedTimestamp ?? "") - Date.parse(a.publishedTimestamp ?? "");
    return (Number.isNaN(newest) ? 0 : newest) || b.hotness - a.hotness || b.reliability - a.reliability;
  }).slice(0, 60);
  const sources = [...new Set(deduplicated.map((article) => article.source.name))];
  const result = { data, sources, aiTranslation, aiStatus, expiresAt: Date.now() + 5 * 60_000 };
  cache.set(key, result);
  return result;
}
