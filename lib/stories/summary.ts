import { duplicateSimilarity } from "@/lib/ingestion/utils";
import type { StoryCluster } from "./schema";

const technicalSummarySentences = [
  /^Bản tin (?:này )?chưa được xử lý bởi AI\b/i,
  /^Nội dung đang hiển thị từ metadata nguồn\b/i,
  /^(?:SportPeek|NewsPeek) ghi nhận thông tin này từ(?:\s|$)/i,
  /^Bản tổng hợp chỉ dựa trên tiêu đề(?: và mô tả ngắn)?(?:\s|$)/i,
  /^Có \d+ nhà xuất bản cùng đề cập\b/i,
  /^Hiện mới có một nhà xuất bản trong cụm\b/i,
];

function stripTechnicalSentences(value: string): string {
  return (value.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [value])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !technicalSummarySentences.some((pattern) => pattern.test(sentence)))
    .join(" ")
    .trim();
}

export function cleanSummaryParagraphs(...values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => value?.split(/\n{2,}/) ?? [])
    .map(stripTechnicalSentences)
    .filter(Boolean))];
}

export function buildLongSummary(...values: Array<string | null | undefined>): string {
  return cleanSummaryParagraphs(...values).join("\n\n").slice(0, 12_000);
}

type DisplayStory = Pick<StoryCluster, "aiGenerated" | "summary" | "summaryLong">
  & Partial<Pick<StoryCluster, "title" | "articles">>;

function looksLikeSourceAppendix(value: string): boolean {
  const paragraphs = value.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length < 2) return false;
  return paragraphs.slice(1).some((paragraph) =>
    /^(?:nguon|nguồn|source)\s+[a-z0-9]|\b(?:ke lai|kể lại|tiep tuc ke|tiếp tục kể)\b/i.test(paragraph),
  );
}

function metadataSummary(story: DisplayStory): string {
  const candidates = (story.articles ?? []).flatMap((article) => {
    const value = article.excerpt?.trim() || article.title.trim();
    return value.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [value];
  });
  const selected: string[] = [];
  for (const candidate of candidates) {
    const sentence = stripTechnicalSentences(candidate);
    if (!sentence || selected.some((item) => duplicateSimilarity(item, sentence) >= 0.72)) continue;
    selected.push(/[.!?]$/.test(sentence) ? sentence : `${sentence}.`);
    if (selected.join(" ").split(/\s+/).length >= 140 || selected.length >= 4) break;
  }
  return selected.join(" ") || story.title?.trim() || "";
}

export function storyDisplaySummaryParagraphs(story: DisplayStory): string[] {
  if (story.aiGenerated) {
    const long = story.summaryLong && !looksLikeSourceAppendix(story.summaryLong)
      ? cleanSummaryParagraphs(story.summaryLong)
      : [];
    if (long.join(" ").length > story.summary.trim().length + 80) return long;
    return cleanSummaryParagraphs(story.summary);
  }
  const paragraphs = cleanSummaryParagraphs(story.summary, story.summaryLong);
  return paragraphs.length ? paragraphs : cleanSummaryParagraphs(metadataSummary(story));
}

export function prioritizeAISummaryCandidates<T extends Pick<StoryCluster, "aiGenerated" | "language" | "updatedAt">>(stories: T[], limit: number): T[] {
  return stories
    .filter((story) => !story.aiGenerated)
    .sort((a, b) => Number(b.language === "en") - Number(a.language === "en") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(0, limit));
}
