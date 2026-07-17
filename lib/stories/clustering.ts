import { duplicateSimilarity, normalizeTitle } from "@/lib/ingestion/utils";

export type StoryEventType =
  | "transfer"
  | "injury"
  | "recovery"
  | "preview"
  | "result"
  | "lineup"
  | "quote"
  | "correction"
  | "news";

export type ClusterableArticle = {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  sourceName?: string;
  author?: string | null;
  originalUrl?: string;
  canonicalUrl?: string | null;
  isOfficial?: boolean;
  isSyndicated?: boolean;
  rawMetadata?: Record<string, unknown>;
};

export type ClusterCandidate = { articles: ClusterableArticle[] };

/**
 * Scores at or above `autoMerge` are deterministic merges. Scores in the
 * review band may be sent to an AI matcher, but only after all hard gates pass.
 */
export const CLUSTER_THRESHOLDS = Object.freeze({
  autoMerge: 0.68,
  aiReview: 0.5,
  nearDuplicate: 0.86,
});

const STOP_WORDS = new Set([
  "after", "against", "before", "breaking", "could", "from", "latest", "news", "report", "reportedly", "says", "said", "that", "this", "with",
  "bong", "cau", "chuyen", "choi", "cung", "dang", "danh", "duoc", "giua", "hom", "khien", "moi", "nhan", "nhung", "phat", "quan", "sau", "theo", "thang", "thua", "tien", "tran", "truoc", "tuyen", "viec",
]);

const EVENT_WORDS = new Set([
  "bid", "beat", "champion", "contract", "draw", "final", "full", "injury", "lineup", "match", "preview", "result", "return", "sign", "signing", "transfer", "win",
  "chien", "chung", "dich", "dinh", "doi", "dong", "gap", "gia", "hop", "ket", "hoi", "phuc", "qua", "thang", "thuong", "tro", "vo",
]);

const AGENCY_PATTERN = /\b(reuters|associated press|\bap\b|agence france presse|\bafp\b|ttxvn|thong tan xa viet nam|vietnam news agency|\bvna\b)\b/i;

function normalized(value: string): string {
  return normalizeTitle(value);
}

function normalizedEventText(value: string): string {
  // `normalizeTitle` intentionally removes Vietnamese accents. Mask the month
  // word first so `tháng` cannot collapse to `thang` and be mistaken for the
  // result verb `thắng`.
  return normalized(value.normalize("NFC").replace(/\btháng\b/giu, " "));
}

export function storyEventType(value: string): StoryEventType {
  const text = normalizedEventText(value);
  if (/\b(dinh chinh|correction|corrects?|clarification)\b/.test(text)) return "correction";
  if (/\b(tro lai|hoi phuc|tai xuat|return(?:s|ed)?|fit again|back in training)\b/.test(text)) return "recovery";
  if (/\b(chan thuong|injur(?:y|ed)|vang mat|ruled out|miss(?:es|ing)? the match)\b/.test(text)) return "injury";
  if (/\b(chuyen nhuong|transfer|ky hop dong|sign(?:s|ed|ing)?|gia nhap|bid for|deal for|medical)\b/.test(text)) return "transfer";
  if (/\b(ket qua|danh bai|chien thang|thang|thua|hoa|draw|wins?|won|beats?|full time|vo dich|champion)\b/.test(text)) return "result";
  if (/\b(doi hinh|lineup|line up|starting xi|xuat phat)\b/.test(text)) return "lineup";
  if (/\b(truoc tran|preview|nhan dinh|du doan)\b/.test(text)) return "preview";
  if (/\b(phat bieu|noi gi|says?|said|quote|tuyen bo)\b/.test(text)) return "quote";
  return "news";
}

function tokens(value: string, includeEventWords = false): Set<string> {
  return new Set(
    normalized(value)
      .split(" ")
      .filter((token) => token.length >= 3)
      .filter((token) => !STOP_WORDS.has(token))
      .filter((token) => includeEventWords || !EVENT_WORDS.has(token)),
  );
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((token) => right.has(token)).length;
  return common / Math.min(left.size, right.size);
}

function commonTokenCount(left: Set<string>, right: Set<string>): number {
  return [...left].filter((token) => right.has(token)).length;
}

function eventTypesCompatible(left: StoryEventType, right: StoryEventType): boolean {
  if (left === right) return true;
  // A generic headline may be reviewed against a typed event, but a typed
  // event is never allowed to bridge two incompatible phases of a story.
  return left === "news" || right === "news";
}

