export interface HotnessInput {
  ageHours: number;
  sourceCount: number;
  averageSourceReliability: number;
  entityPopularity?: number;
  readVelocity?: number;
  eventImportance?: number;
  verified: boolean;
  halfLifeHours?: number;
}

function metric(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value as number)) : 0;
}

export function freshnessScore(ageHours: number, halfLifeHours = 8): number {
  const age = Number.isFinite(ageHours) ? Math.max(0, ageHours) : Number.POSITIVE_INFINITY;
  const halfLife = Number.isFinite(halfLifeHours) ? Math.max(0.5, halfLifeHours) : 8;
  return age === Number.POSITIVE_INFINITY ? 0 : 100 * 2 ** (-age / halfLife);
}

export function calculateHotness(input: HotnessInput): number {
  const freshness = freshnessScore(input.ageHours, input.halfLifeHours);
  // Diminishing returns prevent ten copies of one story dominating two truly
  // independent confirmations. Caller must pass independent source count.
  const sourceSignal = Math.min(100, 100 * (1 - Math.exp(-Math.max(0, input.sourceCount - 1) / 1.8)));
  const score = freshness * 0.3
    + sourceSignal * 0.17
    + metric(input.averageSourceReliability) * 0.18
    + metric(input.entityPopularity) * 0.08
    + metric(input.readVelocity) * 0.09
    + metric(input.eventImportance) * 0.18;
  const capped = !input.verified || input.sourceCount < 2 ? Math.min(score, 84) : score;
  return Math.round(Math.max(0, Math.min(100, capped)));
}

export interface DynamicHotnessInput extends Omit<HotnessInput, "ageHours"> {
  publishedAt: string;
  lastMaterialUpdateAt?: string | null;
  now?: string | number | Date;
}

/** Recomputes decay at read time instead of trusting a permanently stored score. */
export function dynamicStoryHotness(input: DynamicHotnessInput): number {
  const now = input.now instanceof Date ? input.now.getTime() : typeof input.now === "number" ? input.now : Date.parse(input.now ?? new Date().toISOString());
  const reference = Date.parse(input.lastMaterialUpdateAt || input.publishedAt);
  const ageHours = Number.isFinite(now) && Number.isFinite(reference) ? Math.max(0, (now - reference) / 3_600_000) : Number.POSITIVE_INFINITY;
  return calculateHotness({ ...input, ageHours });
}

export function eventHalfLifeHours(eventType: string): number {
  switch (eventType) {
    case "lineup": return 2;
    case "preview": return 4;
    case "result": return 8;
    case "transfer": return 12;
    case "injury":
    case "recovery": return 18;
    case "quote": return 24;
    case "correction": return 36;
    default: return 10;
  }
}

export function deriveEventImportance(text: string, eventType: string, official = false): number {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const base: Record<string, number> = { result: 52, transfer: 42, injury: 40, recovery: 32, preview: 28, lineup: 34, quote: 24, correction: 45, news: 30 };
  let score = base[eventType] ?? 30;
  if (/\b(world cup|champions league|euro|copa america|chung ket|ban ket|vo dich|final|title)\b/.test(normalized)) score += 22;
  if (/\b(ky luc|record|sa thai|sacked|resigns?|tu chuc|confirmed|xac nhan)\b/.test(normalized)) score += 12;
  if (/\b(truc tiep|live|breaking|khan)\b/.test(normalized)) score += 8;
  if (official) score += 8;
  return metric(score);
}

export function hotnessLabel(score: number): string {
  if (score >= 85) return "Tin khẩn";
  if (score >= 70) return "Rất nóng";
  if (score >= 50) return "Đang nóng";
  if (score >= 30) return "Đáng chú ý";
  return "Bình thường";
}

export interface ReliabilityInput {
  sourceScores: number[];
  independentSources: number;
  contradictionPenalty?: number;
  official: boolean;
  speculativeLanguage: boolean;
}

