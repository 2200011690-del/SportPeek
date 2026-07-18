import type { NewsItem } from "@/lib/types";
import { getHighResolutionStoryImageUrl } from "./images";
import type { StoryCluster } from "./schema";

function relativePublishedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "không rõ thời gian";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

/** Compatibility adapter for the existing feed cards; StoryCluster remains the domain model. */
export function storyToNewsItem(story: StoryCluster, index = 0): NewsItem {
  const lead = story.articles[0];
  const firstPublishedAt = story.firstPublishedAt ?? story.publishedAt;
  const materialUpdatedAt = story.lastMaterialUpdateAt ?? story.updatedAt;
  const hasMaterialUpdate = Date.parse(materialUpdatedAt) - Date.parse(firstPublishedAt) >= 5 * 60_000;
  const paragraphs = story.summaryLong.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const readingBody = [...new Set([
    ...paragraphs,
    ...story.articles.map((article) => article.excerpt?.trim()).filter((value): value is string => Boolean(value)),
    story.summary.trim(),
  ].filter(Boolean))];
  if (readingBody.length < 2) {
    const sourceNames = [...new Set(story.articles.map((article) => article.sourceName))];
    readingBody.push(`Thông tin hiện được đối chiếu từ ${sourceNames.join(", ")}; liên kết bài gốc được giữ lại để kiểm tra ngữ cảnh.`);
  }
  return {
    id: story.id,
    title: story.title,
    slug: story.slug,
    summary: story.summary,
    keyPoints: story.agreedFacts.map((fact) => fact.text).slice(0, 3),
    category: story.category,
    primaryTopic: story.category,
    region: lead.language === "en" ? "Quốc tế" : "Việt Nam",
    publishedAt: relativePublishedAt(firstPublishedAt),
    publishedTimestamp: firstPublishedAt,
    updatedAt: hasMaterialUpdate ? relativePublishedAt(materialUpdatedAt) : undefined,
    updatedTimestamp: hasMaterialUpdate ? materialUpdatedAt : undefined,
    hotness: story.hotnessScore ?? 0,
    reliability: story.reliabilityScore ?? 0,
    sources: story.sourceNames,
    sourceDetails: story.articles.map((article) => ({
      name: article.sourceName,
      url: article.originalUrl,
      reliability: story.reliabilityScore ?? 0,
      language: article.language,
      excerpt: article.excerpt?.trim() || story.summary,
      articleId: article.id,
      title: article.title,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      isOfficialSource: article.isOfficialSource,
      imageUrl: getHighResolutionStoryImageUrl(article.imageUrl) ?? undefined,
      sourceLogoUrl: article.sourceLogoUrl ?? undefined,
      canonicalUrl: article.canonicalUrl ?? undefined,
      author: article.author ?? undefined,
    })),
    imageUrl: getHighResolutionStoryImageUrl(story.imageUrl) ?? undefined,
    imageAlt: story.imageUrl ? `Ảnh đại diện cho tin “${story.title}” từ ${lead.sourceName}` : undefined,
    imageSource: story.articles.find((article) => article.imageUrl)?.sourceName,
    readingBody,
    originalUrl: lead.originalUrl,
    // AI writes Vietnamese copy, but source filters must keep using the
    // publisher language. Older AI rows may have story.language="vi".
    originalLanguage: lead.language,
    translatedByAI: story.aiGenerated,
    trendingReasons: [
      story.sourceCount >= 2 ? `${story.sourceCount} nguồn độc lập cùng đưa tin` : "Hiện mới ghi nhận một nguồn",
      story.hasOfficialSource ? "Có nguồn chính thức trong cụm tin" : "Chưa có nguồn chính thức trong cụm tin",
    ],
    imageTone: ["red", "green", "blue", "amber", "cyan"][index % 5],
    featured: index < 2,
    storyStatus: story.status,
  };
}