function validTime(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function timeWindowHours(type: StoryEventType): number {
  switch (type) {
    case "transfer": return 14 * 24;
    case "correction": return 7 * 24;
    case "injury":
    case "recovery": return 4 * 24;
    case "preview":
    case "lineup":
    case "result": return 36;
    case "quote": return 48;
    default: return 72;
  }
}

function scoreFacts(value: string): string[] {
  const text = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return [...text.matchAll(/\b(\d{1,2})\s*(?:-|:)\s*(\d{1,2})\b/g)].map((match) => `${Number(match[1])}-${Number(match[2])}`);
}

function entityTokenSequence(value: string): string[] {
  return normalized(value)
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token) && !EVENT_WORDS.has(token));
}

function participantsAreReversed(left: ClusterableArticle, right: ClusterableArticle): boolean {
  const leftSequence = [...new Set(entityTokenSequence(left.title))];
  const rightSequence = [...new Set(entityTokenSequence(right.title))];
  const rightPositions = new Map(rightSequence.map((token, index) => [token, index]));
  const shared = leftSequence.filter((token) => rightPositions.has(token));
  if (shared.length < 2) return false;

  let sameOrderPairs = 0;
  let reversedOrderPairs = 0;
  for (let index = 0; index < shared.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < shared.length; otherIndex += 1) {
      const firstPosition = rightPositions.get(shared[index]);
      const secondPosition = rightPositions.get(shared[otherIndex]);
      if (firstPosition === undefined || secondPosition === undefined) continue;
      if (firstPosition < secondPosition) sameOrderPairs += 1;
      else reversedOrderPairs += 1;
    }
  }
  return reversedOrderPairs > sameOrderPairs;
}

function reverseScore(score: string): string {
  const [home, away] = score.split("-");
  return `${away}-${home}`;
}

function hasConflictingScore(left: ClusterableArticle, right: ClusterableArticle, type: StoryEventType): boolean {
  if (type !== "result") return false;
  const leftScores = scoreFacts(`${left.title} ${left.excerpt}`);
  const rightScores = scoreFacts(`${right.title} ${right.excerpt}`);
  if (!leftScores.length || !rightScores.length) return false;
  if (leftScores.some((score) => rightScores.includes(score))) return false;
  const mirroredScore = leftScores.some((score) => rightScores.includes(reverseScore(score)));
  if (mirroredScore && participantsAreReversed(left, right)) return false;
  return true;
}

function sameCanonicalUrl(left: ClusterableArticle, right: ClusterableArticle): boolean {
  const a = left.canonicalUrl ?? left.originalUrl;
  const b = right.canonicalUrl ?? right.originalUrl;
  if (!a || !b) return false;
  try {
    const first = new URL(a); const second = new URL(b);
    first.hash = ""; second.hash = "";
    return first.toString() === second.toString();
  } catch {
    return false;
  }
}

function evidenceForPair(article: ClusterableArticle, other: ClusterableArticle) {
  const articleType = storyEventType(`${article.title} ${article.excerpt}`);
  const otherType = storyEventType(`${other.title} ${other.excerpt}`);
  const articleTime = validTime(article.publishedAt);
  const otherTime = validTime(other.publishedAt);
  if (articleTime === null || otherTime === null) return { score: 0, compatible: false, reason: "invalid_published_time" };

  const hours = Math.abs(articleTime - otherTime) / 3_600_000;
  const maxHours = Math.max(timeWindowHours(articleType), timeWindowHours(otherType));
  if (hours > maxHours) return { score: 0, compatible: false, reason: "outside_event_time_window" };

  if (!eventTypesCompatible(articleType, otherType)) return { score: 0, compatible: false, reason: "event_phase_conflict" };
  if (hasConflictingScore(article, other, articleType === "result" ? articleType : otherType)) return { score: 0, compatible: false, reason: "score_fact_conflict" };

  if (sameCanonicalUrl(article, other)) return { score: 1, compatible: true, reason: "same_canonical_url" };

  const titleSimilarity = duplicateSimilarity(article.title, other.title);
  const leftEntities = tokens(article.title);
  const rightEntities = tokens(other.title);
  const sharedEntities = commonTokenCount(leftEntities, rightEntities);
  const entityOverlap = overlapCoefficient(leftEntities, rightEntities);
  const bodyOverlap = overlapCoefficient(tokens(`${article.title} ${article.excerpt}`, true), tokens(`${other.title} ${other.excerpt}`, true));
  const sameTypedEvent = articleType === otherType;

  // One shared name is not sufficient for result and transfer stories: it can
  // otherwise merge two matches involving Liverpool or two bids for one player.
  const entityFloor = articleType === "result" || articleType === "transfer" || otherType === "result" || otherType === "transfer" ? 2 : 1;
  const exactishTitle = titleSimilarity >= CLUSTER_THRESHOLDS.nearDuplicate;
  if (!exactishTitle && sharedEntities < entityFloor) return { score: 0, compatible: false, reason: "insufficient_shared_entities" };

  // Generic `news` can match a typed event only when the titles are already
  // strong near-duplicates; this prevents it acting as a transitive bridge.
  if (!sameTypedEvent && titleSimilarity < 0.72) return { score: 0, compatible: false, reason: "generic_event_bridge_blocked" };

  const timeSignal = Math.max(0, 1 - hours / maxHours);
  let score = titleSimilarity * 0.48 + entityOverlap * 0.25 + bodyOverlap * 0.17 + timeSignal * 0.07 + (sameTypedEvent ? 0.03 : 0);
  if (article.sourceId === other.sourceId && titleSimilarity < 0.8) score -= 0.1;
  return {
    score: Math.max(0, Math.min(1, score)),
    compatible: true,
    reason: "event_entities_facts_time",
  };
}

