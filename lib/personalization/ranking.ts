export type PersonalizationCandidate<T> = {
  value: T;
  id: string;
  publishedAt: string;
  hotness: number;
  reliability: number;
  entityIds: string[];
  sourceIds: string[];
  diversityKey: string;
};

export type PersonalizationSignals = {
  followedEntityIds: Set<string>;
  followedSourceIds: Set<string>;
  bookmarkedStoryIds: Set<string>;
  readStoryIds: Set<string>;
  readEntityIds: Set<string>;
  now?: number;
};

export type RankedPersonalization<T> = { value: T; score: number; reasons: string[] };

export function rankPersonalizedFeed<T>(candidates: PersonalizationCandidate<T>[], signals: PersonalizationSignals): RankedPersonalization<T>[] {
  const now = signals.now ?? Date.now();
  const scored = candidates.map((candidate) => {
    const ageHours = Math.max(0, (now - Date.parse(candidate.publishedAt)) / 3_600_000);
    const freshness = Math.max(0, 25 - ageHours / 2);
    const entityMatches = candidate.entityIds.filter((id) => signals.followedEntityIds.has(id));
    const sourceMatches = candidate.sourceIds.filter((id) => signals.followedSourceIds.has(id));
    const learnedMatches = candidate.entityIds.filter((id) => signals.readEntityIds.has(id));
    const reasons: string[] = [];
    if (entityMatches.length) reasons.push("Khớp đội, giải hoặc chủ đề bạn theo dõi");
    if (sourceMatches.length) reasons.push("Đến từ nguồn bạn theo dõi");
    if (learnedMatches.length && !entityMatches.length) reasons.push("Liên quan nội dung bạn từng đọc");
    if (candidate.hotness >= 70) reasons.push("Đang được nhiều nguồn quan tâm");
    if (candidate.reliability >= 75) reasons.push("Có độ tin cậy nguồn cao");
    if (freshness >= 18) reasons.push("Mới được cập nhật");
    if (!reasons.length) reasons.push("Được xếp theo độ mới, độ nóng và độ tin cậy");
    const score = candidate.hotness * 0.45 + candidate.reliability * 0.25 + freshness + Math.min(60, entityMatches.length * 40) + Math.min(30, sourceMatches.length * 25) + Math.min(18, learnedMatches.length * 9) + (signals.bookmarkedStoryIds.has(candidate.id) ? 12 : 0) - (signals.readStoryIds.has(candidate.id) ? 16 : 0);
    return { ...candidate, baseScore: score, reasons: reasons.slice(0, 3) };
  }).sort((left, right) => right.baseScore - left.baseScore);

  const selected: typeof scored = []; const remaining = [...scored]; const diversityCounts = new Map<string, number>();
  while (remaining.length) {
    let bestIndex = 0; let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]; const diversityPenalty = (diversityCounts.get(candidate.diversityKey) ?? 0) * 14; const adjusted = candidate.baseScore - diversityPenalty;
      if (adjusted > bestScore) { bestScore = adjusted; bestIndex = index; }
    }
    const [best] = remaining.splice(bestIndex, 1); selected.push({ ...best, baseScore: bestScore }); diversityCounts.set(best.diversityKey, (diversityCounts.get(best.diversityKey) ?? 0) + 1);
  }
  return selected.map((candidate) => ({ value: candidate.value, score: Math.round(candidate.baseScore * 10) / 10, reasons: candidate.reasons }));
}
