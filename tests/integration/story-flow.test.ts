import assert from "node:assert/strict";
import test from "node:test";
import { storyToNewsItem } from "../../lib/stories/presenter";
import { createStoryRepository } from "../../lib/stories/repository";
import { storyDetailEnvelopeSchema, storyFeedEnvelopeSchema } from "../../lib/stories/schema";
import { makeAggregatedNews } from "../fixtures/story-news";

test("feed card and detail endpoint resolve the same story and source articles", async () => {
  const repository = createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" });
  const feedResult = await repository.getStoryFeed();
  const feedEnvelope = storyFeedEnvelopeSchema.parse({ status: feedResult.status, data: feedResult.data, meta: feedResult.meta, error: null });
  const feedCard = storyToNewsItem(feedEnvelope.data[0]);
  const detailResult = await repository.getStoryBySlug(feedCard.slug);
  const detailEnvelope = storyDetailEnvelopeSchema.parse({ status: detailResult.status, data: detailResult.data, meta: detailResult.meta, error: null });
  assert.equal(detailEnvelope.data?.story.id, feedCard.id);
  assert.equal(detailEnvelope.data?.story.title, feedCard.title);
  assert.equal(detailEnvelope.data?.story.articles.length, 2);
  assert.ok(detailEnvelope.data?.story.articles.every((article) => article.originalUrl.startsWith("https://")));
});

test("invalid story routes return not_found rather than an empty success", async () => {
  const repository = createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" });
  const result = await repository.getStoryBySlug("story-does-not-exist");
  assert.equal(result.status, "not_found");
  assert.equal(result.data, null);
  assert.equal(result.error?.code, "STORY_NOT_FOUND");
});
