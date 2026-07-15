import assert from "node:assert/strict";
import test from "node:test";
import { createPersistedStoryRepository } from "../../lib/stories/persisted-repository";
import { createStoryRepository } from "../../lib/stories/repository";
import { makeAggregatedNews } from "../fixtures/story-news";

test("persisted story reads never invoke RSS or AI providers", async () => {
  let readCount = 0;
  const source = await createStoryRepository(async () => ({ data: [], sources: [], aiTranslation: false, aiStatus: { provider: "off", state: "off", translatedCount: 0 }, cached: true, stale: false, lastUpdatedAt: "2026-07-14T10:00:00.000Z" })).getStoryFeed();
  const repository = createPersistedStoryRepository(async () => { readCount += 1; return { stories: source.data ?? [], lastSyncAt: new Date().toISOString(), sources: [], aiStatus: { provider: "off", state: "off", translatedCount: 0 } }; });
  const feed = await repository.getStoryFeed();
  assert.equal(feed.status, "empty"); assert.equal(readCount, 1); assert.equal(feed.meta.source, "supabase");
});

test("persisted repository restores source language overwritten by legacy AI jobs", async () => {
  const source = await createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" }).getStoryFeed();
  assert.ok(source.data?.[0]);
  const damaged = { ...source.data[0], language: "vi" as const, aiGenerated: true };
  const repository = createPersistedStoryRepository(async () => ({ stories: [damaged], lastSyncAt: new Date().toISOString(), sources: damaged.sourceNames, aiStatus: { provider: "gemini", state: "ok", translatedCount: 1 } }));
  const feed = await repository.getStoryFeed();
  assert.equal(feed.data?.[0].language, "en");
});
