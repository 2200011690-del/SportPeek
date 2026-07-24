import assert from "node:assert/strict";
import test from "node:test";
import { createStoryRepository } from "../../lib/stories/repository";
import { buildNewsArticleJsonLd, buildStoryMetadata, serializeJsonLd } from "../../lib/stories/seo";
import { makeAggregatedNews } from "../fixtures/story-news";

test("story SEO uses canonical slug and material timestamps", async () => {
  const result = await createStoryRepository(async () => makeAggregatedNews(), { provider: "aggregated-rss" }).getStoryFeed();
  assert.ok(result.data?.[0]);
  const story = {
    ...result.data[0],
    firstPublishedAt: "2026-07-14T08:00:00.000Z",
    lastMaterialUpdateAt: "2026-07-14T09:30:00.000Z",
    lastSourceSeenAt: "2026-07-14T12:00:00.000Z",
  };
  const base = new URL("https://sportpeek.example/");

  const metadata = buildStoryMetadata(story, base);
  const jsonLd = buildNewsArticleJsonLd(story, base);

  assert.equal(metadata.alternates?.canonical, `https://sportpeek.example/news/${story.slug}`);
  assert.equal((metadata.openGraph as { type?: string } | undefined)?.type, "article");
  assert.equal(jsonLd.datePublished, story.firstPublishedAt);
  assert.equal(jsonLd.dateModified, story.lastMaterialUpdateAt);
  assert.deepEqual(jsonLd.citation, story.articles.map((article) => article.canonicalUrl ?? article.originalUrl));
});

test("JSON-LD serialization cannot terminate its script element", () => {
  assert.equal(serializeJsonLd({ headline: "</script><script>alert(1)</script>" }).includes("</script>"), false);
});
