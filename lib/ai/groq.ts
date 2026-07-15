import type { z } from "zod";
import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { providerFetch } from "@/lib/sports-data/rate-limiter";
import { parseStructuredText, providerJsonSchema, RemoteAIProvider } from "./remote-base";

export class GroqAIProvider extends RemoteAIProvider {
  readonly name = "groq";

  protected async structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T> {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new ConfigurationError("Thiếu GROQ_API_KEY.", this.name);
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
    const response = await providerFetch(this.name, "https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `Bạn là biên tập viên SportPeek. ${task} Chỉ trả JSON hợp lệ theo schema: ${JSON.stringify(providerJsonSchema(schema))}` },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 700,
        temperature: 0.1,
      }),
    }, { timeoutMs: 25_000, retries: 0, minimumIntervalMs: 250 });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError("Groq không trả JSON.", this.name);
    return parseStructuredText(schema, text);
  }
}
