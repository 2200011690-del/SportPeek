import assert from "node:assert/strict";
import test from "node:test";
const base = process.env.E2E_BASE_URL;
test("SportPeek critical routes render", { skip: !base && "Set E2E_BASE_URL to a running SportPeek instance" }, async () => { for (const route of ["/","/search","/news","/live","/fixtures","/results","/standings","/transfers","/settings","/bookmarks","/login","/for-you","/admin"]) { const response=await fetch(`${base}${route}`); assert.equal(response.status,200,route); const html=await response.text(); assert.match(html,/SportPeek|SPORTPEEK/i); } });

test("runtime search queries the current RSS feed", { skip: !base && "Set E2E_BASE_URL to a running SportPeek instance" }, async () => {
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

test("live API never returns scheduled fixtures", { skip: !base && "Set E2E_BASE_URL to a running SportPeek instance" }, async () => {
  const response = await fetch(`${base}/api/matches/live`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok((payload.data ?? []).every((match) => match.status === "live"));
});
