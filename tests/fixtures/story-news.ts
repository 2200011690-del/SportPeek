import type { AggregatedNews } from "../../lib/ingestion/official-feed";
import type { NewsItem } from "../../lib/types";

export function makeStoryNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "rss-alpha-001",
    title: "Arsenal công bố kế hoạch trước trận đại chiến",
    slug: "rss-alpha-001",
    summary: "Arsenal đã công bố kế hoạch chuẩn bị và lịch họp báo trước trận đấu cuối tuần.",
    keyPoints: ["Đội sẽ tập kín trước trận", "Họp báo diễn ra vào chiều thứ Sáu"],
    category: "Bóng đá · Quốc tế",
    competition: "Premier League",
    team: "Arsenal",
    publishedAt: "5 phút trước",
    publishedTimestamp: "2026-07-14T08:00:00.000Z",
    hotness: 82,
    reliability: 91,
    sources: ["Arsenal", "BBC Sport Football"],
    sourceDetails: [
      {
        name: "Arsenal",
        url: "https://www.arsenal.com/news/alpha",
        reliability: 99,
        language: "en",
        excerpt: "The club published its schedule and press conference plan.",
        articleId: "alpha-official",
        title: "Club schedule before the weekend match",
        publishedAt: "2026-07-14T08:00:00.000Z",
        fetchedAt: "2026-07-14T08:02:00.000Z",
        isOfficialSource: true,
        canonicalUrl: "https://www.arsenal.com/news/alpha",
      },
      {
        name: "BBC Sport Football",
        url: "https://www.bbc.com/sport/football/alpha",
        reliability: 94,
        language: "en",
        excerpt: "BBC Sport also reported the published preparation plan.",
        articleId: "alpha-bbc",
        title: "Arsenal outline plans before major fixture",
        publishedAt: "2026-07-14T08:04:00.000Z",
        fetchedAt: "2026-07-14T08:05:00.000Z",
      },
    ],
    readingBody: [
      "Arsenal đã công bố lịch chuẩn bị chính thức trước trận đấu cuối tuần.",
      "BBC Sport sau đó đưa lại thông tin và bổ sung bối cảnh về trận đấu.",
    ],
    originalUrl: "https://www.arsenal.com/news/alpha",
    originalLanguage: "en",
    translatedByAI: false,
    imageTone: "green",
    ...overrides,
  };
}

export function makeAggregatedNews(overrides: Partial<AggregatedNews> = {}): AggregatedNews {
  return {
    data: [
      makeStoryNewsItem(),
      makeStoryNewsItem({
        id: "rss-alpha-002",
        slug: "rss-alpha-002",
        title: "Arsenal hoàn tất buổi tập chiến thuật",
        summary: "Đội bóng hoàn tất buổi tập chiến thuật trước vòng đấu mới.",
        sources: ["The Guardian Football"],
        sourceDetails: [{
          name: "The Guardian Football",
          url: "https://www.theguardian.com/football/alpha-2",
          reliability: 92,
          language: "en",
          excerpt: "The squad completed a tactical training session.",
          articleId: "alpha-guardian",
          title: "Arsenal complete tactical session",
          publishedAt: "2026-07-14T07:00:00.000Z",
          fetchedAt: "2026-07-14T07:03:00.000Z",
        }],
        publishedTimestamp: "2026-07-14T07:00:00.000Z",
        originalUrl: "https://www.theguardian.com/football/alpha-2",
      }),
    ],
    sources: ["Arsenal", "BBC Sport Football", "The Guardian Football"],
    aiTranslation: false,
    aiStatus: { provider: "off", state: "off", translatedCount: 0 },
    cached: false,
    stale: false,
    lastUpdatedAt: "2026-07-14T08:05:00.000Z",
    ...overrides,
  };
}
