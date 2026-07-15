import assert from "node:assert/strict";
import test from "node:test";
import { fetchStoryDetail, mapStoryEnvelopeToState, requestStoryAISummary } from "../../lib/stories/client";
import { createStoryRepository } from "../../lib/stories/repository";
import { isSafeExternalUrl, rawArticleSchema, storyDetailEnvelopeSchema } from "../../lib/stories/schema";
import { createStorySlug, storySlugSchema } from "../../lib/stories/slug";
import { makeAggregatedNews, makeStoryNewsItem } from "../fixtures/story-news";

test("story slugs are stable, safe and independent of duplicate titles", () => {
  const first = createStorySlug("Cùng một tiêu đề", "rss-one-123");
  const second = createStorySlug("Cùng một tiêu đề", "rss-two-456");
  assert.equal(first, "story-one-123");
  assert.notEqual(first, second);
  assert.equal(createStorySlug("Tiêu đề đã đổi", "rss-one-123"), first);
  assert.equal(storySlugSchema.safeParse(first).success, true);
  assert.equal(storySlugSchema.safeParse("../bad slug").success, false);
});

test("article schema rejects unsafe source links", () => {
  const base = {
    id: "1", sourceId: "source", sourceName: "Source", sourceLogoUrl: null,
    originalUrl: "javascript:alert(1)", canonicalUrl: null, title: "Title", excerpt: null,
    imageUrl: null, author: null, publishedAt: "2026-07-14T08:00:00.000Z",
    fetchedAt: "2026-07-14T08:01:00.000Z", isOfficialSource: false,
    language: "vi", processingStatus: "completed",
  };
  assert.equal(rawArticleSchema.safeParse(base).success, false);
  assert.equal(isSafeExternalUrl("https://example.com/story"), true);
  assert.equal(isSafeExternalUrl("data:text/html,test"), false);
});

test("repository maps feed and detail from one source of truth with legacy slug support", async () => {
  let loadCalls = 0;
  const repository = createStoryRepository(async () => { loadCalls += 1; return makeAggregatedNews(); }, { provider: "aggregated-rss" });
  const feed = await repository.getStoryFeed();
  assert.equal(feed.status, "success");
  assert.equal(feed.data?.[0].slug, "story-alpha-001");
  const detail = await repository.getStoryBySlug("rss-alpha-001");
  assert.equal(detail.status, "success");
  assert.equal(detail.data?.story.id, feed.data?.[0].id);
  assert.equal(detail.meta.canonicalSlug, "story-alpha-001");
  assert.equal(detail.data?.story.officialSources.length, 1);
  assert.equal(detail.data?.relatedStories[0]?.id, "rss-alpha-002");
  assert.equal(loadCalls, 2, "each repository operation performs one bounded source read and no render-time AI call");
});

test("repository exposes stale, configuration and summary fallback states", async () => {
  const stale = createStoryRepository(async () => makeAggregatedNews({ stale: true, cached: true }), { provider: "aggregated-rss" });
  assert.equal((await stale.getStoryFeed()).status, "stale");
  const configuration = createStoryRepository(async () => makeAggregatedNews(), { provider: "off" });
  assert.equal((await configuration.getStoryFeed()).status, "configuration_required");
  const missingSummary = makeStoryNewsItem({ summary: "   ", readingBody: ["Nội dung dự phòng có nguồn."] });
  const fallback = createStoryRepository(async () => makeAggregatedNews({ data: [missingSummary] }), { provider: "aggregated-rss" });
  const result = await fallback.getStoryFeed();
  assert.equal(result.data?.[0].summary, "Nội dung dự phòng có nguồn.");
});

test("reader maps stale envelope and never retries 404", async () => {
  const repository = createStoryRepository(async () => makeAggregatedNews({ stale: true, cached: true }), { provider: "aggregated-rss" });
  const result = await repository.getStoryBySlug("story-alpha-001");
  const envelope = storyDetailEnvelopeSchema.parse({ status: result.status, data: result.data, meta: result.meta, error: null });
  assert.equal(mapStoryEnvelopeToState(envelope).status, "stale");
  let calls = 0;
  const state = await fetchStoryDetail("story-missing", {
    retries: 1,
    fetcher: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: "not_found", data: null, meta: { source: "aggregated-rss", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }), { status: 404, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(state.status, "not_found");
  assert.equal(calls, 1);
});

test("reader timeout is finite and retries at most once", async () => {
  let calls = 0;
  const state = await fetchStoryDetail("story-alpha-001", {
    timeoutMs: 10,
    retries: 1,
    fetcher: async (_url, init) => {
      calls += 1;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); });
      });
      return new Response();
    },
  });
  assert.equal(state.status, "error");
  assert.match(state.message, /Quá thời gian/);
  assert.equal(calls, 2);
});

test("reader accepts an on-demand AI summary returned by the story endpoint", async () => {
  const repository = createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" });
  const detail = await repository.getStoryBySlug("story-alpha-001");
  assert.ok(detail.data);
  const story = detail.data.story;
  const updated = await requestStoryAISummary(story.slug, {
    fetcher: async () => new Response(JSON.stringify({ status: "success", data: { story: { ...story, aiGenerated: true } } }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal(updated?.id, story.id);
  assert.equal(updated?.aiGenerated, true);
});
