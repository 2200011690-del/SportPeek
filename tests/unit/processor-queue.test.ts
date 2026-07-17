import assert from "node:assert/strict";
import test from "node:test";
import { aiRetryDelayMs, selectIndependentSummaryInput } from "../../lib/stories/processor";
import type { ClusterableArticle } from "../../lib/stories/clustering";

function article(index: number, overrides: Partial<ClusterableArticle> = {}): ClusterableArticle {
  return {
    id: `article-${index}`,
    sourceId: `source-${index}`,
    sourceName: `Publisher ${index}`,
    title: `Distinct football update ${index}`,
    excerpt: `Source-backed details for event ${index}.`,
    publishedAt: new Date(Date.UTC(2026, 6, 17, 10, index)).toISOString(),
    ...overrides,
  };
}

test("AI prompt input excludes syndicated copies and caps independent sources", () => {
  const articles = Array.from({ length: 10 }, (_, index) => article(index));
  articles.splice(1, 0, article(99, {
    id: "syndicated-copy",
    sourceId: "copy-publisher",
    isSyndicated: true,
  }));
  const selected = selectIndependentSummaryInput(articles);
  assert.equal(selected.length, 8);
  assert.equal(selected.some((item) => item.id === "syndicated-copy"), false);
  assert.equal(new Set(selected.map((item) => item.sourceName)).size, 8);
});

test("AI retry delay backs off from five minutes to one day", () => {
  assert.equal(aiRetryDelayMs(1), 5 * 60_000);
  assert.equal(aiRetryDelayMs(2), 30 * 60_000);
  assert.equal(aiRetryDelayMs(3), 2 * 3_600_000);
  assert.equal(aiRetryDelayMs(4), 12 * 3_600_000);
  assert.equal(aiRetryDelayMs(99), 24 * 3_600_000);
});
