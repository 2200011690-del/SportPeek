export interface HotnessInput {
  ageHours: number;
  sourceCount: number;
  averageSourceReliability: number;
  entityPopularity: number;
  readVelocity: number;
  eventImportance: number;
  verified: boolean;
}

export function calculateHotness(input: HotnessInput): number {
  const freshness = Math.max(0, 100 - input.ageHours * 3);
  const sourceSignal = Math.min(100, input.sourceCount * 22);
  const score = freshness * 0.22 + sourceSignal * 0.16 + input.averageSourceReliability * 0.16 + input.entityPopularity * 0.12 + input.readVelocity * 0.14 + input.eventImportance * 0.2;
  const capped = !input.verified || input.sourceCount < 2 ? Math.min(score, 84) : score;
  return Math.round(Math.max(0, Math.min(100, capped)));
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
  const average = input.sourceScores.length ? input.sourceScores.reduce((sum, value) => sum + value, 0) / input.sourceScores.length : 0;
  const corroboration = Math.min(18, Math.max(0, input.independentSources - 1) * 6);
  const official = input.official ? 12 : 0;
  const speculation = input.speculativeLanguage ? 15 : 0;
  return Math.round(Math.max(0, Math.min(100, average * 0.72 + corroboration + official - speculation - (input.contradictionPenalty ?? 0))));
}

export function personalizationScore(followed: boolean, hotness: number, reliability: number, ageHours: number, diversityPenalty = 0): number {
  const recency = Math.max(0, 100 - ageHours * 2.5);
  return Math.round((followed ? 32 : 0) + hotness * 0.25 + reliability * 0.2 + recency * 0.23 - diversityPenalty);
}
