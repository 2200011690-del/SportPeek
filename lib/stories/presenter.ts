import type { NewsItem } from "@/lib/types";
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
  const paragraphs = story.summaryLong.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  return {
    id: story.id,
    title: story.title,
    slug: story.slug,
    summary: story.summary,
    keyPoints: story.agreedFacts.map((fact) => fact.text).slice(0, 3),
    category: story.category,
    competition: story.competition ?? story.category,
    team: story.teams[0] ?? story.competition ?? story.category,
    publishedAt: relativePublishedAt(story.publishedAt),
    publishedTimestamp: story.publishedAt,
    hotness: story.hotnessScore ?? 0,
    reliability: story.reliabilityScore ?? 0,
    sources: story.sourceNames,
    sourceDetails: story.articles.map((article) => ({
      name: article.sourceName,
      url: article.originalUrl,
      reliability: story.reliabilityScore ?? 0,
      language: article.language,
      excerpt: article.excerpt ?? undefined,
      articleId: article.id,
      title: article.title,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
      isOfficialSource: article.isOfficialSource,
      imageUrl: article.imageUrl ?? undefined,
      sourceLogoUrl: article.sourceLogoUrl ?? undefined,
      canonicalUrl: article.canonicalUrl ?? undefined,
      author: article.author ?? undefined,
    })),
    imageUrl: story.imageUrl ?? undefined,
    imageAlt: story.imageUrl ? `Ảnh đại diện cho tin “${story.title}” từ ${lead.sourceName}` : undefined,
    imageSource: story.articles.find((article) => article.imageUrl)?.sourceName,
    readingBody: paragraphs.length ? paragraphs : [story.summary],
    originalUrl: lead.originalUrl,
    originalLanguage: story.language,
    translatedByAI: story.aiGenerated,
    trendingReasons: [
      story.sourceCount >= 2 ? `${story.sourceCount} nguồn độc lập cùng đưa tin` : "Hiện mới ghi nhận một nguồn",
      story.hasOfficialSource ? "Có nguồn chính thức trong cụm tin" : "Chưa có nguồn chính thức trong cụm tin",
    ],
    imageTone: ["red", "green", "blue", "amber", "cyan"][index % 5],
    featured: index < 2,
  };
}
