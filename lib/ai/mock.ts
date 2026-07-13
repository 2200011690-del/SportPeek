import type { AIProvider, ClassifiedArticle, ClusterSummary } from "./types";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  async classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle> {
    const text = `${input.title} ${input.excerpt}`.toLowerCase();
    return { sport: "football", competition: text.includes("champions") ? "champions-league" : "premier-league", teams: ["Arsenal", "Liverpool"].filter((team) => text.includes(team.toLowerCase())), players: [], topics: text.includes("chuyển nhượng") ? ["transfer"] : ["match-update"], articleType: text.includes("chấn thương") ? "injury" : "news", language: "vi" };
  }
  async summarizeCluster(input: { articles: Array<{ id: string; title: string; excerpt: string }> }): Promise<ClusterSummary> {
    const primary = input.articles[0];
    return { title: primary?.title ?? "Bản tin tổng hợp", summary: `${primary?.excerpt ?? "Thông tin đang được cập nhật."} Đây là bản tóm tắt minh họa, không bổ sung dữ kiện ngoài nguồn.`, keyPoints: input.articles.slice(0, 3).map((article) => article.title), sourceIds: input.articles.map((article) => article.id) };
  }
  async extractEntities(input: { title: string; excerpt: string }) { const result = await this.classifyArticle(input); return { teams: result.teams, players: result.players, competitions: result.competition ? [result.competition] : [] }; }
  async createMatchPreview() { return "Hai đội bước vào trận với phong độ ổn định. Ba điểm đáng chú ý là khả năng pressing, bóng chết và chuyển trạng thái. Nội dung được tạo từ dữ liệu minh họa."; }
  async createMatchRecap() { return "Trận đấu có nhịp độ cao và được quyết định bởi hiệu quả dứt điểm. SportPeek không bổ sung thống kê ngoài dữ liệu đầu vào."; }
}
