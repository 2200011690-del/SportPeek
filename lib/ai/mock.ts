import type { AIProvider, ClassifiedArticle, ClusterSummary } from "./types";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  async classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle> {
    const text = `${input.title} ${input.excerpt}`.toLowerCase();
    const category = /công nghệ|technology|\bai\b/.test(text) ? "Công nghệ" : /kinh tế|business|finance/.test(text) ? "Kinh tế" : /thể thao|football|arsenal|liverpool/.test(text) ? "Thể thao" : "Việt Nam";
    return { category, topics: [category], people: [], organizations: [], locations: [], countries: [], articleType: "news", language: "vi" };
  }
  async summarizeCluster(input: { articles: Array<{ id: string; title: string; excerpt: string }> }): Promise<ClusterSummary> {
    const primary = input.articles[0];
    return { title: primary?.title ?? "Bản tin tổng hợp", summary: `${primary?.excerpt ?? "Thông tin đang được cập nhật."} Đây là bản tóm tắt minh họa, không bổ sung dữ kiện ngoài nguồn.`, keyPoints: input.articles.slice(0, 3).map((article) => article.title), sourceIds: input.articles.map((article) => article.id) };
  }
  async extractEntities(input: { title: string; excerpt: string }) { const result = await this.classifyArticle(input); return { people: result.people, organizations: result.organizations, locations: result.locations, countries: result.countries }; }
  async evaluateClusterMatch() { return { sameEvent: true, confidence: 0.9, reason: "development_fixture" }; }
  async generateTimeline(input: { articles: Array<{ id: string; title: string; publishedAt?: string }> }) { return input.articles.map((article, index) => ({ occurredAt: article.publishedAt ?? new Date(index * 1000).toISOString(), content: article.title, updateType: "source_update", supportingArticleIds: [article.id] })); }
  async identifyAgreements(input: { articles: Array<{ id: string; title: string }> }) { return input.articles.length ? [{ text: input.articles[0].title, sourceArticleIds: input.articles.map((article) => article.id) }] : []; }
  async identifyDisputes() { return []; }
  async answerFromClusterContext() { return "Câu trả lời minh họa từ dữ liệu phát triển."; }
}
