import { getAIProvider } from "@/lib/ai";
import { MockNewsProvider } from "./providers";
import type { NewsProvider } from "./types";

export async function runIngestion(provider: NewsProvider = new MockNewsProvider()) {
  const startedAt = new Date().toISOString();
  const articles = await provider.fetchArticles();
  const normalized = await Promise.all(articles.map((article) => provider.normalizeArticle(article, provider.name)));
  const unique = [...new Map(normalized.map((article) => [article.contentHash, article])).values()];
  const ai = getAIProvider();
  const classified = await Promise.all(unique.map((article) => ai.classifyArticle(article)));
  return { provider: provider.name, fetchedCount: articles.length, insertedCount: unique.length, skippedCount: articles.length - unique.length, classifiedCount: classified.length, startedAt, completedAt: new Date().toISOString(), status: "success" as const };
}
export { MockNewsProvider, JsonNewsProvider, RssNewsProvider } from "./providers";
