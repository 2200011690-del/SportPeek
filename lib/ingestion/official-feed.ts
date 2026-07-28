import { formatDistanceToNowStrict } from "date-fns";
import { vi } from "date-fns/locale";
import { XMLParser } from "fast-xml-parser";
import { decode } from "html-entities";
import { getAIProvider } from "@/lib/ai";
import { configuredRssSources } from "@/lib/rss/sources";
import { calculateHotness, calculateReliability } from "@/lib/scoring";
import type { NewsItem, NewsSourceDetail } from "@/lib/types";
import { contentHash } from "./utils";

export type NewsLanguage = "vi" | "en";
type FeedConfig = { name: string; url: string; reliability: number; language: NewsLanguage; official?: boolean; defaultCategory?: string };
type RssMediaValue = string | number | { "#text"?: unknown; "@_url"?: unknown; "@_href"?: unknown; "@_src"?: unknown; "@_type"?: unknown } | RssMediaValue[];
type RssItem = {
  title?: string;
  link?: string | { "#text"?: string; "@_href"?: string };
  guid?: string | { "#text"?: string };
  description?: unknown;
  summary?: unknown;
  content?: unknown;
  "content:encoded"?: unknown;
  "media:content"?: RssMediaValue;
  "media:thumbnail"?: RssMediaValue;
  enclosure?: RssMediaValue;
  image?: RssMediaValue;
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
  imageUrl?: string;
};

export type NewsAIStatus = { provider: string; state: "ok" | "off" | "error"; translatedCount: number };
export type AggregatedNews = {
  data: NewsItem[];
  sources: string[];
  aiTranslation: boolean;
  aiStatus: NewsAIStatus;
  cached: boolean;
  stale: boolean;
  lastUpdatedAt: string;
};
type CachedAggregatedNews = Omit<AggregatedNews, "cached" | "stale"> & { expiresAt: number };
const cache = new Map<string, CachedAggregatedNews>();
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });
const STOP_WORDS = new Set("cua và với trong trên cho sau trước khi là đã sẽ một những các được từ về tại theo vào ra qua do this that with from after before over into says said for the and but are was were has have had not new latest more than its their his her của những các được trong trên với một khi sau trước theo cho tại từ về đã đang sẽ không".split(/\s+/));

function cleanText(value: unknown): string {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : value && typeof value === "object" && "#text" in value ? String((value as { "#text"?: unknown })["#text"] ?? "") : "";
  return decode(raw).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function rawMarkup(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return String((value as { "#text"?: unknown })["#text"] ?? "");
  return "";
}

export function normalizeNewsImageUrl(value: unknown, baseUrl?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const decoded = decode(value).trim().replace(/^['"]|['"]$/g, "");
  if (!decoded || /^(?:data|javascript|blob):/i.test(decoded)) return undefined;
  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded, baseUrl);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function mediaUrl(value: RssMediaValue | undefined, baseUrl: string): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = mediaUrl(entry, baseUrl);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    const type = typeof value["@_type"] === "string" ? value["@_type"] : "";
    if (type && !type.startsWith("image/")) return undefined;
    return normalizeNewsImageUrl(value["@_url"] ?? value["@_href"] ?? value["@_src"] ?? value["#text"], baseUrl);
  }
  return normalizeNewsImageUrl(typeof value === "number" ? String(value) : value, baseUrl);
}

export function extractImageFromMarkup(markup: string, baseUrl?: string): string | undefined {
  for (const attribute of ["data-original", "data-src", "src"]) {
    const match = markup.match(new RegExp(`<img\\b[^>]*?\\b${attribute}=["']([^"']+)["']`, "i"));
    const image = normalizeNewsImageUrl(match?.[1], baseUrl);
    if (image) return image;
  }
  return undefined;
}

function extractMetaImage(markup: string, baseUrl: string): string | undefined {
  const metaTags = markup.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (!/(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image|twitter:image:src)["']/i.test(tag)) continue;
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
    const image = normalizeNewsImageUrl(content, baseUrl);
    if (image) return image;
  }
  return undefined;
}

function feedsFromEnvironment(): FeedConfig[] {
  return configuredRssSources().map((source) => ({
    name: source.name,
    url: source.feedUrl,
    reliability: source.reliability,
    language: source.language,
    official: source.official,
    defaultCategory: source.defaultCategory,
  }));
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
    headers: { accept: "application/rss+xml, application/xml;q=0.9", "user-agent": "NewsPeek/1.0 (+https://newspeek.2200011690.workers.dev/sources)" },
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
    const descriptionMarkup = rawMarkup(item.description ?? item.summary);
    const contentMarkup = rawMarkup(item["content:encoded"] ?? item.content);
    const description = cleanText(descriptionMarkup);
    const encodedContent = cleanText(contentMarkup);
    const excerpt = (encodedContent.length > description.length ? encodedContent : description).slice(0, 800);
    const imageUrl = mediaUrl(item["media:content"], url)
      ?? mediaUrl(item["media:thumbnail"], url)
      ?? mediaUrl(item.enclosure, url)
      ?? mediaUrl(item.image, url)
      ?? extractImageFromMarkup(contentMarkup, url)
      ?? extractImageFromMarkup(descriptionMarkup, url);
    return [{
      id: contentHash({ title, url: guid ?? url }),
      title,
      excerpt: excerpt || `${feed.name} vừa phát hành bản tin này qua RSS. Mở nguồn gốc để đọc toàn bộ nội dung.`,
      url,
      published,
      category: feed.defaultCategory ?? (cleanText(Array.isArray(item.category) ? item.category[0] : item.category) || (feed.language === "en" ? "Thế giới" : "Việt Nam")),
      source: feed,
      translatedByAI: false,
      imageUrl,
    }];
  });
}

