import { z } from "zod";
import type { AIProvider, ClusterArticleInput } from "./types";

export const classifiedSchema = z.object({ sport: z.string(), competition: z.string().nullable(), teams: z.array(z.string()), players: z.array(z.string()), topics: z.array(z.string()), articleType: z.string(), language: z.string() });
export const summarySchema = z.object({ title: z.string().min(1).max(500), summary: z.string().min(80).max(1800), keyPoints: z.array(z.string().min(1)).min(1).max(5), sourceIds: z.array(z.string()).min(1) });
export const matchEvaluationSchema = z.object({ sameEvent: z.boolean(), confidence: z.number().min(0).max(1), reason: z.string() });
export const timelineSchema = z.array(z.object({ occurredAt: z.string().datetime({ offset: true }), content: z.string().min(1), updateType: z.string(), supportingArticleIds: z.array(z.string()).min(1) }));
export const agreementsSchema = z.array(z.object({ text: z.string().min(1), sourceArticleIds: z.array(z.string()).min(1) }));
export const disputesSchema = z.array(z.object({ topic: z.string().min(1), positions: z.array(z.object({ claim: z.string().min(1), sourceArticleIds: z.array(z.string()).min(1) })).min(2) }));
export const answerSchema = z.object({ answer: z.string().min(1), sourceArticleIds: z.array(z.string()) });

export const CLUSTER_SUMMARY_TASK = "Viết lại thành một bản tóm tắt biên tập duy nhất bằng tiếng Việt trong 120–180 từ. Đọc toàn bộ bài trong cụm, gộp các dữ kiện chung và chỉ nói mỗi dữ kiện một lần. Không liệt kê lần lượt từng nguồn, không nối các trích đoạn, không lặp cùng một ý bằng cách diễn đạt khác. Chỉ thêm chi tiết riêng của một nguồn khi chi tiết đó bổ sung bối cảnh và không trùng; nếu các nguồn mâu thuẫn, nêu khác biệt ngắn gọn thay vì tự chọn một phía. Không thêm tỷ số, thống kê, phát biểu, phí chuyển nhượng hay chấn thương ngoài đầu vào. sourceIds chỉ chứa ID đầu vào thực sự được dùng.";

export function providerJsonSchema<T>(schema: z.ZodType<T>): Record<string, unknown> {
  const jsonSchema = { ...(z.toJSONSchema(schema) as Record<string, unknown>) };
  delete jsonSchema.$schema;
  return jsonSchema;
}

export function parseStructuredText<T>(schema: z.ZodType<T>, value: string): T {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return schema.parse(JSON.parse(cleaned));
}

export abstract class RemoteAIProvider implements AIProvider {
  abstract readonly name: string;
  protected abstract structured<T>(schema: z.ZodType<T>, task: string, input: unknown): Promise<T>;
  classifyArticle(input: { title: string; excerpt: string }) { return this.structured(classifiedSchema, "Phân loại bài thể thao, chỉ dùng dữ kiện đầu vào.", input); }
  summarizeCluster(input: { articles: ClusterArticleInput[] }) { return this.structured(summarySchema, CLUSTER_SUMMARY_TASK, input); }
  extractEntities(input: { title: string; excerpt: string }) { return this.classifyArticle(input).then((result) => ({ teams: result.teams, players: result.players, competitions: result.competition ? [result.competition] : [] })); }
  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }) { return this.structured(matchEvaluationSchema, "Đánh giá hai nhóm metadata có nói đúng cùng một sự kiện hay không. Không gộp preview với result, injury với recovery, hoặc hai thương vụ khác nhau.", input); }
  generateTimeline(input: { articles: ClusterArticleInput[] }) { return this.structured(timelineSchema, "Tạo timeline chỉ từ thời gian và nội dung bài nguồn; mỗi mục phải dẫn supportingArticleIds.", input); }
  identifyAgreements(input: { articles: ClusterArticleInput[] }) { return this.structured(agreementsSchema, "Chỉ nêu dữ kiện có ít nhất hai bài nguồn hỗ trợ.", input); }
  identifyDisputes(input: { articles: ClusterArticleInput[] }) { return this.structured(disputesSchema, "Nêu điểm các nguồn khác nhau; không tự tạo mâu thuẫn.", input); }
  async answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }) { const result = await this.structured(answerSchema, "Trả lời chỉ bằng context. Nếu thiếu dữ kiện, nói rõ không đủ dữ kiện.", input); return `${result.answer}${result.sourceArticleIds.length ? ` (Nguồn: ${result.sourceArticleIds.join(", ")})` : ""}`; }
  async createMatchPreview() { return "Chức năng này cần job dữ liệu trận riêng."; }
  async createMatchRecap() { return "Chức năng này cần job dữ liệu trận riêng."; }
}
