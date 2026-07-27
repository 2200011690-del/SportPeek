import { NextResponse } from "next/server";
import { storyService } from "@/lib/application/story-service";
import { newsCategory } from "@/lib/news/categories";
import { buildNewsRssFeed, rssResponseHeaders } from "@/lib/rss/feed";

export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category: slug } = await params;
  const category = newsCategory(slug);
  if (!category) return new NextResponse("Không tìm thấy chuyên mục", { status: 404 });
  const result = await storyService.getArchive(1, 50, { category: category.label, sort: "freshness" });
  const xml = buildNewsRssFeed({
    title: `NewsPeek — ${category.label}`,
    description: `Tin ${category.label} mới nhất được NewsPeek gộp và dẫn nguồn.`,
    path: `/rss/${category.slug}`,
    stories: result.data?.stories ?? [],
  });
  return new NextResponse(xml, { headers: rssResponseHeaders });
}

