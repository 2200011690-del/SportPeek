import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RSS_SOURCES } from "../../lib/rss/sources";

test("default newsroom has broad, duplicate-free Vietnamese and international coverage", () => {
  assert.ok(DEFAULT_RSS_SOURCES.length >= 35);
  assert.equal(new Set(DEFAULT_RSS_SOURCES.map((source) => source.name)).size, DEFAULT_RSS_SOURCES.length);
  assert.equal(new Set(DEFAULT_RSS_SOURCES.map((source) => source.feedUrl)).size, DEFAULT_RSS_SOURCES.length);
  assert.ok(DEFAULT_RSS_SOURCES.filter((source) => source.language === "vi").length >= 10);
  assert.ok(DEFAULT_RSS_SOURCES.filter((source) => source.language === "en").length >= 20);
  for (const source of DEFAULT_RSS_SOURCES) {
    assert.equal(new URL(source.feedUrl).protocol, "https:");
    assert.ok(source.reliability >= 0 && source.reliability <= 100);
  }
});
