import { formatDistanceToNowStrict } from "date-fns";
import { vi } from "date-fns/locale";
import { XMLParser } from "fast-xml-parser";
import { calculateHotness } from "@/lib/scoring";
import type { NewsItem } from "@/lib/types";
import { contentHash } from "./utils";

const DEFAULT_FEEDS = [
  { name: "Liên đoàn Bóng đá Việt Nam (VFF)", url: "https://vff.org.vn/feed/", reliability: 98 },
  { name: "Công ty VPF", url: "https://vpf.vn/feed/", reliability: 98 },
] as const;

type FeedConfig = { name: string; url: string; reliability: number };
type RssItem = { title?: string; link?: string; guid?: string | { "#text"?: string }; description?: string; pubDate?: string; category?: string | string[] };

const cache = new Map<string, { expiresAt: number; data: NewsItem[] }>();
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&hellip;|&#8230;/gi, "…").replace(/&quot;/gi, '"').replace(/&#8217;|&rsquo;/gi, "’").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function feedsFromEnvironment(): FeedConfig[] {
  const configured = process.env.NEWS_RSS_FEEDS;
  if (!configured) return [...DEFAULT_FEEDS];
  return configured.split(",").map((entry, index) => ({ name: `Nguồn chính thức ${index + 1}`, url: entry.trim(), reliability: 90 })).filter((feed) => feed.url.startsWith("https://"));
}

async function fetchFeed(feed: FeedConfig): Promise<NewsItem[]> {
  const response = await fetch(feed.url, { headers: { accept: "application/rss+xml, application/xml;q=0.9", "user-agent": "SportPeek/1.0 (+https://sportpeek.local/sources)" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
  const parsed = parser.parse(await response.text()) as { rss?: { channel?: { item?: RssItem | RssItem[] } } };
  const items = parsed.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.slice(0, 20).map((item, index) => {
    const title = cleanText(item.title) || "Bản tin bóng đá Việt Nam";
    const originalUrl = typeof item.link === "string" ? item.link : feed.url;
    const published = item.pubDate ? new Date(item.pubDate) : new Date();
    const ageHours = Math.max(0, (Date.now() - published.getTime()) / 3_600_000);
    const summary = cleanText(item.description).slice(0, 420) || "Thông tin chính thức đang được cập nhật tại nguồn gốc.";
    const guid = typeof item.guid === "string" ? item.guid : item.guid?.["#text"];
    const id = contentHash({ title, url: guid ?? originalUrl });
    const category = Array.isArray(item.category) ? item.category[0] : item.category;
    const sentences = summary.split(/(?<=[.!?…])\s+/).filter(Boolean);
    return {
      id: `rss-${id}`,
      title,
      slug: `rss-${id}`,
      summary,
      keyPoints: sentences.slice(0, 3).length ? sentences.slice(0, 3) : ["Thông tin từ nguồn chính thức", "Nội dung đầy đủ có tại bài gốc"],
      category: `${cleanText(category) || "Tin chính thức"} · Nguồn trực tiếp`,
      competition: title.toLowerCase().includes("v.league") ? "V.League 1" : "Bóng đá Việt Nam",
      team: "Bóng đá Việt Nam",
      publishedAt: formatDistanceToNowStrict(published, { addSuffix: true, locale: vi }),
      hotness: calculateHotness({ ageHours, sourceCount: 1, averageSourceReliability: feed.reliability, entityPopularity: 75, readVelocity: 45, eventImportance: category?.toLowerCase().includes("đội tuyển") ? 85 : 60, verified: true }),
      reliability: feed.reliability,
      sources: [feed.name],
      originalUrl,
      imageTone: ["red", "green", "blue", "amber", "cyan"][index % 5],
      featured: index < 2,
    } satisfies NewsItem;
  });
}

export async function getOfficialNews(): Promise<NewsItem[]> {
  const feeds = feedsFromEnvironment();
  const key = feeds.map((feed) => feed.url).join("|");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const settled = await Promise.allSettled(feeds.map(fetchFeed));
  const data = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []).sort((a, b) => b.hotness - a.hotness).slice(0, 30);
  if (!data.length) throw new Error("Không tải được nguồn RSS chính thức");
  cache.set(key, { data, expiresAt: Date.now() + 5 * 60_000 });
  return data;
}
