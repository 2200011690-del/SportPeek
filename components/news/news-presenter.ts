import type { NewsItem } from "@/lib/types";

const technicalSummaryPrefixes = [
  /^Bản tin (?:này )?chưa được xử lý bởi AI\b/i,
  /^Nội dung đang hiển thị từ metadata nguồn\b/i,
  /^(?:SportPeek|NewsPeek) ghi nhận thông tin này từ(?:\s|$)/i,
  /^Bản tổng hợp chỉ dựa trên tiêu đề(?: và mô tả ngắn)?(?:\s|$)/i,
  /^Có \d+ nhà xuất bản cùng đề cập\b/i,
];

function sentences(value: string): string[] {
  return (
    value
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+(?:[.!?]+|$)/g) ?? []
  )
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence &&
        !technicalSummaryPrefixes.some((pattern) => pattern.test(sentence)),
    );
}

function trimAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const candidate = value.slice(0, Math.max(1, maxLength - 1));
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > maxLength * 0.65 ? boundary : candidate.length).trimEnd()}…`;
}

export function conciseNewsSummary(
  item: Pick<NewsItem, "summary" | "title">,
  maxLength = 230,
): string {
  const selected = sentences(item.summary).slice(0, 2).join(" ") || item.title;
  return trimAtWord(selected, maxLength);
}

export function independentSourceCount(
  item: Pick<NewsItem, "sources">,
): number {
  return new Set(
    item.sources
      .map((source) => source.trim().toLocaleLowerCase("vi"))
      .filter(Boolean),
  ).size;
}

export function newsHasSourceLanguage(
  item: Pick<NewsItem, "sourceDetails" | "originalLanguage">,
  language: "vi" | "en",
): boolean {
  const detailedLanguages = item.sourceDetails
    ?.map((source) => source.language)
    .filter(Boolean);
  if (detailedLanguages?.length) return detailedLanguages.includes(language);

  // Older cached cards may not contain per-source details. Preserve their
  // established Vietnamese fallback while still identifying known English
  // stories correctly.
  return language === "en"
    ? item.originalLanguage === "en"
    : item.originalLanguage !== "en";
}

export function newsStatusLabel(
  item: Pick<NewsItem, "storyStatus" | "category" | "title" | "sources">,
): string {
  const sourceCount = independentSourceCount(item);
  switch (item.storyStatus) {
    case "official":
      return "Đã xác nhận";
    case "reported":
      return sourceCount >= 2 ? "Nhiều nguồn xác nhận" : "Một nguồn đưa tin";
    case "rumor":
      return "Chưa xác nhận";
    case "unverified":
      return "Chưa kiểm chứng";
    case "developing":
      return "Đang cập nhật";
    case "disputed":
      return "Các nguồn chưa thống nhất";
    case "completed":
      return "Đã hoàn tất";
    case "correction":
      return "Đã đính chính";
    default:
      return sourceCount >= 2 ? "Nhiều nguồn đưa tin" : item.category;
  }
}

export function newsTimestamp(
  item: Pick<NewsItem, "publishedTimestamp" | "updatedTimestamp">,
): number {
  const timestamp = Date.parse(item.updatedTimestamp ?? item.publishedTimestamp ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function newsTimeLabel(
  item: Pick<NewsItem, "publishedAt" | "updatedAt" | "updatedTimestamp">,
): string {
  return item.updatedTimestamp && item.updatedAt
    ? `Cập nhật ${item.updatedAt}`
    : item.publishedAt;
}

export function sortLatestNews(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => newsTimestamp(b) - newsTimestamp(a));
}

function featuredScore(item: NewsItem, now: number): number {
  const ageHours = Math.max(0, (now - newsTimestamp(item)) / 3_600_000);
  const recency = Math.max(0, 100 - ageHours * 2.5);
  const corroboration = Math.min(100, independentSourceCount(item) * 34);
  const officialBonus = item.storyStatus === "official" ? 8 : 0;
  const disputePenalty =
    item.storyStatus === "unverified"
      ? 12
      : item.storyStatus === "rumor"
        ? 6
        : 0;
  return (
    item.hotness * 0.34 +
    item.reliability * 0.23 +
    recency * 0.25 +
    corroboration * 0.18 +
    officialBonus -
    disputePenalty
  );
}

/** UI ranking for the editorial "Nổi bật" view, with caps that keep one topic from taking over the first screen. */
export function rankFeaturedNews(items: NewsItem[]): NewsItem[] {
  const now = Date.now();
  const ranked = [...items].sort(
    (a, b) =>
      featuredScore(b, now) - featuredScore(a, now) ||
      newsTimestamp(b) - newsTimestamp(a),
  );
  const selected: NewsItem[] = [];
  const deferred: NewsItem[] = [];
  const topicCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();

  for (const item of ranked) {
    if (selected.length >= 12) {
      deferred.push(item);
      continue;
    }
    const topicKey = (item.primaryTopic ?? item.topics?.[0] ?? item.category).trim().toLocaleLowerCase("vi");
    const categoryKey = item.category.trim().toLocaleLowerCase("vi");
    const topicCount = topicCounts.get(topicKey) ?? 0;
    const categoryCount = categoryCounts.get(categoryKey) ?? 0;
    if (
      (topicKey && topicCount >= 2) ||
      (categoryKey && categoryCount >= 3)
    ) {
      deferred.push(item);
      continue;
    }
    selected.push(item);
    if (topicKey) topicCounts.set(topicKey, topicCount + 1);
    if (categoryKey) categoryCounts.set(categoryKey, categoryCount + 1);
  }

  return [...selected, ...deferred];
}
