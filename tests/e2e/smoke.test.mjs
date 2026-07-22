import assert from "node:assert/strict";
import test from "node:test";
const base = process.env.E2E_BASE_URL;
test("NewsPeek critical routes render", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => { for (const route of ["/","/search","/news","/category/viet-nam","/category/the-gioi","/category/cong-nghe","/settings","/bookmarks","/login","/for-you","/sources","/admin"]) { const response=await fetch(`${base}${route}`); assert.equal(response.status,200,route); const html=await response.text(); assert.match(html,/NewsPeek|NEWSPEEK/i); } });

test("runtime search queries the current RSS feed", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const feedResponse = await fetch(`${base}/api/news`);
  assert.equal(feedResponse.status, 200);
  const feed = await feedResponse.json();
  assert.ok(Array.isArray(feed.data) && feed.data.length > 0);
  const expected = feed.data[0];
  const query = expected.title.split(/\s+/).find((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length >= 5) ?? expected.title;
  const searchResponse = await fetch(`${base}/api/search?${new URLSearchParams({ q: query, type: "news" })}`);
  assert.equal(searchResponse.status, 200);
  const result = await searchResponse.json();
  assert.ok(result.news.some((item) => item.id === expected.id), `search should find ${expected.id}`);
});

test("news API reports the real AI state", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const response = await fetch(`${base}/api/news`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(typeof payload.aiStatus?.provider === "string");
  assert.ok(["ok", "off", "error"].includes(payload.aiStatus?.state));
  assert.equal(payload.aiTranslation, payload.aiStatus.translatedCount > 0);
  if (payload.aiTranslation) assert.ok(payload.data.some((item) => item.translatedByAI));
});

test("public feed honors a bounded limit and ships hardened headers", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const response = await fetch(`${base}/api/news?limit=5`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.data.length > 0 && payload.data.length <= 5);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
});

test("robots advertises both standard and Google News sitemaps", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const response = await fetch(`${base}/robots.txt`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /\/sitemap\.xml/);
  assert.match(body, /\/sitemap-news/);
});

test("news API exposes publisher images and a richer reading body", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const response = await fetch(`${base}/api/news`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.data.some((item) => /^https:\/\//.test(item.imageUrl ?? "")), "at least one current RSS story should include a real image");
  assert.ok(payload.data.every((item) => Array.isArray(item.readingBody) && item.readingBody.length >= 2), "every story should include source-backed reading paragraphs");
  assert.ok(payload.data.every((item) => item.sourceDetails?.every((source) => source.excerpt)), "source comparison should include short excerpts");
});

test("feed story opens through the shared detail API", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const feedResponse = await fetch(`${base}/api/stories`);
  assert.equal(feedResponse.status, 200);
  const feed = await feedResponse.json();
  assert.ok(["success", "stale"].includes(feed.status));
  assert.ok(Array.isArray(feed.data) && feed.data.length > 0);
  const expected = feed.data[0];
  let detailResponse = await fetch(`${base}/api/stories/${expected.slug}`);
  assert.equal(detailResponse.status, 200);
  let detail = await detailResponse.json();
  for (let attempt = 0; attempt < 3 && detail.data.articleContents.some((article) => ["pending", "processing"].includes(article.status)); attempt += 1) {
    detailResponse = await fetch(`${base}/api/stories/${expected.slug}`);
    detail = await detailResponse.json();
  }
  assert.equal(detail.data.story.id, expected.id);
  assert.equal(detail.data.story.title, expected.title);
  assert.ok(detail.data.story.articles.length >= 1);
  assert.equal(detail.data.articleContents.length, detail.data.story.articles.length);
  assert.ok(detail.data.articleContents.every((article) => !["pending", "processing"].includes(article.status)));
  assert.ok(detail.data.story.articles.every((article) => /^https?:\/\//.test(article.originalUrl)));
  const pageResponse = await fetch(`${base}/news/${expected.slug}`);
  assert.equal(pageResponse.status, 200);
});

test("missing story returns a real 404 envelope", { skip: !base && "Set E2E_BASE_URL to a running NewsPeek instance" }, async () => {
  const response = await fetch(`${base}/api/stories/story-does-not-exist`);
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.status, "not_found");
  assert.equal(payload.data, null);
});