export function calculateReliability(input: ReliabilityInput): number {
  const validScores = input.sourceScores.filter(Number.isFinite).map(metric);
  const average = validScores.length ? validScores.reduce((sum, value) => sum + value, 0) / validScores.length : 0;
  const corroboration = Math.min(18, Math.max(0, input.independentSources - 1) * 6);
  const official = input.official ? 12 : 0;
  const speculation = input.speculativeLanguage ? 15 : 0;
  return Math.round(Math.max(0, Math.min(100, average * 0.72 + corroboration + official - speculation - metric(input.contradictionPenalty))));
}

export function personalizationScore(followed: boolean, hotness: number, reliability: number, ageHours: number, diversityPenalty = 0): number {
  const recency = freshnessScore(ageHours, 12);
  return Math.round((followed ? 32 : 0) + metric(hotness) * 0.25 + metric(reliability) * 0.2 + recency * 0.23 - Math.max(0, diversityPenalty));
}

export interface DiversityRerankOptions<T> {
  score: (item: T) => number;
  entities: (item: T) => string[];
  competition?: (item: T) => string | null | undefined;
  publishers?: (item: T) => string[];
  limit?: number;
  maxPerEntity?: number;
  maxPerCompetition?: number;
  maxPerPublisher?: number;
  excessPenalty?: number;
}

export type DiversityRankedItem<T> = { item: T; score: number; diversityPenalty: number };

/** Greedy, deterministic reranker for a small feed window (for example top 20). */
export function rerankWithDiversity<T>(items: T[], options: DiversityRerankOptions<T>): DiversityRankedItem<T>[] {
  const remaining = items.map((item, index) => ({ item, index }));
  const selected: DiversityRankedItem<T>[] = [];
  const entityCounts = new Map<string, number>();
  const competitionCounts = new Map<string, number>();
  const publisherCounts = new Map<string, number>();
  const limit = Math.min(items.length, Math.max(0, options.limit ?? items.length));
  const perEntity = Math.max(1, options.maxPerEntity ?? 2);
  const perCompetition = Math.max(1, options.maxPerCompetition ?? 3);
  const perPublisher = Math.max(1, options.maxPerPublisher ?? 2);
  const excessPenalty = Math.max(0, options.excessPenalty ?? 18);

  const count = (map: Map<string, number>, key: string) => map.get(key.toLowerCase()) ?? 0;
  const increment = (map: Map<string, number>, keys: string[]) => keys.forEach((key) => { const normalized = key.toLowerCase(); map.set(normalized, (map.get(normalized) ?? 0) + 1); });

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestAdjusted = Number.NEGATIVE_INFINITY;
    let bestPenalty = 0;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const entities = [...new Set(options.entities(candidate.item).filter(Boolean))];
      const competition = options.competition?.(candidate.item) || null;
      const publishers = [...new Set(options.publishers?.(candidate.item).filter(Boolean) ?? [])];
      const entityExcess = entities.reduce((sum, entity) => sum + Math.max(0, count(entityCounts, entity) - perEntity + 1), 0);
      const competitionExcess = competition ? Math.max(0, count(competitionCounts, competition) - perCompetition + 1) : 0;
      const publisherExcess = publishers.reduce((sum, publisher) => sum + Math.max(0, count(publisherCounts, publisher) - perPublisher + 1), 0);
      const penalty = (entityExcess + competitionExcess + publisherExcess) * excessPenalty;
      const adjusted = metric(options.score(candidate.item)) - penalty;
      if (adjusted > bestAdjusted || (adjusted === bestAdjusted && candidate.index < remaining[bestIndex].index)) {
        bestIndex = index; bestAdjusted = adjusted; bestPenalty = penalty;
      }
    }
    const [winner] = remaining.splice(bestIndex, 1);
    const entities = [...new Set(options.entities(winner.item).filter(Boolean))];
    const competition = options.competition?.(winner.item) || null;
    const publishers = [...new Set(options.publishers?.(winner.item).filter(Boolean) ?? [])];
    increment(entityCounts, entities);
    if (competition) increment(competitionCounts, [competition]);
    increment(publisherCounts, publishers);
    selected.push({ item: winner.item, score: Math.round(bestAdjusted), diversityPenalty: bestPenalty });
  }
  return selected;
}