async function fetchArticleImage(article: RawArticle): Promise<void> {
  if (article.imageUrl) return;
  try {
    const response = await fetch(article.url, {
      headers: { accept: "text/html", "user-agent": "NewsPeek/1.0 (+https://newspeek.2200011690.workers.dev/sources)" },
      redirect: "follow",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return;
    const markup = await response.text();
    article.imageUrl = extractMetaImage(markup, response.url || article.url) ?? extractImageFromMarkup(markup, response.url || article.url);
  } catch {
    // A publisher may block metadata requests. The UI then shows an explicit,
    // branded fallback instead of pretending that a generic image is real.
  }
}

async function enrichMissingImages(articles: RawArticle[]): Promise<void> {
  const candidates = [...articles]
    .filter((article) => !article.imageUrl)
    .sort((a, b) => b.published.getTime() - a.published.getTime() || b.source.reliability - a.source.reliability)
    .slice(0, 10);
  await Promise.allSettled(candidates.map(fetchArticleImage));
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
  if (/khẩn cấp|breaking|thiên tai|động đất|bão|xung đột|chiến sự|bầu cử|quốc hội|chính phủ|lãi suất|dịch bệnh/.test(text)) return 88;
  if (/trí tuệ nhân tạo|công nghệ|kinh tế|thị trường|sức khỏe|khoa học|quốc tế|thế giới/.test(text)) return 76;
  return 58;
}

function paragraphize(value: string): string[] {
  const sentences = value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“])/u)
    .filter(Boolean);
  if (sentences.length <= 1) return value.trim() ? [value.trim()] : [];
  const paragraphs: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && `${current} ${sentence}`.length > 380) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

function buildReadingBody(cluster: RawArticle[], lead: RawArticle): string[] {
  const paragraphs: string[] = [];
  const signatures = new Set<string>();
  const add = (value: string) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const signature = cleanText(cleaned).toLowerCase().slice(0, 120);
    if (!cleaned || signatures.has(signature)) return;
    signatures.add(signature);
    paragraphs.push(cleaned);
  };
  const ordered = [lead, ...cluster.filter((article) => article.id !== lead.id)];
  for (const article of ordered) {
    for (const paragraph of paragraphize(article.excerpt)) add(paragraph);
    if (paragraphs.length >= 5) break;
  }
  if (lead.translatedByAI) {
    for (const point of lead.keyPoints ?? []) add(point);
  }
  return paragraphs.slice(0, 8);
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
  const details: NewsSourceDetail[] = cluster.map((article) => ({
    name: article.source.name,
    url: article.url,
    reliability: article.source.reliability,
    language: article.source.language,
    excerpt: article.excerpt.slice(0, 420),
    articleId: article.id,
    title: article.title,
    publishedAt: article.published.toISOString(),
    fetchedAt: new Date().toISOString(),
    isOfficialSource: Boolean(article.source.official),
    imageUrl: article.imageUrl,
    canonicalUrl: article.url,
  }));
  const keyPoints = lead.keyPoints?.length ? lead.keyPoints : [lead.excerpt, ...cluster.filter((article) => article.id !== lead.id).slice(0, 2).map((article) => article.title)].map((value) => value.slice(0, 190));
  const international = lead.source.language === "en";
  const category = lead.topic ?? lead.source.defaultCategory ?? lead.category ?? (international ? "Thế giới" : "Việt Nam");
  const imageArticle = [lead, ...cluster.filter((article) => article.id !== lead.id)].find((article) => article.imageUrl);
  return {
    id: `rss-${lead.id}`,
    title: lead.title,
    slug: `rss-${lead.id}`,
    summary: lead.excerpt.slice(0, 420),
    keyPoints: keyPoints.slice(0, 3),
    category,
    primaryTopic: category,
    region: international ? "Quốc tế" : "Việt Nam",
    publishedAt: formatDistanceToNowStrict(lead.published, { addSuffix: true, locale: vi }),
    publishedTimestamp: lead.published.toISOString(),
    hotness,
    reliability,
    sources: sources.map((source) => source.name),
    sourceDetails: details,
    imageUrl: imageArticle?.imageUrl,
    imageAlt: imageArticle ? `Ảnh minh họa cho tin “${lead.title}” từ ${imageArticle.source.name}` : undefined,
    imageSource: imageArticle?.source.name,
    readingBody: buildReadingBody(cluster, lead),
    originalUrl: lead.url,
    originalLanguage: lead.source.language,
    translatedByAI: lead.translatedByAI,
    trendingReasons: [
      sources.length >= 2 ? `${sources.length} nguồn độc lập cùng đưa tin` : "Mới xuất hiện trên một nguồn",
      ageHours <= 6 ? "Được đăng trong 6 giờ gần đây" : "Độ mới đang giảm theo thời gian",
      importance >= 76 ? "Chủ đề có mức ảnh hưởng hoặc quan tâm cao" : "Mức quan tâm được ước tính từ chủ đề",
    ],
    imageTone: ["red", "green", "blue", "amber", "cyan"][index % 5],
    featured: index < 2,
  };
}

