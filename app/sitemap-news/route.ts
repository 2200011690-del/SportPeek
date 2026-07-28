import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteBaseUrl } from "@/lib/stories/seo";

export const revalidate = 300;

export async function GET() {
  const client = createAdminClient();
  if (!client) {
    return new NextResponse("Supabase is not configured", { status: 503 });
  }

  const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data, error } = await client
    .from("story_clusters")
    .select("slug,title,first_published_at")
    .gte("first_published_at", twoDaysAgo)
    .order("first_published_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Error generating news sitemap:", error);
    return new NextResponse("Error reading stories", { status: 500 });
  }

  const baseUrl = getSiteBaseUrl();
  const urlEntries = (data ?? []).map((row) => {
    const safeTitle = row.title
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    const safeUrl = new URL(`/news/${encodeURIComponent(row.slug)}`, baseUrl).toString();
    const safeDate = new Date(row.first_published_at).toISOString();

    return `  <url>
    <loc>${safeUrl}</loc>
    <news:news>
      <news:publication>
        <news:name>NewsPeek</news:name>
        <news:language>vi</news:language>
      </news:publication>
      <news:publication_date>${safeDate}</news:publication_date>
      <news:title>${safeTitle}</news:title>
    </news:news>
  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
