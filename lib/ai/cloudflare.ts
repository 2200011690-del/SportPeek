import { z } from "zod";
import type { AIProvider, ClassifiedArticle, ClusterSummary } from "./types";
import type { NewsEnrichment } from "./openai";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

type WorkersAIInput = {
  messages: Array<{ role: "system" | "user"; content: string }>;
  response_format?: { type: "json_schema"; json_schema: Record<string, unknown> };
  max_tokens?: number;
  temperature?: number;
};

export type WorkersAIBinding = {
  run(model: string, input: WorkersAIInput): Promise<unknown>;
};

declare global {
  // The Worker entry point installs the request-scoped Cloudflare binding here
  // before Vinext dispatches to the Next.js route code.
  var __SPORTPEEK_WORKERS_AI__: WorkersAIBinding | undefined;
}

const enrichmentItemSchema = z.object({
  id: z.string(),
  titleVi: z.string().min(1),
  summaryVi: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1).max(3),
  topic: z.string().min(1),
  importance: z.number().int().min(0).max(100),
});

const enrichmentSchema = z.object({ items: z.array(enrichmentItemSchema).min(1).max(8) });

function modelName(): string {
  return process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL;
}

export function setWorkersAIBinding(binding: WorkersAIBinding | undefined): void {
  globalThis.__SPORTPEEK_WORKERS_AI__ = binding;
}

export function hasWorkersAIBinding(): boolean {
  return Boolean(globalThis.__SPORTPEEK_WORKERS_AI__);
}

function parseModelPayload(payload: unknown): unknown {
  const response = payload && typeof payload === "object" && "response" in payload
    ? (payload as { response: unknown }).response
    : payload;
  if (typeof response !== "string") return response;
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function runStructured<T>(schema: z.ZodType<T>, jsonSchema: Record<string, unknown>, system: string, input: unknown, maxTokens = 3500): Promise<T> {
  const ai = globalThis.__SPORTPEEK_WORKERS_AI__;
  if (!ai) throw new Error("Cloudflare Workers AI binding chưa khả dụng");
  const payload = await ai.run(modelName(), {
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: { type: "json_schema", json_schema: jsonSchema },
    max_tokens: maxTokens,
    temperature: 0.1,
  });
  return schema.parse(parseModelPayload(payload));
}

async function runText(system: string, input: unknown): Promise<string> {
  const ai = globalThis.__SPORTPEEK_WORKERS_AI__;
  if (!ai) throw new Error("Cloudflare Workers AI binding chưa khả dụng");
  const payload = await ai.run(modelName(), {
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(input) },
    ],
    max_tokens: 700,
    temperature: 0.15,
  });
  const response = payload && typeof payload === "object" && "response" in payload
    ? (payload as { response: unknown }).response
    : payload;
  if (typeof response !== "string" || !response.trim()) throw new Error("Cloudflare Workers AI không trả về nội dung");
  return response.trim();
}

const enrichmentJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "titleVi", "summaryVi", "keyPoints", "topic", "importance"],
        properties: {
          id: { type: "string" },
          titleVi: { type: "string" },
          summaryVi: { type: "string" },
          keyPoints: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
          topic: { type: "string" },
          importance: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
};

export async function enrichInternationalNewsWithCloudflare(articles: Array<{ id: string; title: string; excerpt: string }>): Promise<NewsEnrichment[]> {
  if (!articles.length) return [];
  const result = await runStructured(
    enrichmentSchema,
    enrichmentJsonSchema,
    "Bạn là biên tập viên thể thao trung lập. Phải trả đúng một item cho mỗi article và giữ nguyên tuyệt đối trường id. Chỉ dùng dữ kiện trong metadata được cung cấp. Dịch tự nhiên sang tiếng Việt, giữ nguyên tên riêng, không suy đoán, không giật tít quá mức và không sao chép dài.",
    { articles },
    4500,
  );
  const allowed = new Set(articles.map((article) => article.id));
  const valid = result.items.filter((item) => allowed.has(item.id));
  if (!valid.length) {
    console.warn("[SportPeek AI] Model returned no matching article ids", {
      requested: [...allowed],
      returned: result.items.map((item) => item.id),
    });
  }
  return valid;
}

const classificationSchema = z.object({
  sport: z.string(),
  competition: z.string().nullable(),
  teams: z.array(z.string()),
  players: z.array(z.string()),
  topics: z.array(z.string()),
  articleType: z.string(),
  language: z.string(),
});

const classificationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["sport", "competition", "teams", "players", "topics", "articleType", "language"],
  properties: {
    sport: { type: "string" },
    competition: { type: ["string", "null"] },
    teams: { type: "array", items: { type: "string" } },
    players: { type: "array", items: { type: "string" } },
    topics: { type: "array", items: { type: "string" } },
    articleType: { type: "string" },
    language: { type: "string" },
  },
};

export class CloudflareAIProvider implements AIProvider {
  readonly name = "cloudflare";

  classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle> {
    return runStructured(classificationSchema, classificationJsonSchema, "Phân loại metadata bài thể thao. Không thêm thực thể không có trong đầu vào.", input, 900);
  }

  async summarizeCluster(input: { articles: Array<{ id: string; title: string; excerpt: string }> }): Promise<ClusterSummary> {
    const schema = z.object({ title: z.string(), summary: z.string(), keyPoints: z.array(z.string()).max(3) });
    const jsonSchema = {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary", "keyPoints"],
      properties: {
        title: { type: "string" }, summary: { type: "string" },
        keyPoints: { type: "array", maxItems: 3, items: { type: "string" } },
      },
    };
    const result = await runStructured(schema, jsonSchema, "Tóm tắt cụm tin thể thao bằng tiếng Việt. Chỉ dùng dữ kiện trong đầu vào, không suy đoán.", input, 1200);
    return { ...result, sourceIds: input.articles.map((article) => article.id) };
  }

  async extractEntities(input: { title: string; excerpt: string }) {
    const result = await this.classifyArticle(input);
    return { teams: result.teams, players: result.players, competitions: result.competition ? [result.competition] : [] };
  }

  createMatchPreview(input: Record<string, unknown>): Promise<string> {
    return runText("Viết nhận định trước trận ngắn bằng tiếng Việt, chỉ dùng dữ liệu đầu vào và nói rõ dữ kiện nào còn thiếu.", input);
  }

  createMatchRecap(input: Record<string, unknown>): Promise<string> {
    return runText("Viết tóm tắt sau trận ngắn bằng tiếng Việt, chỉ dùng dữ liệu đầu vào và không tự tạo thống kê.", input);
  }
}
