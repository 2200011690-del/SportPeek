import { CloudflareAIProvider, hasWorkersAIBinding } from "./cloudflare";
import { MockAIProvider } from "./mock";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  if (requested === "cloudflare" && hasWorkersAIBinding()) return new CloudflareAIProvider();
  if (requested === "openai" && !process.env.OPENAI_API_KEY) return new MockAIProvider();
  return new MockAIProvider();
}
export type { AIProvider } from "./types";
