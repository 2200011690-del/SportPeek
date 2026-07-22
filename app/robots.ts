import type { MetadataRoute } from "next";
import { isInternalMode } from "@/lib/config";
export default function robots(): MetadataRoute.Robots {
  if (isInternalMode()) return { rules: { userAgent: "*", disallow: "/" } };
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/settings", "/bookmarks", "/api"],
    },
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap-news`],
  };
}
