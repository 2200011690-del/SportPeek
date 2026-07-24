import assert from "node:assert/strict";
import test from "node:test";
import { calculateHotness, calculateReliability, deriveEventImportance, dynamicStoryHotness, hotnessLabel, personalizationScore, rerankWithDiversity } from "../../lib/scoring/index";

test("hotness caps unverified stories below breaking", () => { const score = calculateHotness({ ageHours: 0, sourceCount: 5, averageSourceReliability: 100, entityPopularity: 100, readVelocity: 100, eventImportance: 100, verified: false }); assert.equal(score, 84); assert.equal(hotnessLabel(score), "Rất nóng"); });
test("verified multi-source story can become breaking", () => { const score = calculateHotness({ ageHours: 0, sourceCount: 5, averageSourceReliability: 100, entityPopularity: 100, readVelocity: 100, eventImportance: 100, verified: true }); assert.ok(score >= 85); });
test("reliability rewards official corroborated sources", () => { const strong = calculateReliability({ sourceScores: [90, 92], independentSources: 2, official: true, speculativeLanguage: false }); const rumor = calculateReliability({ sourceScores: [60], independentSources: 1, official: false, speculativeLanguage: true }); assert.ok(strong > rumor); assert.ok(strong <= 100); });
test("personalization rewards followed entities but applies diversity penalty", () => { assert.ok(personalizationScore(true, 70, 90, 1) > personalizationScore(false, 70, 90, 1)); assert.ok(personalizationScore(true, 70, 90, 1, 20) < personalizationScore(true, 70, 90, 1)); });

test("dynamic hotness decays from the last material update", () => {
  const base = { publishedAt: "2026-07-14T00:00:00.000Z", sourceCount: 3, averageSourceReliability: 90, eventImportance: 70, verified: true, halfLifeHours: 8 };
  const fresh = dynamicStoryHotness({ ...base, now: "2026-07-14T01:00:00.000Z" });
  const stale = dynamicStoryHotness({ ...base, now: "2026-07-16T01:00:00.000Z" });
  assert.ok(fresh > stale);
});

test("event importance is evidence-derived rather than a fixed placeholder", () => {
  assert.ok(deriveEventImportance("Chung kết World Cup đã được xác nhận", "result", true) > deriveEventImportance("Tin bên lề", "quote", false));
});

test("diversity reranker prevents one entity monopolizing the first window", () => {
  const items = [
    { id: "a1", score: 100, teams: ["Arsenal"] },
    { id: "a2", score: 99, teams: ["Arsenal"] },
    { id: "a3", score: 98, teams: ["Arsenal"] },
    { id: "c1", score: 90, teams: ["Chelsea"] },
  ];
  const ranked = rerankWithDiversity(items, { score: (item) => item.score, entities: (item) => item.teams, maxPerEntity: 2 });
  assert.deepEqual(ranked.map(({ item }) => item.id), ["a1", "a2", "c1", "a3"]);
  assert.ok(ranked[3].diversityPenalty > 0);
});
