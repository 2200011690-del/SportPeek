import { duplicateSimilarity, normalizeTitle } from "@/lib/ingestion/utils";

export type ClusterableArticle = { id: string; sourceId: string; title: string; excerpt: string; publishedAt: string };
export type ClusterCandidate = { articles: ClusterableArticle[] };

export function storyEventType(value: string): "transfer" | "injury" | "recovery" | "preview" | "result" | "lineup" | "quote" | "correction" | "news" {
  const text = normalizeTitle(value);
  if (/dinh chinh|correction|corrects/.test(text)) return "correction";
  if (/tro lai|hoi phuc|return|fit again/.test(text)) return "recovery";
  if (/chan thuong|injur|vang mat|ruled out/.test(text)) return "injury";
  if (/chuyen nhuong|transfer|ky hop dong|signing|gia nhap|bid for/.test(text)) return "transfer";
  if (/ket qua|danh bai|chien thang|thang |thua |draw|win|beat|full time|vo dich/.test(text)) return "result";
  if (/doi hinh|lineup|starting xi/.test(text)) return "lineup";
  if (/truoc tran|preview|nhan dinh/.test(text)) return "preview";
  if (/phat bieu|noi gi|says|said|quote/.test(text)) return "quote";
  return "news";
}

function significantTokens(value: string): Set<string> { return new Set(normalizeTitle(value).split(" ").filter((token) => token.length >= 4 && !/^(this|that|with|from|after|before|trong|nhung|duoc|cung|theo|moi|news|latest)$/.test(token))); }
function compatible(left: ReturnType<typeof storyEventType>, right: ReturnType<typeof storyEventType>) { if (left === right) return true; if (left === "news" || right === "news") return true; return false; }

export function clusterSimilarity(article: ClusterableArticle, candidate: ClusterCandidate): { score: number; compatible: boolean; reason: string } {
  const articleType = storyEventType(`${article.title} ${article.excerpt}`); let best = 0; let bestCompatible = false;
  for (const other of candidate.articles) {
    const hours = Math.abs(Date.parse(article.publishedAt) - Date.parse(other.publishedAt)) / 3_600_000; if (hours > (articleType === "transfer" ? 168 : 72)) continue;
    const otherType = storyEventType(`${other.title} ${other.excerpt}`); const typesCompatible = compatible(articleType, otherType); const title = duplicateSimilarity(article.title, other.title); const a = significantTokens(article.title); const b = significantTokens(other.title); const overlap = [...a].filter((token) => b.has(token)).length / Math.max(1, Math.min(a.size, b.size)); let score = title * 0.72 + overlap * 0.2 + (typesCompatible ? 0.08 : -0.35);
    if (article.sourceId === other.sourceId && title < 0.75) score -= 0.12;
    if (score > best) { best = score; bestCompatible = typesCompatible; }
  }
  return { score: Math.max(0, Math.min(1, best)), compatible: bestCompatible, reason: bestCompatible ? "title_entities_time" : "event_type_or_time_conflict" };
}
