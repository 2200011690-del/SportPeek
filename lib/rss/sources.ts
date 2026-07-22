export type DefaultRssSource = {
  name: string;
  feedUrl: string;
  language: "vi" | "en";
  country: string;
  reliability: number;
  official?: boolean;
  fetchIntervalMinutes?: number;
  defaultCategory?: string;
};

export const DEFAULT_RSS_SOURCES: DefaultRssSource[] = [
  { name: "VnExpress Mới nhất", feedUrl: "https://vnexpress.net/rss/tin-moi-nhat.rss", language: "vi", country: "VN", reliability: 92, fetchIntervalMinutes: 10 },
  { name: "VnExpress Thế giới", feedUrl: "https://vnexpress.net/rss/the-gioi.rss", language: "vi", country: "VN", reliability: 92, fetchIntervalMinutes: 10, defaultCategory: "Thế giới" },
  { name: "VnExpress Kinh doanh", feedUrl: "https://vnexpress.net/rss/kinh-doanh.rss", language: "vi", country: "VN", reliability: 92, fetchIntervalMinutes: 10, defaultCategory: "Kinh tế" },
  { name: "VnExpress Khoa học Công nghệ", feedUrl: "https://vnexpress.net/rss/khoa-hoc-cong-nghe.rss", language: "vi", country: "VN", reliability: 92, fetchIntervalMinutes: 10, defaultCategory: "Công nghệ" },
  { name: "Tuổi Trẻ Mới nhất", feedUrl: "https://tuoitre.vn/rss/tin-moi-nhat.rss", language: "vi", country: "VN", reliability: 91, fetchIntervalMinutes: 10 },
  { name: "Tuổi Trẻ Thế giới", feedUrl: "https://tuoitre.vn/rss/the-gioi.rss", language: "vi", country: "VN", reliability: 91, fetchIntervalMinutes: 10, defaultCategory: "Thế giới" },
  { name: "Thanh Niên Trang chủ", feedUrl: "https://thanhnien.vn/rss/home.rss", language: "vi", country: "VN", reliability: 90, fetchIntervalMinutes: 10 },
  { name: "Thanh Niên Công nghệ", feedUrl: "https://thanhnien.vn/rss/cong-nghe.rss", language: "vi", country: "VN", reliability: 90, fetchIntervalMinutes: 10, defaultCategory: "Công nghệ" },
  { name: "Thanh Niên Sức khỏe", feedUrl: "https://thanhnien.vn/rss/suc-khoe.rss", language: "vi", country: "VN", reliability: 90, fetchIntervalMinutes: 10, defaultCategory: "Sức khỏe" },
  { name: "Thanh Niên Văn hóa", feedUrl: "https://thanhnien.vn/rss/van-hoa.rss", language: "vi", country: "VN", reliability: 90, fetchIntervalMinutes: 10, defaultCategory: "Văn hóa & Giải trí" },
  { name: "Thanh Niên Thể thao", feedUrl: "https://thanhnien.vn/rss/the-thao.rss", language: "vi", country: "VN", reliability: 90, fetchIntervalMinutes: 10, defaultCategory: "Thể thao" },
  { name: "Dân trí Trang chủ", feedUrl: "https://dantri.com.vn/rss/home.rss", language: "vi", country: "VN", reliability: 89, fetchIntervalMinutes: 10 },
  { name: "VietNamNet Thế giới", feedUrl: "https://vietnamnet.vn/rss/the-gioi.rss", language: "vi", country: "VN", reliability: 89, fetchIntervalMinutes: 10, defaultCategory: "Thế giới" },
  { name: "Nhân Dân Trang chủ", feedUrl: "https://nhandan.vn/rss/home.rss", language: "vi", country: "VN", reliability: 91, official: true, fetchIntervalMinutes: 10 },
  { name: "VietnamPlus Trang chủ", feedUrl: "https://www.vietnamplus.vn/rss/home.rss", language: "vi", country: "VN", reliability: 90, official: true, fetchIntervalMinutes: 10 },
  { name: "VTV Trang chủ", feedUrl: "https://vtv.vn/rss/home.rss", language: "vi", country: "VN", reliability: 90, official: true, fetchIntervalMinutes: 10 },
  { name: "BBC World", feedUrl: "https://feeds.bbci.co.uk/news/world/rss.xml", language: "en", country: "GB", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "BBC Business", feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml", language: "en", country: "GB", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Kinh tế" },
  { name: "BBC Technology", feedUrl: "https://feeds.bbci.co.uk/news/technology/rss.xml", language: "en", country: "GB", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Công nghệ" },
  { name: "BBC Science & Environment", feedUrl: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", language: "en", country: "GB", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Khoa học" },
  { name: "BBC Health", feedUrl: "https://feeds.bbci.co.uk/news/health/rss.xml", language: "en", country: "GB", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Sức khỏe" },
  { name: "The Guardian World", feedUrl: "https://www.theguardian.com/world/rss", language: "en", country: "GB", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "The Guardian Technology", feedUrl: "https://www.theguardian.com/technology/rss", language: "en", country: "GB", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Công nghệ" },
  { name: "Al Jazeera", feedUrl: "https://www.aljazeera.com/xml/rss/all.xml", language: "en", country: "QA", reliability: 91, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "NPR World", feedUrl: "https://feeds.npr.org/1004/rss.xml", language: "en", country: "US", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "NPR Technology", feedUrl: "https://feeds.npr.org/1019/rss.xml", language: "en", country: "US", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Công nghệ" },
  { name: "NPR Science", feedUrl: "https://feeds.npr.org/1007/rss.xml", language: "en", country: "US", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Khoa học" },
  { name: "DW News", feedUrl: "https://rss.dw.com/xml/rss-en-all", language: "en", country: "DE", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "New York Times World", feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", language: "en", country: "US", reliability: 94, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "New York Times Science", feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", language: "en", country: "US", reliability: 94, fetchIntervalMinutes: 20, defaultCategory: "Khoa học" },
  { name: "France 24", feedUrl: "https://www.france24.com/en/rss", language: "en", country: "FR", reliability: 91, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "UN News", feedUrl: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", language: "en", country: "UN", reliability: 95, official: true, fetchIntervalMinutes: 20, defaultCategory: "Thế giới" },
  { name: "ABC Australia", feedUrl: "https://www.abc.net.au/news/feed/51120/rss.xml", language: "en", country: "AU", reliability: 92, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "Euronews", feedUrl: "https://www.euronews.com/rss?level=theme&name=news", language: "en", country: "EU", reliability: 90, fetchIntervalMinutes: 15, defaultCategory: "Thế giới" },
  { name: "NASA News", feedUrl: "https://www.nasa.gov/rss/dyn/breaking_news.rss", language: "en", country: "US", reliability: 96, official: true, fetchIntervalMinutes: 30, defaultCategory: "Khoa học" },
  { name: "TechCrunch", feedUrl: "https://techcrunch.com/feed/", language: "en", country: "US", reliability: 88, fetchIntervalMinutes: 15, defaultCategory: "Công nghệ" },
  { name: "Ars Technica", feedUrl: "https://feeds.arstechnica.com/arstechnica/index", language: "en", country: "US", reliability: 90, fetchIntervalMinutes: 20, defaultCategory: "Công nghệ" },
  { name: "Politico", feedUrl: "https://rss.politico.com/politics-news.xml", language: "en", country: "US", reliability: 90, fetchIntervalMinutes: 20, defaultCategory: "Chính trị" },
];

export const RETIRED_RSS_SOURCE_NAMES = [
  "CBC World",
  "VFF",
  "VPF",
  "VnExpress Thể thao",
  "Tuổi Trẻ Thể thao",
  "VietNamNet Thể thao",
  "Dân trí Thể thao",
  "VOV Thể thao",
  "BBC Sport Football",
  "The Guardian Football",
  "ESPN Soccer",
  "Sky Sports Football",
] as const;

export function configuredRssSources(): DefaultRssSource[] {
  const raw = process.env.NEWS_RSS_FEEDS?.trim();
  if (!raw) return DEFAULT_RSS_SOURCES;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RSS_SOURCES;
    const sources = parsed.flatMap((value, index): DefaultRssSource[] => {
      if (!value || typeof value !== "object") return [];
      const record = value as Record<string, unknown>;
      const feedUrl =
        typeof record.url === "string"
          ? record.url
          : typeof record.feedUrl === "string"
            ? record.feedUrl
            : "";
      if (!/^https?:\/\//i.test(feedUrl)) return [];
      return [{
        name: typeof record.name === "string" ? record.name : `Nguồn ${index + 1}`,
        feedUrl,
        language: record.language === "en" ? "en" : "vi",
        country: typeof record.country === "string" ? record.country : record.language === "en" ? "INT" : "VN",
        reliability: typeof record.reliability === "number" ? Math.max(0, Math.min(100, Math.round(record.reliability))) : 80,
        official: record.official === true,
        fetchIntervalMinutes: typeof record.fetchIntervalMinutes === "number" ? Math.max(5, Math.min(1440, Math.round(record.fetchIntervalMinutes))) : undefined,
        defaultCategory: typeof record.defaultCategory === "string" ? record.defaultCategory.trim().slice(0, 160) || undefined : undefined,
      }];
    });
    return sources.length ? sources : DEFAULT_RSS_SOURCES;
  } catch {
    return DEFAULT_RSS_SOURCES;
  }
}
