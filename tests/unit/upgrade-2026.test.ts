import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeClusterSummary } from "@/lib/ai/grounding";
import { publicPageCacheControl } from "@/lib/cache/public-page";
import { buildOperationalAlerts, type HealthSnapshot } from "@/lib/health";
import { createStoryRepository } from "@/lib/stories/repository";
import { buildStoryBreadcrumbJsonLd } from "@/lib/stories/seo";
import { selectLongArticleEvidence } from "@/lib/stories/processor";
import { buildSearchSuggestions } from "@/lib/search/suggestions";
import { buildNewsRssFeed } from "@/lib/rss/feed";
import { makeAggregatedNews } from "../fixtures/story-news";

test("ranked search suggestions are grouped, deduplicated and bounded", () => {
  const suggestions = buildSearchSuggestions({
    query: "kinh tế",
    categories: [{ label: "Kinh tế", slug: "kinh-te" }],
    sources: [{ name: "VOV" }],
    newsTitles: ["Thị trường tăng điểm", "Thị trường tăng điểm"],
  });
  assert.deepEqual(suggestions.map((item) => item.type), ["source", "query"]);
});

test("operations alerts distinguish current incidents from historical failures", () => {
  const metrics: NonNullable<HealthSnapshot["metrics"]> = {
    latestArticleAgeMinutes: 180,
    latestStoryAgeMinutes: 20,
    queue: {
      pending: 300,
      processing: 1,
      failed: 2,
      deadLetter: 9,
      currentFailures: 2,
      historicalFailures: 9,
      longestPendingAgeMinutes: 80,
    },
    sources: { active: 20, erroring: 2, stale: 1 },
    aiBacklog: 260,
    lastSuccessfulAiProvider: "gemini",
    successRate1h: 0.5,
    failureRate1h: 0.5,
    successRate24h: 0.9,
    failureRate24h: 0.1,
    noNewArticlesWarning: true,
  };
  const alerts = buildOperationalAlerts(metrics);
  assert.ok(alerts.some((item) => item.scope === "current" && item.severity === "critical"));
  assert.ok(alerts.some((item) => item.code === "HISTORICAL_FAILURES" && item.scope === "historical"));
});

test("AI grounding creates citations and rejects invented high-risk numbers", () => {
  const articles = [{
    id: "source-1",
    title: "Thành phố mở tuyến metro mới",
    excerpt: "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay sau thời gian chạy thử.",
  }];
  const grounded = sanitizeClusterSummary({
    title: "Thành phố mở tuyến metro mới",
    summary: "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay sau thời gian chạy thử.",
    keyPoints: ["Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay."],
    sourceIds: ["source-1"],
  }, articles);
  assert.ok(grounded.citations?.length);
  assert.throws(() => sanitizeClusterSummary({
    title: "Thành phố mở tuyến metro mới",
    summary: "Tuyến metro mới phục vụ 999.999 hành khách từ sáng nay sau thời gian chạy thử.",
    keyPoints: ["Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay."],
    sourceIds: ["source-1"],
  }, articles), /not grounded/);
});

test("long article evidence samples the beginning, middle and ending", () => {
  const words = Array.from({ length: 1_400 }, (_, index) => `word${index}`);
  const sampled = selectLongArticleEvidence(words.join(" "), 700).split(" ");
  assert.equal(sampled.length, 700);
  assert.equal(sampled[0], "word0");
  assert.ok(sampled.includes("word700"));
  assert.equal(sampled.at(-1), "word1399");
});

test("public HTML cache excludes authenticated and private routes", () => {
  const html = new Response("<html></html>", { headers: { "content-type": "text/html" } });
  assert.match(publicPageCacheControl(new Request("https://newspeek.example/news"), html) ?? "", /s-maxage=90/);
  assert.equal(publicPageCacheControl(new Request("https://newspeek.example/settings"), html), null);
  assert.equal(publicPageCacheControl(new Request("https://newspeek.example/news", { headers: { cookie: "session=1" } }), html), null);
});

test("RSS and BreadcrumbList expose canonical story URLs", async () => {
  const result = await createStoryRepository(
    async () => makeAggregatedNews(),
    { provider: "aggregated-rss" },
  ).getStoryFeed();
  const story = result.data?.[0];
  assert.ok(story);
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://newspeek.example";
  try {
    const rss = buildNewsRssFeed({
      title: "NewsPeek",
      description: "Tin mới",
      path: "/rss",
      stories: [story],
    });
    assert.match(rss, /<rss version="2\.0"/);
    assert.match(rss, new RegExp(story.slug));
    const breadcrumbs = buildStoryBreadcrumbJsonLd(story, new URL("https://newspeek.example"));
    assert.equal(breadcrumbs["@type"], "BreadcrumbList");
    assert.equal((breadcrumbs.itemListElement as unknown[]).length, 3);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
  }
});