async function translateInternational(articles: RawArticle[]): Promise<NewsAIStatus> {
  const provider = getAIProvider();
  if (["disabled", "heuristic", "mock"].includes(provider.name)) return { provider: provider.name === "disabled" ? "off" : provider.name, state: "off", translatedCount: 0 };
  const candidates = articles.filter((article) => article.source.language === "en").sort((a, b) => b.published.getTime() - a.published.getTime()).slice(0, 4);
  if (!candidates.length) return { provider: provider.name, state: "ok", translatedCount: 0 };
  const settled = await Promise.allSettled(candidates.map(async (article) => ({
    article,
    result: await provider.summarizeCluster({ articles: [{ id: article.id, title: article.title, excerpt: article.excerpt }] }),
  })));
  let translatedCount = 0;
  const meaningful = (value: string, minimum: number) => value.replace(/[^\p{L}\p{N}]/gu, "").length >= minimum;
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    const { article, result } = entry.value;
    if (!meaningful(result.title, 8) || !meaningful(result.summary, 24) || !result.keyPoints.some((point) => meaningful(point, 10))) continue;
    article.title = result.title;
    article.excerpt = result.summary;
    article.keyPoints = result.keyPoints;
    article.translatedByAI = true;
    translatedCount += 1;
  }
  const actualProvider = provider.name === "failover" && "lastProviderName" in provider && typeof provider.lastProviderName === "string" ? provider.lastProviderName : provider.name;
  if (!translatedCount) return { provider: actualProvider, state: "error", translatedCount: 0 };
  return { provider: actualProvider, state: "ok", translatedCount };
}

export async function getOfficialNews(): Promise<NewsItem[]> {
  return (await getAggregatedNews()).data;
}

export async function getAggregatedNews(): Promise<AggregatedNews> {
  const feeds = feedsFromEnvironment();
  const key = feeds.map((feed) => feed.url).join("|") + `|${process.env.AI_PROVIDER ?? "mock"}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, sources: cached.sources, aiTranslation: cached.aiTranslation, aiStatus: cached.aiStatus, lastUpdatedAt: cached.lastUpdatedAt, cached: true, stale: false };
  }
  const settled = await Promise.allSettled(feeds.map(fetchFeed));
  const articles = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!articles.length) {
    if (cached) {
      return { data: cached.data, sources: cached.sources, aiTranslation: cached.aiTranslation, aiStatus: cached.aiStatus, lastUpdatedAt: cached.lastUpdatedAt, cached: true, stale: true };
    }
    throw new Error("Không tải được các nguồn RSS");
  }
  const deduplicated = [...new Map(articles.map((article) => [article.url, article])).values()];
  await enrichMissingImages(deduplicated);
  let aiStatus: NewsAIStatus;
  try { aiStatus = await translateInternational(deduplicated); }
  catch (error) {
    console.warn("[NewsPeek AI] Translation failed:", error instanceof Error ? error.message : "unknown error");
    const requested = process.env.AI_PROVIDER?.toLowerCase();
    aiStatus = requested && requested !== "off" && requested !== "disabled"
      ? { provider: requested, state: "error", translatedCount: 0 }
      : { provider: "off", state: "off", translatedCount: 0 };
  }
  const aiTranslation = aiStatus.translatedCount > 0;
  // The main newsroom promises "latest", so recency is the primary order.
  // Hotness remains visible and is used separately for the home highlights.
  const data = clusterArticles(deduplicated).map(toNewsItem).sort((a, b) => {
    const newest = Date.parse(b.publishedTimestamp ?? "") - Date.parse(a.publishedTimestamp ?? "");
    return (Number.isNaN(newest) ? 0 : newest) || b.hotness - a.hotness || b.reliability - a.reliability;
  }).slice(0, 60);
  const sources = [...new Set(deduplicated.map((article) => article.source.name))];
  const cacheTtl = aiStatus.state === "error" ? 30_000 : 5 * 60_000;
  const lastUpdatedAt = new Date().toISOString();
  cache.set(key, { data, sources, aiTranslation, aiStatus, lastUpdatedAt, expiresAt: Date.now() + cacheTtl });
  return { data, sources, aiTranslation, aiStatus, lastUpdatedAt, cached: false, stale: false };
}
