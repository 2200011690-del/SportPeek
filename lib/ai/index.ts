import { CloudflareAIProvider, hasWorkersAIBinding } from "./cloudflare";
import { developmentFixturesEnabled } from "@/lib/config";
import { DisabledAIProvider } from "./disabled";
import { MockAIProvider } from "./mock";
import { HeuristicAIProvider } from "./heuristic";
import { OpenAIProvider } from "./openai-provider";
import { GeminiAIProvider } from "./gemini";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  if (requested === "cloudflare" && hasWorkersAIBinding()) return new CloudflareAIProvider();
  if (requested === "openai" && process.env.OPENAI_API_KEY) return new OpenAIProvider();
  if (requested === "gemini" && process.env.GEMINI_API_KEY) return new GeminiAIProvider();
  if (requested === "disabled" || requested === "off") return new DisabledAIProvider();
  if (requested === "mock" && developmentFixturesEnabled()) return new MockAIProvider();
  return new HeuristicAIProvider();
}
export type { AIProvider } from "./types";
export { DisabledAIProvider } from "./disabled";
export { MockAIProvider } from "./mock";
export { HeuristicAIProvider } from "./heuristic";
