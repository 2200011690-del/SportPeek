import { duplicateSimilarity, normalizeTitle } from "@/lib/ingestion/utils";
import { dedupeClaims } from "./grounding";
import type { AIProvider, ClassifiedArticle, ClusterArticleInput, ClusterSummary } from "./types";

function articleType(text: string) {
  if (/tro lai|hoi phuc|return|fit again/.test(text)) return "recovery";
  if (/chan thuong|injur/.test(text)) return "injury";
  if (/chuyen nhuong|transfer|ky hop dong|signing/.test(text)) return "transfer";
  if (/ket qua|danh bai|thang|thua|draw|win|beat|full.?time/.test(text)) return "result";
  if (/doi hinh|line.?up/.test(text)) return "lineup";
  if (/truoc tran|preview/.test(text)) return "preview";
  if (/phat bieu|says|said|quote/.test(text)) return "quote";
  return "news";
}

function sentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(?:xem thêm|đọc thêm|nguồn|theo dõi|ảnh:|video:)/i.test(item));
}

function words(value: string) { return value.trim().split(/\s+/).filter(Boolean).length; }
function withPeriod(value: string) { return /[.!?]$/.test(value) ? value : `${value}.`; }

type Claim = { text: string; articleIds: string[] };

function extractClaims(articles: ClusterArticleInput[]): Claim[] {
  const selected: Claim[] = [];
  for (const article of articles) {
    const material = article.excerpt.trim() || article.title.trim();
    for (const raw of sentences(material)) {
      const text = withPeriod(raw);
      const existing = selected.find((claim) => duplicateSimilarity(claim.text, text) >= 0.74);
      if (existing) {
        if (!existing.articleIds.includes(article.id)) existing.articleIds.push(article.id);
      } else {
        selected.push({ text, articleIds: [article.id] });
      }
    }
  }
  return selected;
}

function scoreValues(value: string): string[] {
  return [...normalizeTitle(value).matchAll(/\b(\d{1,2})\s*(?:-|:)\s*(\d{1,2})\b/g)]
    .map((match) => `${Number(match[1])}-${Number(match[2])}`);
}

export class HeuristicAIProvider implements AIProvider {
  readonly name = "heuristic";

  async classifyArticle(input: { title: string; excerpt: string }): Promise<ClassifiedArticle> {
    const text = normalizeTitle(`${input.title} ${input.excerpt}`);
    const competitions = [["premier league", "Premier League"], ["champions league", "Champions League"], ["world cup", "World Cup"], ["v league", "V.League"]] as const;
    return { sport: "football", competition: competitions.find(([key]) => text.includes(key))?.[1] ?? null, teams: [], players: [], topics: [articleType(text)], articleType: articleType(text), language: /\b(the|and|with|from|after|before)\b/.test(text) ? "en" : "vi" };
  }

  async summarizeCluster(input: { articles: ClusterArticleInput[] }): Promise<ClusterSummary> {
    const lead = input.articles[0];
    const claims = extractClaims(input.articles);
    // Corroborated claims lead, then retain source order for unique details.
    const ordered = claims
      .map((claim, index) => ({ ...claim, index }))
      .sort((a, b) => b.articleIds.length - a.articleIds.length || a.index - b.index);
    const chosen: Claim[] = [];
    for (const claim of ordered) {
      if (words(chosen.map((item) => item.text).join(" ")) >= 180 || chosen.length >= 5) break;
      chosen.push(claim);
    }
    const summary = chosen.map((claim) => claim.text).join(" ").split(/\s+/).slice(0, 200).join(" ") || lead?.title || "Bản tin thể thao";
    const keyPoints = dedupeClaims(chosen.map((claim) => claim.text), 0.72).slice(0, 5);
    const sourceIds = [...new Set(chosen.flatMap((claim) => claim.articleIds))];
    return {
      title: lead?.title ?? "Bản tin thể thao",
      summary,
      keyPoints: keyPoints.length ? keyPoints : [lead?.title ?? "Bản tin thể thao"],
      sourceIds: sourceIds.length ? sourceIds : input.articles.map((article) => article.id),
    };
  }

  async extractEntities() { return { teams: [], players: [], competitions: [] }; }

  async evaluateClusterMatch(input: { article: ClusterArticleInput; candidate: ClusterArticleInput[] }) {
    const score = Math.max(0, ...input.candidate.map((item) => duplicateSimilarity(input.article.title, item.title)));
    const left = articleType(normalizeTitle(`${input.article.title} ${input.article.excerpt}`));
    const types = new Set(input.candidate.map((item) => articleType(normalizeTitle(`${item.title} ${item.excerpt}`))));
    const compatible = types.has(left) || (left === "news" && types.has("news"));
    const confidence = compatible ? score : score * 0.35;
    return { sameEvent: confidence >= 0.68, confidence, reason: compatible ? "title_and_event_type" : "event_type_conflict" };
  }

  async generateTimeline(input: { articles: ClusterArticleInput[] }) {
    return input.articles
      .filter((article) => article.publishedAt && Number.isFinite(Date.parse(article.publishedAt)))
      .map((article) => ({ occurredAt: article.publishedAt as string, content: `${article.sourceName ?? "Nguồn"} đăng: ${article.title}`, updateType: "source_update", supportingArticleIds: [article.id] }))
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  }

  async identifyAgreements(input: { articles: ClusterArticleInput[] }) {
    return extractClaims(input.articles)
      .filter((claim) => claim.articleIds.length >= 2)
      .slice(0, 5)
      .map((claim) => ({ text: claim.text, sourceArticleIds: claim.articleIds }));
  }

  async identifyDisputes(input: { articles: ClusterArticleInput[] }) {
    const claims = input.articles
      .map((article) => ({ article, scores: scoreValues(`${article.title} ${article.excerpt}`) }))
      .filter((item) => item.scores.length);
    const values = new Set(claims.flatMap((item) => item.scores));
    return claims.length >= 2 && values.size >= 2
      ? [{ topic: "Các nguồn nêu tỷ số khác nhau", positions: claims.slice(0, 4).map((item) => ({ claim: item.article.title, sourceArticleIds: [item.article.id] })) }]
      : [];
  }

  async answerFromClusterContext(input: { question: string; articles: ClusterArticleInput[] }) {
    const terms = normalizeTitle(input.question).split(" ").filter((value) => value.length > 2);
    const evidence = input.articles
      .flatMap((article) => sentences(article.excerpt).map((text) => ({ id: article.id, text })))
      .filter((item) => terms.some((term) => normalizeTitle(item.text).includes(term)))
      .slice(0, 3);
    return evidence.length ? `${evidence.map((item) => item.text).join(" ")} (Nguồn: ${[...new Set(evidence.map((item) => item.id))].join(", ")})` : "Không đủ dữ kiện trong các bài nguồn để trả lời câu hỏi này.";
  }

  async createMatchPreview() { return "Chưa đủ dữ liệu có kiểm chứng để tạo nhận định trước trận."; }
  async createMatchRecap() { return "Chưa đủ dữ liệu có kiểm chứng để tạo tóm tắt sau trận."; }
}
