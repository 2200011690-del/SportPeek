import type { z } from "zod";
import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { providerFetch } from "@/lib/sports-data/rate-limiter";
import { RemoteAIProvider } from "./remote-base";

export class GeminiAIProvider extends RemoteAIProvider {
  readonly name = "gemini";
  protected async structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T> {
    const key = process.env.GEMINI_API_KEY; if (!key) throw new ConfigurationError("Thiếu GEMINI_API_KEY.", this.name); const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    const response = await providerFetch(this.name, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Bạn là biên tập viên SportPeek. ${task}\nĐầu vào: ${JSON.stringify(input)}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }) }, { timeoutMs: 35_000, retries: 1, minimumIntervalMs: 250 });
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }; const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new ProviderError("Gemini không trả JSON.", this.name); return schema.parse(JSON.parse(text));
  }
}
