import type { StoryCluster } from "@/lib/stories/schema";
import { absoluteStoryUrl, getSiteBaseUrl } from "@/lib/stories/seo";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function description(story: StoryCluster): string {
  return (story.summaryLong || story.summary)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2_000);
}

export function buildNewsRssFeed(input: {
  title: string;
  description: string;
  path: string;
  stories: StoryCluster[];
}): string {
  const baseUrl = getSiteBaseUrl();
  const selfUrl = new URL(input.path, baseUrl).toString();
  const items = input.stories.slice(0, 50).map((story) => {
    const url = absoluteStoryUrl(story, baseUrl);
    const published = new Date(story.firstPublishedAt ?? story.publishedAt).toUTCString();
    return `<item>
      <title>${xml(story.title)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <pubDate>${xml(published)}</pubDate>
      <category>${xml(story.category)}</category>
      <description>${xml(description(story))}</description>
    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(input.title)}</title>
    <link>${xml(baseUrl.toString())}</link>
    <description>${xml(input.description)}</description>
    <language>vi</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${xml(selfUrl)}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
</rss>`;
}

export const rssResponseHeaders = {
  "content-type": "application/rss+xml; charset=utf-8",
  "cache-control": "public, s-maxage=300, stale-while-revalidate=900",
} as const;

