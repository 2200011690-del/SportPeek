import type { StoryCluster } from "./schema";

const normalizedRegion = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase("vi-VN") ?? "";

export function storyIsVietnamese(story: StoryCluster): boolean {
  const region = normalizedRegion(story.region);
  if (region) return region === "việt nam";
  return story.publisherCountry === "Việt Nam" || story.language === "vi";
}

/**
 * Interleave Việt Nam and international coverage while preserving freshness
 * within each region. If one side has too little inventory, fill the remaining
 * slots from the other side rather than returning a short feed.
 */
export function balanceStoryRegions(
  stories: StoryCluster[],
  limit = stories.length,
  vietnamShare = 0.5,
): StoryCluster[] {
  const safeLimit = Math.min(
    stories.length,
    Math.max(0, Math.floor(limit)),
  );
  const safeVietnamShare = Math.min(0.8, Math.max(0.2, vietnamShare));
  const vietnam = stories.filter(storyIsVietnamese);
  const international = stories.filter((story) => !storyIsVietnamese(story));
  const result: StoryCluster[] = [];
  let vietnamIndex = 0;
  let internationalIndex = 0;
  let vietnamCount = 0;

  while (result.length < safeLimit) {
    const targetVietnamCount = Math.round(
      (result.length + 1) * safeVietnamShare,
    );
    const preferVietnam = vietnamCount < targetVietnamCount;
    const vietnamStory = vietnam[vietnamIndex];
    const internationalStory = international[internationalIndex];

    if (preferVietnam && vietnamStory) {
      result.push(vietnamStory);
      vietnamIndex += 1;
      vietnamCount += 1;
    } else if (internationalStory) {
      result.push(internationalStory);
      internationalIndex += 1;
    } else if (vietnamStory) {
      result.push(vietnamStory);
      vietnamIndex += 1;
      vietnamCount += 1;
    } else {
      break;
    }
  }

  return result;
}