export function clusterSimilarity(article: ClusterableArticle, candidate: ClusterCandidate): { score: number; compatible: boolean; reason: string } {
  let best = { score: 0, compatible: false, reason: "empty_candidate" };
  for (const other of candidate.articles) {
    const result = evidenceForPair(article, other);
    if (result.compatible && (!best.compatible || result.score > best.score)) best = result;
    else if (!best.compatible && result.score >= best.score) best = result;
  }
  return best;
}

function hostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).hostname.toLowerCase().replace(/^(?:www\.|m\.)/, ""); } catch { return null; }
}

function metadataString(metadata: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function agencyName(article: ClusterableArticle): string | null {
  const explicit = metadataString(article.rawMetadata, ["originalSource", "original_source", "syndicatedFrom", "syndicated_from", "wireSource", "wire_source", "agency"]);
  const value = explicit ?? article.author ?? article.sourceName ?? "";
  const match = value.match(AGENCY_PATTERN);
  return match ? normalized(match[0]) : explicit ? normalized(explicit) : null;
}

/**
 * Groups copied wire coverage as one independent source. Explicit RSS metadata
 * wins; otherwise only extremely similar title+excerpt pairs are inferred as
 * syndicated, deliberately favouring under-detection over false positives.
 */
export function analyzeSourceIndependence(articles: ClusterableArticle[]): {
  independentSourceCount: number;
  syndicatedArticleIds: Set<string>;
  groupByArticleId: Map<string, string>;
} {
  const syndicatedArticleIds = new Set(articles.filter((article) => article.isSyndicated).map((article) => article.id));
  const groupByArticleId = new Map<string, string>();

  for (const article of articles) {
    const agency = agencyName(article);
    const publisher = hostname(article.canonicalUrl ?? article.originalUrl) ?? normalized(article.sourceName ?? article.sourceId);
    const sourceLooksLikeAgency = agency ? normalized(article.sourceName ?? "").includes(agency) : false;
    if (agency) {
      groupByArticleId.set(article.id, `agency:${agency}`);
      if (!sourceLooksLikeAgency) syndicatedArticleIds.add(article.id);
    } else {
      groupByArticleId.set(article.id, `publisher:${publisher || article.sourceId}`);
    }
  }

  const ordered = [...articles].sort((a, b) => (validTime(a.publishedAt) ?? 0) - (validTime(b.publishedAt) ?? 0));
  for (let index = 0; index < ordered.length; index += 1) {
    const primary = ordered[index];
    for (let otherIndex = index + 1; otherIndex < ordered.length; otherIndex += 1) {
      const copy = ordered[otherIndex];
      if (primary.sourceId === copy.sourceId || primary.isOfficial || copy.isOfficial) continue;
      const hours = Math.abs((validTime(primary.publishedAt) ?? 0) - (validTime(copy.publishedAt) ?? 0)) / 3_600_000;
      if (hours > 24 || primary.excerpt.length < 80 || copy.excerpt.length < 80) continue;
      const titleSimilarity = duplicateSimilarity(primary.title, copy.title);
      const excerptSimilarity = duplicateSimilarity(primary.excerpt, copy.excerpt);
      if (titleSimilarity >= 0.82 && excerptSimilarity >= CLUSTER_THRESHOLDS.nearDuplicate) {
        groupByArticleId.set(copy.id, groupByArticleId.get(primary.id) ?? `publisher:${primary.sourceId}`);
        syndicatedArticleIds.add(copy.id);
      }
    }
  }

  const independentArticles = articles.filter((article) => !syndicatedArticleIds.has(article.id));
  const counted = independentArticles.length ? independentArticles : articles.slice(0, 1);
  const groups = new Set(counted.map((article) => groupByArticleId.get(article.id) ?? `publisher:${article.sourceId}`));
  return { independentSourceCount: groups.size, syndicatedArticleIds, groupByArticleId };
}
