import type { MetadataRoute } from "next";
const routes = ["", "/for-you", "/news", "/live", "/fixtures", "/results", "/standings", "/transfers", "/search", "/terms", "/privacy", "/copyright", "/sources"];
export default function sitemap(): MetadataRoute.Sitemap { const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"; return routes.map((route) => ({ url: `${base}${route}`, lastModified: new Date(), changeFrequency: route === "/news" ? "hourly" : "daily", priority: route === "" ? 1 : 0.7 })); }
