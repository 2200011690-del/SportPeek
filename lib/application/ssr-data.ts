import { storyService } from "@/lib/application/story-service";
import { getHealthSnapshot } from "@/lib/health";
import { readNewsSourceCatalog } from "@/lib/rss/repository";
import { storyToNewsItem } from "@/lib/stories/presenter";
import { newsCategory } from "@/lib/news/categories";
import type { NewsAIStatus } from "@/lib/ingestion/official-feed";
import type { NewsItem } from "@/lib/types";
import { createAsyncTtlCache } from "@/lib/cache/async-ttl";

type LatestResult = Awaited<ReturnType<typeof storyService.getLatest>>;
type ArchiveResult = Awaited<ReturnType<typeof storyService.getArchive>>;

const healthCache = createAsyncTtlCache<Awaited<ReturnType<typeof getHealthSnapshot>>>(30_000);
const sourceCatalogCache = createAsyncTtlCache<Awaited<ReturnType<typeof readNewsSourceCatalog>>>(60_000);
const latestStoriesCache = createAsyncTtlCache<LatestResult>(20_000);
const archiveCaches = new Map<string, ReturnType<typeof createAsyncTtlCache<ArchiveResult>>>();

const cachedHealthSnapshot = () => healthCache.get(getHealthSnapshot);
const cachedSourceCatalog = () =>
  sourceCatalogCache.get(() => readNewsSourceCatalog().catch(() => []));
const cachedLatestStories = () =>
  latestStoriesCache.get(() => storyService.getLatest(40));
const cachedCategoryArchive = (category: string) => {
  let cache = archiveCaches.get(category);
  if (!cache) {
    cache = createAsyncTtlCache<ArchiveResult>(30_000);
    archiveCaches.set(category, cache);
  }
  return cache.get(() => storyService.getArchive(1, 12, { category }));
};

export async function getInitialData(route: string, categoryId?: string) {
  try {
    const category = route.startsWith("/category") && categoryId
      ? newsCategory(categoryId)?.label
      : null;
    const dataPromise = category
      ? cachedCategoryArchive(category)
      : cachedLatestStories();
    const [health, sources, result] = await Promise.all([
      cachedHealthSnapshot(),
      cachedSourceCatalog(),
      dataPromise,
    ]);

    let newsData: NewsItem[] = [];
    let aiStatus: NewsAIStatus = { provider: "off", state: "off", translatedCount: 0 };
    let aiTranslation = false;
    let sourcesList: string[] = [];

    if (category) {
      const archiveResult = result as ArchiveResult;
      newsData = (archiveResult.data?.stories ?? []).map(storyToNewsItem);
    } else {
      const latestResult = result as LatestResult;
      const fullFeedRoutes = new Set(["/", "/news", "/search", "/bookmarks", "/for-you"]);
      const limit = fullFeedRoutes.has(route) ? 40 : 12;
      newsData = (latestResult.data ?? []).slice(0, limit).map(storyToNewsItem);
      aiStatus = latestResult.diagnostics?.aiStatus ?? { provider: "off" as const, state: "off" as const, translatedCount: 0 };
      aiTranslation = latestResult.diagnostics?.aiTranslation ?? false;
      sourcesList = latestResult.diagnostics?.sources ?? [];
    }

    return {
      health,
      sources,
      news: {
        data: newsData,
        aiStatus,
        aiTranslation,
        sources: sourcesList,
        demo: false
      },
      forYou: {
        data: [],
        personalized: false
      }
    };
  } catch (error) {
    console.error("Error loading initial SSR data:", error);
    return null;
  }
}
