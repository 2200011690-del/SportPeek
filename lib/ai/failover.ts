import { AppError, ProviderError } from "@/lib/core/errors";
import { isAIQuotaExceeded, safeAIErrorMessage } from "./quota";
import type { AIProvider, ClusterArticleInput } from "./types";
import { sanitizeClusterSummary } from "./grounding";

const cooldowns = new Map<string, number>();

function cooldownMs(error: unknown): number {
  if (isAIQuotaExceeded(error)) return 15 * 60_000;
  if (error instanceof AppError && (error.code === "CONFIGURATION_REQUIRED" || error.code === "FORBIDDEN")) return 60 * 60_000;
  if (error instanceof AppError && error.code === "RATE_LIMITED") return 2 * 60_000;
  return 30_000;
}

export class FailoverAIProvider implements AIProvider {
  readonly name = "failover";
  lastProviderName: string | null = null;

  constructor(readonly providers: AIProvider[]) {
    if (!providers.length) throw new Error("FailoverAIProvider cần ít nhất một provider");
  }

  private async run<T>(operation: string, call: (provider: AIProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      if ((cooldowns.get(provider.name) ?? 0) > Date.now()) continue;
      try {
        const result = await call(provider);
        this.lastProviderName = provider.name;
        cooldowns.delete(provider.name);
        return result;
      } catch (error) {
        const message = safeAIErrorMessage(error);
        errors.push(`${provider.name}: ${message}`);
        cooldowns.set(provider.name, Date.now() + cooldownMs(error));
        console.warn(`[AI failover] ${operation} failed on ${provider.name}: ${message}`);
      }
    }
    throw new ProviderError(`Không provider AI nào hoàn tất ${operation}: ${errors.join(" | ") || "đang cooldown"}`, this.name, true);
  }

  classifyArticle(input: { title: string; excerpt: string }) { return this.run("classify", (provider) => provider.classifyArticle(input)); }
  summarizeCluster(input: { articles: ClusterArticleInput[] }) { return this.run("summarize", async (provider) => sanitizeClusterSummary(await provider.summarizeCluster(input), input.articles)); }
  extractEntities(input: { title: string; excerpt: string }) { return this.run("entities", (provider) => provider.extractEntities(input)); }
  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }) { return this.run("cluster-match", (provider) => provider.evaluateClusterMatch(input)); }
  generateTimeline(input: { articles: ClusterArticleInput[] }) { return this.run("timeline", (provider) => provider.generateTimeline(input)); }
  identifyAgreements(input: { articles: ClusterArticleInput[] }) { return this.run("agreements", (provider) => provider.identifyAgreements(input)); }
  identifyDisputes(input: { articles: ClusterArticleInput[] }) { return this.run("disputes", (provider) => provider.identifyDisputes(input)); }
  answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }) { return this.run("answer", (provider) => provider.answerFromClusterContext(input)); }
  createMatchPreview(input: Record<string, unknown>) { return this.run("match-preview", (provider) => provider.createMatchPreview(input)); }
  createMatchRecap(input: Record<string, unknown>) { return this.run("match-recap", (provider) => provider.createMatchRecap(input)); }
}
