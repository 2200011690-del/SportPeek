import assert from "node:assert/strict";
import test from "node:test";
import { createPersistedStoryRepository, refreshStoryHotness } from "../../lib/stories/persisted-repository";
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

test("old stories remain addressable outside the latest feed and archive is paginated", async () => {
  const source = await createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" }).getStoryFeed();
  assert.equal(source.data?.length, 2);
  const [oldStory, recentStory] = source.data;
  const repository = createPersistedStoryRepository(
    async () => ({ stories: [recentStory], lastSyncAt: new Date().toISOString(), sources: recentStory.sourceNames, aiStatus: { provider: "off", state: "off", translatedCount: 0 } }),
    {
      findBySlug: async (slug) => slug === oldStory.slug ? oldStory : null,
      findById: async (id) => id === oldStory.id ? oldStory : null,
      readArchive: async (page, pageSize) => ({ stories: page === 1 ? [recentStory] : [oldStory], page, pageSize, total: 2, totalPages: 2 }),
    },
  );
  const detail = await repository.getStoryBySlug(oldStory.slug);
  const archive = await repository.getStoryArchive(2, 1);
  assert.equal(detail.status, "success");
  assert.equal(detail.data?.story.id, oldStory.id);
  assert.equal(archive.data?.stories[0].id, oldStory.id);
  assert.equal(archive.data?.totalPages, 2);
});

test("latest feed sorts by material updates and ignores later duplicate-source observations", async () => {
  const source = await createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" }).getStoryFeed();
  assert.equal(source.data?.length, 2);
  const [first, second] = source.data;
  const sourceRepeatedLater = {
    ...first,
    firstPublishedAt: "2026-07-14T08:00:00.000Z",
    lastMaterialUpdateAt: "2026-07-14T08:05:00.000Z",
    lastSourceSeenAt: "2026-07-14T12:00:00.000Z",
  };
  const materiallyUpdated = {
    ...second,
    firstPublishedAt: "2026-07-14T07:00:00.000Z",
    lastMaterialUpdateAt: "2026-07-14T09:00:00.000Z",
    lastSourceSeenAt: "2026-07-14T09:00:00.000Z",
  };
  const repository = createPersistedStoryRepository(async () => ({
    stories: [sourceRepeatedLater, materiallyUpdated],
    lastSyncAt: new Date().toISOString(),
    sources: [],
    aiStatus: { provider: "off", state: "off", translatedCount: 0 },
  }));

  const feed = await repository.getLatestStories();

  assert.deepEqual(feed.data?.map((story) => story.id), [materiallyUpdated.id, sourceRepeatedLater.id]);
});

test("persisted hotness decays at read time instead of remaining frozen", async () => {
  const source = await createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" }).getStoryFeed();
  assert.ok(source.data?.[0]);
  const story = {
    ...source.data[0],
    firstPublishedAt: "2026-07-17T08:00:00.000Z",
    lastMaterialUpdateAt: "2026-07-17T08:00:00.000Z",
  };
  const fresh = refreshStoryHotness(story, Date.parse("2026-07-17T09:00:00.000Z"));
  const old = refreshStoryHotness(story, Date.parse("2026-07-19T09:00:00.000Z"));
  assert.ok((fresh.hotnessScore ?? 0) > (old.hotnessScore ?? 0));
});
