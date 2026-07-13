import assert from "node:assert/strict";
import test from "node:test";
import { calculateHotness, calculateReliability, hotnessLabel, personalizationScore } from "../../lib/scoring/index";

test("hotness caps unverified stories below breaking", () => { const score = calculateHotness({ ageHours: 0, sourceCount: 5, averageSourceReliability: 100, entityPopularity: 100, readVelocity: 100, eventImportance: 100, verified: false }); assert.equal(score, 84); assert.equal(hotnessLabel(score), "Rất nóng"); });
test("verified multi-source story can become breaking", () => { const score = calculateHotness({ ageHours: 0, sourceCount: 5, averageSourceReliability: 100, entityPopularity: 100, readVelocity: 100, eventImportance: 100, verified: true }); assert.ok(score >= 85); });
test("reliability rewards official corroborated sources", () => { const strong = calculateReliability({ sourceScores: [90, 92], independentSources: 2, official: true, speculativeLanguage: false }); const rumor = calculateReliability({ sourceScores: [60], independentSources: 1, official: false, speculativeLanguage: true }); assert.ok(strong > rumor); assert.ok(strong <= 100); });
test("personalization rewards followed entities but applies diversity penalty", () => { assert.ok(personalizationScore(true, 70, 90, 1) > personalizationScore(false, 70, 90, 1)); assert.ok(personalizationScore(true, 70, 90, 1, 20) < personalizationScore(true, 70, 90, 1)); });
