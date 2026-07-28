import { providerRegistry } from "@/lib/providers/registry";

export class AIApplicationService {
  classify(input: { title: string; excerpt: string }) { return providerRegistry.resolveAI().classifyArticle(input); }
}

export const aiService = new AIApplicationService();

