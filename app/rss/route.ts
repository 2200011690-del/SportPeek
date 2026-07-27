import { NextResponse } from "next/server";
import { storyService } from "@/lib/application/story-service";
import { buildNewsRssFeed, rssResponseHeaders } from "@/lib/rss/feed";

export const revalidate = 300;

export async function GET() {
  const result = await storyService.getLatest(50);
  const xml = buildNewsRssFeed({
    title: "NewsPeek — Tin mới nhất",
    description: "Tin Việt Nam và quốc tế được gộp theo sự kiện, minh bạch nguồn.",
    path: "/rss",
    stories: result.data ?? [],
  });
  return new NextResponse(xml, { headers: rssResponseHeaders });
}

