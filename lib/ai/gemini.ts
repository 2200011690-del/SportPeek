import type { z } from "zod";
import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { providerFetch } from "@/lib/core/provider-fetch";
import { parseStructuredText, providerJsonSchema, RemoteAIProvider } from "./remote-base";

export class GeminiAIProvider extends RemoteAIProvider {
  readonly name = "gemini";
  protected async structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T> {
    const key = process.env.GEMINI_API_KEY; if (!key) throw new ConfigurationError("Thiếu GEMINI_API_KEY.", this.name); const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
    const response = await providerFetch(this.name, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Bạn là biên tập viên tin tức trung lập của NewsPeek. ${task}\nĐầu vào: ${JSON.stringify(input)}` }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: providerJsonSchema(schema), maxOutputTokens: 1600, temperature: 0.1 } }) }, { timeoutMs: 30_000, retries: 0, minimumIntervalMs: 250 });
    const payload = await response.json() as { candidates?: Array<{ finishReason?: string; finishMessage?: string; content?: { parts?: Array<{ text?: string }> } }> };
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") throw new ProviderError("Gemini đã dừng vì chạm giới hạn độ dài đầu ra.", this.name, true);
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new ProviderError(`Gemini dừng bất thường (${candidate.finishReason})${candidate.finishMessage ? `: ${candidate.finishMessage}` : "."}`, this.name, true);
    }
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new ProviderError(`Gemini không trả JSON${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`, this.name);
    try {
      return parseStructuredText(schema, text);
    } catch (error) {
      const reason = candidate?.finishReason ? `; finishReason=${candidate.finishReason}` : "";
      throw new ProviderError(`Gemini trả dữ liệu không đúng schema${reason}: ${error instanceof Error ? error.message : "không xác định"}`, this.name, true);
    }
  }
}
