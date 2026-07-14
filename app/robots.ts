import type { MetadataRoute } from "next";
import { isInternalMode } from "@/lib/config";
export default function robots(): MetadataRoute.Robots {
  if (isInternalMode()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/settings", "/bookmarks", "/api"] }, sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/sitemap.xml` };
}
