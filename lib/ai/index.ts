import { MockAIProvider } from "./mock";
import type { AIProvider } from "./types";

export function getAIProvider(): AIProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  // OpenAI/Gemini adapters use the same interface; the MVP falls back safely when no key is configured.
  if (requested === "openai" && !process.env.OPENAI_API_KEY) return new MockAIProvider();
  if (requested === "gemini" && !process.env.GEMINI_API_KEY) return new MockAIProvider();
  return new MockAIProvider();
}
export type { AIProvider } from "./types";
