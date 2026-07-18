import { z } from "zod";
import type { AIProvider, ClusterArticleInput } from "./types";
import { sanitizeClusterSummary } from "./grounding";

export const classifiedSchema = z.object({
  category: z.string(),
  topics: z.array(z.string()),
  people: z.array(z.string()),
  organizations: z.array(z.string()),
  locations: z.array(z.string()),
  countries: z.array(z.string()),
  articleType: z.string(),
  language: z.string(),
});
export const summarySchema = z.object({ title: z.string().min(1).max(500), summary: z.string().min(80).max(4000), keyPoints: z.array(z.string().min(1)).min(1).max(5), sourceIds: z.array(z.string()).min(1) });
export const matchEvaluationSchema = z.object({ sameEvent: z.boolean(), confidence: z.number().min(0).max(1), reason: z.string() });
export const timelineSchema = z.array(z.object({ occurredAt: z.string().datetime({ offset: true }), content: z.string().min(1), updateType: z.string(), supportingArticleIds: z.array(z.string()).min(1) }));
export const agreementsSchema = z.array(z.object({ text: z.string().min(1), sourceArticleIds: z.array(z.string()).min(1) }));
export const disputesSchema = z.array(z.object({ topic: z.string().min(1), positions: z.array(z.object({ claim: z.string().min(1), sourceArticleIds: z.array(z.string()).min(1) })).min(2) }));
export const answerSchema = z.object({ answer: z.string().min(1), sourceArticleIds: z.array(z.string()) });

export const CLUSTER_SUMMARY_TASK = "Viết một bản tổng hợp biên tập tự nhiên bằng tiếng Việt. Với một nguồn metadata ngắn, chỉ viết 80-140 từ; với nhiều nguồn hoặc có toàn văn, viết 220-450 từ thành các đoạn ngắn, đủ bối cảnh để người đọc hiểu sự việc mà không cần đọc từng nguồn. Trước khi viết, tách các dữ kiện thành claim, gộp các dữ kiện chung và claim trùng nhau rồi chỉ nói mỗi dữ kiện một lần; không lặp cùng một ý bằng cách diễn đạt khác. Không liệt kê lần lượt từng nguồn, không nối các trích đoạn, không viết lời giải thích kỹ thuật về AI/RSS/metadata. Chỉ thêm chi tiết riêng khi nó bổ sung bối cảnh; nếu các nguồn mâu thuẫn, nêu rõ khác biệt thay vì tự chọn một phía. Không thêm tỷ số, thống kê, phát biểu, phí chuyển nhượng, chấn thương hoặc kết luận ngoài đầu vào. keyPoints phải là các claim khác nhau. sourceIds chỉ chứa ID đầu vào thực sự được dùng.";

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
  classifyArticle(input: { title: string; excerpt: string }) { return this.structured(classifiedSchema, "Phân loại bài tin tức tổng quát. Chọn một category phù hợp, trích xuất thực thể chỉ khi chúng xuất hiện trong đầu vào và không suy đoán.", input); }
  summarizeCluster(input: { articles: ClusterArticleInput[] }) { return this.structured(summarySchema, CLUSTER_SUMMARY_TASK, input).then((output) => sanitizeClusterSummary(output, input.articles)); }
  extractEntities(input: { title: string; excerpt: string }) { return this.classifyArticle(input).then(({ people, organizations, locations, countries }) => ({ people, organizations, locations, countries })); }
  evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }) { return this.structured(matchEvaluationSchema, "Đánh giá hai nhóm metadata có nói đúng cùng một sự kiện hay không. Không gộp hai sự kiện, hai thời điểm hoặc hai diễn biến khác nhau chỉ vì chúng có chung nhân vật hay tổ chức.", input); }
  generateTimeline(input: { articles: ClusterArticleInput[] }) { return this.structured(timelineSchema, "Tạo timeline chỉ từ thời gian và nội dung bài nguồn; mỗi mục phải dẫn supportingArticleIds.", input); }
  identifyAgreements(input: { articles: ClusterArticleInput[] }) { return this.structured(agreementsSchema, "Chỉ nêu dữ kiện có ít nhất hai bài nguồn hỗ trợ.", input); }
  identifyDisputes(input: { articles: ClusterArticleInput[] }) { return this.structured(disputesSchema, "Nêu điểm các nguồn khác nhau; không tự tạo mâu thuẫn.", input); }
  async answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }) { const result = await this.structured(answerSchema, "Trả lời chỉ bằng context. Nếu thiếu dữ kiện, nói rõ không đủ dữ kiện.", input); return `${result.answer}${result.sourceArticleIds.length ? ` (Nguồn: ${result.sourceArticleIds.join(", ")})` : ""}`; }
}
