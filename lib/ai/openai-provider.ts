import { z } from "zod";
import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { providerFetch } from "@/lib/sports-data/rate-limiter";
import { RemoteAIProvider } from "./remote-base";

export class OpenAIProvider extends RemoteAIProvider {
  readonly name = "openai";
  protected async structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T> {
    const key = process.env.OPENAI_API_KEY; if (!key) throw new ConfigurationError("Thiếu OPENAI_API_KEY.", this.name);
    const response = await providerFetch(this.name, "https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.4-nano", input: [{ role: "system", content: `Bạn là biên tập viên SportPeek. ${task} Trả JSON thuần, không markdown.` }, { role: "user", content: JSON.stringify(input) }], text: { format: { type: "json_schema", name: "sportpeek_structured_output", strict: true, schema: z.toJSONSchema(schema) } }, max_output_tokens: 4000 }) }, { timeoutMs: 35_000, retries: 1, minimumIntervalMs: 250 });
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }; const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!text) throw new ProviderError("OpenAI không trả JSON.", this.name); return schema.parse(JSON.parse(text));
  }
}
