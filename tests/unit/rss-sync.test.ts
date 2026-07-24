import assert from "node:assert/strict";
import test from "node:test";
import {
  RSS_SOURCE_RETRIES,
  RSS_SOURCE_TIMEOUT_MS,
  RSS_SYNC_CONCURRENCY,
  prepareRssArticlesForPersistence,
  runConcurrentRssTasks,
  selectDueRssSources,
} from "../../lib/rss/sync";
import type { RssSource } from "../../lib/rss/types";

function rssSource(
  overrides: Partial<RssSource> & Pick<RssSource, "id" | "name">,
): RssSource {
  return {
    baseUrl: "https://example.com",
    feedUrl: `https://example.com/${overrides.id}.xml`,
    language: "vi",
    country: "VN",
    official: false,
    reliability: 90,
    active: true,
    defaultCategory: null,
    fetchIntervalMinutes: 10,
    lastFetchedAt: null,
    lastError: null,
    etag: null,
    lastModified: null,
    ...overrides,
  };
}

test("RSS scheduler selects never-fetched then oldest due sources instead of database name order", () => {
  const nowMs = Date.parse("2026-07-22T12:00:00.000Z");
  const selected = selectDueRssSources(
    [
      rssSource({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Alpha",
        lastFetchedAt: "2026-07-22T11:45:00.000Z",
      }),
      rssSource({
        id: "00000000-0000-4000-8000-000000000002",
        name: "Zulu",
        lastFetchedAt: null,
      }),
      rssSource({
        id: "00000000-0000-4000-8000-000000000003",
        name: "Bravo",
        lastFetchedAt: "2026-07-22T11:00:00.000Z",
      }),
      rssSource({
        id: "00000000-0000-4000-8000-000000000004",
        name: "Fresh",
        lastFetchedAt: "2026-07-22T11:55:00.000Z",
      }),
      rssSource({
        id: "00000000-0000-4000-8000-000000000005",
        name: "Inactive",
        active: false,
      }),
      rssSource({
        id: "00000000-0000-4000-8000-000000000006",
        name: "Never fetched second",
        lastFetchedAt: null,
      }),
    ],
    { maxSources: 3, nowMs },
  );

  assert.deepEqual(
    selected.map((source) => source.name),
    ["Zulu", "Never fetched second", "Bravo"],
  );
});

test("RSS scheduler keeps explicit source and force semantics", () => {
  const sources = [
    rssSource({
      id: "00000000-0000-4000-8000-000000000001",
      name: "First",
      lastFetchedAt: "2026-07-22T11:59:00.000Z",
    }),
    rssSource({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Second",
      lastFetchedAt: "2026-07-22T11:59:00.000Z",
    }),
  ];

  assert.deepEqual(
    selectDueRssSources(sources, {
      source: "second",
      force: true,
      nowMs: Date.parse("2026-07-22T12:00:00.000Z"),
    }).map((source) => source.name),
    ["Second"],
  );
});

test("six-source cron starts all RSS fetch tasks in one bounded wave", async () => {
  const sources = [1, 2, 3, 4, 5, 6];
  const started: number[] = [];
  const releases = new Map<number, () => void>();
  const pending = runConcurrentRssTasks(sources, async (source) => {
    started.push(source);
    await new Promise<void>((resolve) => releases.set(source, resolve));
    return source;
  });

  assert.deepEqual(started, sources);
  assert.ok(
    Math.ceil(sources.length / RSS_SYNC_CONCURRENCY) *
      RSS_SOURCE_TIMEOUT_MS *
      (RSS_SOURCE_RETRIES + 1) <
      50_000,
  );
  for (const release of releases.values()) release();
  assert.deepEqual(await pending, sources);
});

test("uniform category corruption is discarded only for mixed feeds", () => {
  const corrupted = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    rawMetadata: { categories: ["Y tế"] },
  }));
  const mixedFeed = prepareRssArticlesForPersistence(
    { defaultCategory: null },
    corrupted,
  );
  assert.ok(
    mixedFeed.every(
      (article) =>
        Array.isArray(article.rawMetadata.categories)
        && article.rawMetadata.categories.length === 0
        && article.rawMetadata.publisherCategoriesDiscarded === "Y tế",
    ),
  );

  const topicalFeed = prepareRssArticlesForPersistence(
    { defaultCategory: "Sức khỏe" },
    corrupted,
  );
  assert.ok(
    topicalFeed.every((article) =>
      Array.isArray(article.rawMetadata.categories)
      && article.rawMetadata.categories.includes("Sức khỏe")),
  );
});
