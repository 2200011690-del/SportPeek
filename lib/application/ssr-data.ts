import { storyService } from "@/lib/application/story-service";
import { getHealthSnapshot } from "@/lib/health";
import { readNewsSourceCatalog } from "@/lib/rss/repository";
import { storyToNewsItem } from "@/lib/stories/presenter";
import { newsCategory } from "@/lib/news/categories";
import type { NewsAIStatus } from "@/lib/ingestion/official-feed";
import type { NewsItem } from "@/lib/types";

export async function getInitialData(route: string, categoryId?: string) {
  try {
    const health = await getHealthSnapshot();
    const sources = await readNewsSourceCatalog().catch(() => []);
    
    let newsData: NewsItem[] = [];
    let aiStatus: NewsAIStatus = { provider: "off", state: "off", translatedCount: 0 };
    let aiTranslation = false;
    let sourcesList: string[] = [];

    if (route.startsWith("/category") && categoryId) {
      const cat = newsCategory(categoryId);
      const archiveResult = await storyService.getArchive(1, 12, { category: cat?.label });
      newsData = (archiveResult.data?.stories ?? []).map(storyToNewsItem);
    } else {
      const result = await storyService.getFeed();
      newsData = (result.data ?? []).map(storyToNewsItem);
      aiStatus = result.diagnostics?.aiStatus ?? { provider: "off" as const, state: "off" as const, translatedCount: 0 };
      aiTranslation = result.diagnostics?.aiTranslation ?? false;
      sourcesList = result.diagnostics?.sources ?? [];
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
