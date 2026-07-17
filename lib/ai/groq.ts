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
          { role: "system", content: `Bạn là biên tập viên SportPeek. ${task} Chỉ trả dữ liệu đúng schema được yêu cầu.` },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sportpeek_structured_output",
            strict: true,
            schema: providerJsonSchema(schema),
          },
        },
        max_completion_tokens: 1600,
        reasoning_effort: "low",
        temperature: 0.1,
      }),
    }, { timeoutMs: 25_000, retries: 0, minimumIntervalMs: 250 });
    const payload = await response.json() as { choices?: Array<{ finish_reason?: string | null; message?: { content?: string } }> };
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length") throw new ProviderError("Groq đã dừng vì chạm giới hạn độ dài đầu ra.", this.name, true);
    if (choice?.finish_reason && choice.finish_reason !== "stop") throw new ProviderError(`Groq dừng bất thường (${choice.finish_reason}).`, this.name, true);
    const text = choice?.message?.content;
    if (!text) throw new ProviderError(`Groq không trả JSON${choice?.finish_reason ? ` (${choice.finish_reason})` : ""}.`, this.name);
    try {
      return parseStructuredText(schema, text);
    } catch (error) {
      throw new ProviderError(`Groq trả dữ liệu không đúng schema: ${error instanceof Error ? error.message : "không xác định"}`, this.name, true);
    }
  }
}
