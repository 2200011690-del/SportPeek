import { z } from "zod";
import type { AIProvider, ClassifiedArticle, ClusterSummary } from "./types";
import type { NewsEnrichment } from "./openai";
import { agreementsSchema, answerSchema, CLUSTER_SUMMARY_TASK, disputesSchema, matchEvaluationSchema, timelineSchema } from "./remote-base";
import type { ClusterArticleInput } from "./types";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const NATIVE_JSON_SCHEMA_MODELS = new Set([
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3-8b-instruct",
  "@cf/meta/llama-3.1-8b-instruct",
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@hf/nousresearch/hermes-2-pro-mistral-7b",
  "@hf/thebloke/deepseek-coder-6.7b-instruct-awq",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
]);

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

const enrichmentSchema = z.object({ items: z.array(enrichmentItemSchema).length(1) });

function modelName(): string {
  return process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL;
}

function supportsNativeJsonSchema(model: string): boolean {
  return NATIVE_JSON_SCHEMA_MODELS.has(model);
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
  const model = modelName();
  const nativeSchema = supportsNativeJsonSchema(model);
  const payload = await ai.run(model, {
    messages: [
      { role: "system", content: nativeSchema ? system : `${system}\nTrả về duy nhất JSON hợp lệ, không markdown, theo JSON Schema sau: ${JSON.stringify(jsonSchema)}` },
      { role: "user", content: JSON.stringify(input) },
    ],
    ...(nativeSchema ? { response_format: { type: "json_schema" as const, json_schema: jsonSchema } } : {}),
    max_tokens: maxTokens,
    temperature: 0.1,
  });
  return schema.parse(parseModelPayload(payload));
}

const enrichmentJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 1,
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
  const settled = await Promise.allSettled(articles.map(async (article) => {
    const result = await runStructured(
      enrichmentSchema,
      enrichmentJsonSchema,
      "Bạn là biên tập viên tin tức trung lập của NewsPeek. Phải trả đúng một item và giữ nguyên tuyệt đối trường id. Chỉ dùng dữ kiện trong metadata được cung cấp. Dịch tự nhiên, ngắn gọn sang tiếng Việt, giữ nguyên tên riêng, không suy đoán, không giật tít quá mức và không sao chép dài.",
      { articles: [article] },
      900,
    );
    const item = result.items[0];
    if (item.id !== article.id) throw new Error(`Cloudflare AI đổi article id ${article.id}`);
    return item;
  }));
  const valid = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) console.warn(`[NewsPeek AI] ${failures.length}/${articles.length} article translations failed`);
  if (!valid.length) {
    const reason = failures[0]?.reason;
    throw reason instanceof Error ? reason : new Error("Cloudflare AI không dịch được bài nào");
  }
  return valid;
}

const classificationSchema = z.object({
  category: z.string(),
  topics: z.array(z.string()),
  people: z.array(z.string()),
  organizations: z.array(z.string()),
  locations: z.array(z.string()),
  countries: z.array(z.string()),
  articleType: z.string(),
  language: z.string(),
});

const classificationJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["category", "topics", "people", "organizations", "locations", "countries", "articleType", "language"],
  properties: {
    category: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    people: { type: "array", items: { type: "string" } },
    organizations: { type: "array", items: { type: "string" } },
    locations: { type: "array", items: { type: "string" } },
    countries: { type: "array", items: { type: "string" } },
    articleType: { type: "string" },
    language: { type: "string" },
  },
};

export class CloudflareAIProvider implements AIProvider {
  readonly name = "cloudflare";

  classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle> {
    return runStructured(classificationSchema, classificationJsonSchema, "Phân loại metadata tin tức tổng quát. Chọn một chuyên mục phù hợp và không thêm thực thể không có trong đầu vào.", input, 900);
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
    const result = await runStructured(schema, jsonSchema, CLUSTER_SUMMARY_TASK, input, 2200);
    return { ...result, sourceIds: input.articles.map((article) => article.id) };
  }

  async extractEntities(input: { title: string; excerpt: string }) {
    const result = await this.classifyArticle(input);
    return { people: result.people, organizations: result.organizations, locations: result.locations, countries: result.countries };
  }

  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }) {
    return runStructured(matchEvaluationSchema, z.toJSONSchema(matchEvaluationSchema) as Record<string, unknown>, "Đánh giá đúng cùng một sự kiện tin tức; không gộp hai sự kiện, hai thời điểm hoặc hai diễn biến khác nhau chỉ vì có chung thực thể.", input, 900);
  }

  generateTimeline(input: { articles: ClusterArticleInput[] }) {
    return runStructured(timelineSchema, z.toJSONSchema(timelineSchema) as Record<string, unknown>, "Tạo timeline chỉ từ bài nguồn; mỗi mục phải có supportingArticleIds hợp lệ.", input, 1400);
  }

  identifyAgreements(input: { articles: ClusterArticleInput[] }) {
    return runStructured(agreementsSchema, z.toJSONSchema(agreementsSchema) as Record<string, unknown>, "Chỉ nêu dữ kiện được ít nhất hai bài nguồn hỗ trợ.", input, 1200);
  }

  identifyDisputes(input: { articles: ClusterArticleInput[] }) {
    return runStructured(disputesSchema, z.toJSONSchema(disputesSchema) as Record<string, unknown>, "Chỉ nêu mâu thuẫn thực sự có trong metadata nguồn.", input, 1200);
  }

  async answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }) {
    const result = await runStructured(answerSchema, z.toJSONSchema(answerSchema) as Record<string, unknown>, "Trả lời chỉ bằng context và nói rõ khi không đủ dữ kiện.", input, 1200);
    return `${result.answer}${result.sourceArticleIds.length ? ` (Nguồn: ${result.sourceArticleIds.join(", ")})` : ""}`;
  }

}
