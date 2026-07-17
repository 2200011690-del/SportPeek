import { duplicateSimilarity } from "@/lib/ingestion/utils";
import type { ClusterArticleInput, ClusterSummary } from "./types";

function sentences(value: string): string[] {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function claimSimilarity(left: string, right: string): number {
  const a = new Set(left.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  const b = new Set(right.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  const common = [...a].filter((token) => b.has(token)).length;
  const containment = a.size && b.size ? common / Math.min(a.size, b.size) : 0;
  return Math.max(duplicateSimilarity(left, right), containment);
}

export function dedupeClaims(values: string[], threshold = 0.76): string[] {
  const selected: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const duplicateIndex = selected.findIndex((existing) => claimSimilarity(existing, value) >= threshold);
    if (duplicateIndex >= 0) {
      if (value.length > selected[duplicateIndex].length) selected[duplicateIndex] = value;
      continue;
    }
    selected.push(value);
  }
  return selected;
}

export function dedupeSummaryText(value: string): string {
  return dedupeClaims(sentences(value), 0.78).join(" ").trim();
}

export function evidenceFingerprint(articles: ClusterArticleInput[]): string {
  const claims = dedupeClaims(articles.flatMap((article) => {
    const material = article.excerpt.trim() || article.title.trim();
    return sentences(material);
  }), 0.78)
    .map((claim) => claim.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort();
  let hash = 2166136261;
  for (const character of claims.join("\0")) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function needsClusterSummary(input: { aiGenerated: boolean; reviewStatus?: string | null }): boolean {
  return !input.aiGenerated || input.reviewStatus === "pending";
}

/** Validates grounding and removes repeated claims before content is persisted. */
export function sanitizeClusterSummary(output: ClusterSummary, articles: ClusterArticleInput[]): ClusterSummary {
  const allowed = new Set(articles.map((article) => article.id));
  const sourceIds = [...new Set(output.sourceIds)].filter((id) => allowed.has(id));
  if (!sourceIds.length || sourceIds.length !== new Set(output.sourceIds).size) {
    throw new Error("AI returned missing or unknown source IDs");
  }

  const summary = dedupeSummaryText(output.summary);
  const evidenceLength = articles.reduce((sum, article) => sum + article.title.length + article.excerpt.length, 0);
  const minimumLength = Math.min(80, Math.max(12, Math.floor(evidenceLength * 0.4)));
  if (summary.length < minimumLength) throw new Error("AI summary is too short after claim deduplication");
  const keyPoints = dedupeClaims(output.keyPoints, 0.74).slice(0, 5);
  if (!keyPoints.length) throw new Error("AI summary has no distinct source-backed key points");

  return {
    title: output.title.replace(/\s+/g, " ").trim(),
    summary,
    keyPoints,
    sourceIds,
  };
}

export function summaryQualityScore(summary: Pick<ClusterSummary, "summary" | "keyPoints" | "sourceIds">): number {
  const uniqueSentences = dedupeClaims(sentences(summary.summary), 0.78);
  const wordCount = summary.summary.trim().split(/\s+/).filter(Boolean).length;
  const repetitionPenalty = Math.max(0, sentences(summary.summary).length - uniqueSentences.length) * 8;
  const technicalPenalty = /chưa được xử lý|metadata nguồn|tôi là ai|không thể tóm tắt/i.test(summary.summary) ? 35 : 0;
  return Math.max(0, Math.min(100,
    Math.min(45, wordCount / 4)
      + Math.min(25, dedupeClaims(summary.keyPoints).length * 5)
      + Math.min(20, new Set(summary.sourceIds).size * 5)
      + 10
      - repetitionPenalty
      - technicalPenalty,
  ));
}

export type PreviousClusterSummary = {
  aiGenerated: boolean;
  title: string;
  summary: string;
  keyPoints: string[];
  sourceIds: string[];
};

export function selectClusterSummary(input: {
  remote: ClusterSummary | null;
  heuristic: ClusterSummary;
  previous?: PreviousClusterSummary | null;
  articles: ClusterArticleInput[];
}): { summary: ClusterSummary; origin: "remote" | "previous" | "heuristic" } {
  if (input.remote) return { summary: sanitizeClusterSummary(input.remote, input.articles), origin: "remote" };
  const allowed = new Set(input.articles.map((article) => article.id));
  const previousIds = input.previous?.sourceIds.filter((id) => allowed.has(id)) ?? [];
  if (input.previous?.aiGenerated && input.previous.summary.trim() && previousIds.length) {
    const previous = {
      title: input.previous.title,
      summary: input.previous.summary,
      keyPoints: dedupeClaims(input.previous.keyPoints).slice(0, 5).length ? dedupeClaims(input.previous.keyPoints).slice(0, 5) : [input.previous.title],
      sourceIds: previousIds,
    };
    if (summaryQualityScore(previous) >= 10) return { summary: previous, origin: "previous" };
  }
  return { summary: input.heuristic, origin: "heuristic" };
}
