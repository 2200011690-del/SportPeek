import assert from "node:assert/strict";
import test from "node:test";
import { rankPersonalizedFeed } from "../../lib/personalization/ranking";

const now = Date.parse("2026-07-14T12:00:00.000Z");
const candidate = (id: string, entity: string, diversityKey: string, hotness = 60) => ({ value: id, id, publishedAt: "2026-07-14T11:00:00.000Z", hotness, reliability: 75, entityIds: [entity], sourceIds: [], diversityKey });

test("personal feed explains followed entities and keeps topic diversity", () => {
  const ranked = rankPersonalizedFeed([
    candidate("story-a1", "team-a", "Team A", 90), candidate("story-a2", "team-a", "Team A", 85), candidate("story-b", "team-b", "Team B", 70),
  ], { followedEntityIds: new Set(["team-a", "team-b"]), followedSourceIds: new Set(), bookmarkedStoryIds: new Set(), readStoryIds: new Set(), readEntityIds: new Set(), now });
  assert.equal(ranked[0].value, "story-a1");
  assert.match(ranked[0].reasons.join(" "), /theo dõi/);
  assert.equal(ranked[1].value, "story-b");
});

test("personal feed uses sources, history, bookmark and read penalty without ML", () => {
  const candidates = [{ ...candidate("read", "team-a", "A"), sourceIds: ["source-a"] }, { ...candidate("fresh", "team-a", "B"), sourceIds: ["source-a"] }];
  const ranked = rankPersonalizedFeed(candidates, { followedEntityIds: new Set(), followedSourceIds: new Set(["source-a"]), bookmarkedStoryIds: new Set(["fresh"]), readStoryIds: new Set(["read"]), readEntityIds: new Set(["team-a"]), now });
  assert.equal(ranked[0].value, "fresh");
  assert.match(ranked[0].reasons.join(" "), /nguồn bạn theo dõi|từng đọc/);
});
