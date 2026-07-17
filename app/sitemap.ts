import type { MetadataRoute } from "next";
import { loadPersistedStorySitemapEntries, type StorySitemapEntry } from "@/lib/stories/persisted-repository";
import { getSiteBaseUrl } from "@/lib/stories/seo";

const routes = ["", "/for-you", "/news", "/live", "/fixtures", "/results", "/standings", "/transfers", "/terms", "/privacy", "/copyright", "/sources"];

export const revalidate = 300;

function storyLastModified(story: StorySitemapEntry): Date {
  const material = new Date(story.lastMaterialUpdateAt);
  if (!Number.isNaN(material.getTime())) return material;
  const published = new Date(story.publishedAt);
  return Number.isNaN(published.getTime()) ? new Date(0) : published;
}

export function buildSitemap(baseUrl: URL, stories: StorySitemapEntry[]): MetadataRoute.Sitemap {
  const base = new URL(baseUrl);
  base.pathname = "/";
  base.search = "";
  base.hash = "";
  const uniqueStories = [...new Map(stories.map((story) => [story.slug, story])).values()];
  const latestStoryUpdate = uniqueStories.reduce<Date | undefined>((latest, story) => {
    const candidate = storyLastModified(story);
    return candidate.getTime() > 0 && (!latest || candidate > latest) ? candidate : latest;
  }, undefined);
  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: new URL(route || "/", base).toString(),
    ...(route === "/news" && latestStoryUpdate ? { lastModified: latestStoryUpdate } : {}),
    changeFrequency: route === "/news" || route === "/live" ? "hourly" : "daily",
    priority: route === "" ? 1 : route === "/news" ? 0.9 : 0.7,
  }));
  const storyEntries: MetadataRoute.Sitemap = uniqueStories.map((story) => ({
    url: new URL(`/news/${encodeURIComponent(story.slug)}`, base).toString(),
    lastModified: storyLastModified(story),
    changeFrequency: "weekly",
    priority: 0.8,
  }));
  return [...staticEntries, ...storyEntries];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let stories: StorySitemapEntry[] = [];
  try {
    stories = await loadPersistedStorySitemapEntries();
  } catch {
    // Static discovery remains available while Supabase is unavailable or the
    // freshness migration is propagating through PostgREST's schema cache.
  }
  return buildSitemap(getSiteBaseUrl(), stories);
}
