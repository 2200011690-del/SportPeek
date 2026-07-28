import { CloudflareAIProvider, hasWorkersAIBinding } from "./cloudflare";
import { developmentFixturesEnabled } from "@/lib/config";
import { DisabledAIProvider } from "./disabled";
import { MockAIProvider } from "./mock";
import { HeuristicAIProvider } from "./heuristic";
import { OpenAIProvider } from "./openai-provider";
import { GeminiAIProvider } from "./gemini";
import { GroqAIProvider } from "./groq";
import { FailoverAIProvider } from "./failover";
import type { AIProvider } from "./types";

function configuredProvider(name: string): AIProvider | null {
  if (name === "gemini" && process.env.GEMINI_API_KEY) return new GeminiAIProvider();
  if (name === "groq" && process.env.GROQ_API_KEY) return new GroqAIProvider();
  if (name === "cloudflare" && hasWorkersAIBinding()) return new CloudflareAIProvider();
  if (name === "openai" && process.env.OPENAI_API_KEY) return new OpenAIProvider();
  return null;
}

export function getAIProvider(): AIProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  if (requested === "failover") {
    const names = (process.env.AI_PROVIDER_CHAIN || "gemini,groq,cloudflare").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
    const providers = names.map(configuredProvider).filter((provider): provider is AIProvider => Boolean(provider));
    if (providers.length > 1) return new FailoverAIProvider(providers);
    if (providers[0]) return providers[0];
  }
  const provider = requested ? configuredProvider(requested) : null;
  if (provider) return provider;
  if (requested === "disabled" || requested === "off") return new DisabledAIProvider();
  if (requested === "mock" && developmentFixturesEnabled()) return new MockAIProvider();
  return new HeuristicAIProvider();
}
export type { AIProvider } from "./types";
export { DisabledAIProvider } from "./disabled";
export { MockAIProvider } from "./mock";
export { HeuristicAIProvider } from "./heuristic";
export { GeminiAIProvider } from "./gemini";
export { GroqAIProvider } from "./groq";
export { FailoverAIProvider } from "./failover";
