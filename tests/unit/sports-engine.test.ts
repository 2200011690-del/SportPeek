import assert from "node:assert/strict";
import test from "node:test";
import { matchEntity, normalizeEntityName, sameMatch } from "../../lib/sports-data/matching";
import { normalizedMatchSchema } from "../../lib/sports-data/models";
import { resolveProvider } from "../../lib/sports-data/resolver";
import { deriveMatchCapabilities } from "../../lib/sports-data/capabilities";

test("entity matching prefers persisted mapping and exact aliases", () => {
  const candidates = [{ id: "team-1", name: "Ho Chi Minh City FC", country: "Vietnam", aliases: ["TP.HCM", "HCMC FC"] }];
  assert.equal(normalizeEntityName("Hồ Chí Minh City FC"), "ho chi minh city");
  assert.deepEqual(matchEntity({ name: "TP.HCM" }, candidates), { id: "team-1", confidence: 0.98, reason: "alias" });
  assert.equal(matchEntity({ name: "Unknown" }, candidates, "mapped-id").id, "mapped-id");
});

test("match dedupe respects teams, season and kickoff tolerance", () => {
  const base = normalizedMatchSchema.parse({ provider: "football-data", externalId: "1", fetchedAt: "2026-07-14T00:00:00.000Z", sourceTimestamp: "2026-07-14T00:00:00.000Z", dataFreshness: "fresh", rawMetadata: {}, competitionExternalId: "PL", season: "2026", homeTeamExternalId: "A", awayTeamExternalId: "B", kickoffAt: "2026-08-15T14:00:00.000Z", status: "scheduled", minute: null, homeScore: null, awayScore: null, venue: null, referee: null, round: null, stage: null, matchday: 1 });
  assert.equal(sameMatch(base, { ...base, externalId: "other", kickoffAt: "2026-08-15T14:20:00.000Z" }), true);
  assert.equal(sameMatch(base, { ...base, externalId: "other", awayTeamExternalId: "C" }), false);
  assert.equal(sameMatch(base, { ...base, externalId: "other", kickoffAt: "2026-08-15T15:00:00.000Z" }), false);
});

test("provider resolver uses fresh cache, fallback, stale cache then unavailable", () => {
  const config = { primary: "football-data" as const, fallbacks: ["api-football" as const], capability: "fixtures" as const };
  const now = Date.parse("2026-07-14T10:00:00.000Z");
  assert.equal(resolveProvider(config, { cacheUpdatedAt: "2026-07-14T09:59:00.000Z", cacheTtlSeconds: 300, enabledProviders: ["football-data"], now }).state, "cache");
  assert.equal(resolveProvider(config, { enabledProviders: ["api-football"], failedProviders: ["football-data"], now }).provider, "api-football");
  assert.equal(resolveProvider(config, { cacheUpdatedAt: "2026-07-13T00:00:00.000Z", enabledProviders: [], now }).state, "stale");
  assert.equal(resolveProvider(null, { enabledProviders: [], now }).state, "unavailable");
});

test("match center exposes only sections backed by persisted data", () => {
  const empty = deriveMatchCapabilities({ status: "scheduled", venue: null, referee: null, eventCount: 0, statisticCount: 0, standings: [] });
  assert.equal(empty.score, false); assert.equal(empty.events, false); assert.equal(empty.lineups, false); assert.equal(empty.statistics, false); assert.equal(empty.standings, false);
  const available = deriveMatchCapabilities({ status: "finished", venue: "National Stadium", referee: "Referee", eventCount: 4, statisticCount: 2, standings: [{ position: 1, team: "A", played: 1, won: 1, drawn: 0, lost: 0, goalDifference: 2, points: 3, form: ["W"] }] });
  assert.equal(available.score, true); assert.equal(available.venue, true); assert.equal(available.referee, true); assert.equal(available.events, true); assert.equal(available.statistics, true); assert.equal(available.standings, true); assert.equal(available.form, true); assert.equal(available.lineups, false);
});
