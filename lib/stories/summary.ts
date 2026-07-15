import type { StoryCluster } from "./schema";

const legacyProcessingNotices = [
  /^Bản tin (?:này )?chưa được xử lý bởi AI\b/i,
  /^Nội dung đang hiển thị từ metadata nguồn\b/i,
];

export function cleanSummaryParagraphs(...values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => value?.split(/\n{2,}/) ?? [])
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !legacyProcessingNotices.some((pattern) => pattern.test(paragraph))))];
}

export function buildLongSummary(...values: Array<string | null | undefined>): string {
  return cleanSummaryParagraphs(...values).join("\n\n").slice(0, 12_000);
}

export function storyDisplaySummaryParagraphs(story: Pick<StoryCluster, "aiGenerated" | "summary" | "summaryLong">): string[] {
  return story.aiGenerated
    ? cleanSummaryParagraphs(story.summary)
    : cleanSummaryParagraphs(story.summary, story.summaryLong);
}

export function prioritizeAISummaryCandidates<T extends Pick<StoryCluster, "aiGenerated" | "language" | "updatedAt">>(stories: T[], limit: number): T[] {
  return stories
    .filter((story) => !story.aiGenerated)
    .sort((a, b) => Number(b.language === "en") - Number(a.language === "en") || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(0, limit));
}
