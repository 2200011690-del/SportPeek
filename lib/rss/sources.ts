export type DefaultRssSource = { name: string; feedUrl: string; language: "vi" | "en"; country: string; reliability: number; official?: boolean; fetchIntervalMinutes?: number };

export const DEFAULT_RSS_SOURCES: DefaultRssSource[] = [
  { name: "VFF", feedUrl: "https://vff.org.vn/feed/", language: "vi", country: "VN", reliability: 98, official: true },
  { name: "VPF", feedUrl: "https://vpf.vn/feed/", language: "vi", country: "VN", reliability: 98, official: true },
  { name: "VnExpress Thể thao", feedUrl: "https://vnexpress.net/rss/the-thao.rss", language: "vi", country: "VN", reliability: 92 },
  { name: "Tuổi Trẻ Thể thao", feedUrl: "https://tuoitre.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 91 },
  { name: "Thanh Niên Thể thao", feedUrl: "https://thanhnien.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 90 },
  { name: "VietNamNet Thể thao", feedUrl: "https://vietnamnet.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 89 },
  { name: "Dân trí Thể thao", feedUrl: "https://dantri.com.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 89 },
  { name: "VOV Thể thao", feedUrl: "https://vov.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 91 },
  { name: "BBC Sport Football", feedUrl: "https://feeds.bbci.co.uk/sport/football/rss.xml", language: "en", country: "GB", reliability: 94 },
  { name: "The Guardian Football", feedUrl: "https://www.theguardian.com/football/rss", language: "en", country: "GB", reliability: 92 },
  { name: "ESPN Soccer", feedUrl: "https://www.espn.com/espn/rss/soccer/news", language: "en", country: "US", reliability: 90 },
  { name: "Sky Sports Football", feedUrl: "https://www.skysports.com/rss/12040", language: "en", country: "GB", reliability: 90 },
];

export function configuredRssSources(): DefaultRssSource[] {
  const raw = process.env.NEWS_RSS_FEEDS?.trim();
  if (!raw) return DEFAULT_RSS_SOURCES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RSS_SOURCES;
    return parsed.flatMap((value, index): DefaultRssSource[] => {
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>; const feedUrl = typeof record.url === "string" ? record.url : typeof record.feedUrl === "string" ? record.feedUrl : "";
      if (!/^https?:\/\//i.test(feedUrl)) return [];
      return [{ name: typeof record.name === "string" ? record.name : `Nguồn ${index + 1}`, feedUrl, language: record.language === "en" ? "en" : "vi", country: typeof record.country === "string" ? record.country : record.language === "en" ? "INT" : "VN", reliability: typeof record.reliability === "number" ? Math.max(0, Math.min(100, Math.round(record.reliability))) : 80, official: record.official === true }];
    });
  } catch { return DEFAULT_RSS_SOURCES; }
}
