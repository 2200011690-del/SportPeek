import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeArticleUrl, parseRssXml, safeHttpUrl } from "../../lib/rss/parser";
import { persistRowsWithConflictIsolation, rssContentHash, selectPersistableRssArticles } from "../../lib/rss/sync";
import type { ParsedRssArticle } from "../../lib/rss/types";

function parsedArticle(overrides: Partial<ParsedRssArticle> = {}): ParsedRssArticle {
  return {
    externalId: "article-1",
    originalUrl: "https://example.com/article-1?ref=rss",
    canonicalUrl: "https://example.com/article-1",
    title: "Bản tin mới",
    normalizedTitle: "ban tin moi",
    excerpt: "Mô tả nguồn.",
    author: null,
    imageUrl: null,
    publishedAt: "2026-07-18T09:00:00.000Z",
    language: "vi",
    rawMetadata: {},
    fullContent: null,
    contentStatus: "source_only",
    contentSource: null,
    contentWordCount: 0,
    ...overrides,
  };
}

test("RSS 2.0 normalization keeps metadata only and rejects unsafe URLs", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[ Tin <b>thể thao</b> mới ]]></title><link>https://example.com/story?utm_source=rss&amp;id=7</link><guid>story-7</guid><description><![CDATA[<p>Mô tả ngắn.</p><script>bad()</script>]]></description><pubDate>Tue, 14 Jul 2026 09:00:00 GMT</pubDate><media:thumbnail url="https://example.com/image.jpg" /></item></channel></rss>`;
  const rows = parseRssXml(xml, { feedUrl: "https://example.com/rss", language: "vi" }, new Date("2026-07-14T10:00:00.000Z"));
  assert.equal(rows.length, 1); assert.equal(rows[0].title, "Tin thể thao mới"); assert.equal(rows[0].excerpt, "Mô tả ngắn."); assert.equal(rows[0].canonicalUrl, "https://example.com/story?id=7"); assert.equal(rows[0].imageUrl, "https://example.com/image.jpg");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
});

test("Atom normalization supports alternate links and stable source-scoped hashes", () => {
  const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:example,1</id><title>Transfer update</title><link rel="alternate" href="https://example.com/a"/><summary>Short source excerpt.</summary><updated>2026-07-14T09:00:00Z</updated></entry></feed>`;
  const article = parseRssXml(xml, { feedUrl: "https://example.com/atom", language: "en" })[0];
  assert.ok(article); assert.equal(article.originalUrl, "https://example.com/a");
  assert.equal(rssContentHash("source-a", article), rssContentHash("source-a", article));
  assert.notEqual(rssContentHash("source-a", article), rssContentHash("source-b", article));
  assert.equal(canonicalizeArticleUrl("https://example.com/a#section"), "https://example.com/a");
});

test("context-free RSS titles are rejected only when the source supplies no article context", () => {
  const xml = `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <item><title>Here’s the latest.</title><link>https://example.com/empty-generic</link><pubDate>Sat, 18 Jul 2026 09:00:00 GMT</pubDate></item>
    <item><title>Here’s the latest.</title><link>https://example.com/described-generic</link><description>The government published a detailed budget proposal for the next fiscal year.</description><pubDate>Sat, 18 Jul 2026 09:01:00 GMT</pubDate></item>
    <item><title>Live updates</title><link>https://example.com/content-generic</link><content:encoded><![CDATA[Officials confirmed that negotiations will resume on Monday after both delegations accepted the revised agenda.]]></content:encoded><pubDate>Sat, 18 Jul 2026 09:02:00 GMT</pubDate></item>
    <item><title>Quốc hội thông qua luật dữ liệu mới</title><link>https://example.com/meaningful-title</link><pubDate>Sat, 18 Jul 2026 09:03:00 GMT</pubDate></item>
  </channel></rss>`;
  const rows = parseRssXml(xml, { feedUrl: "https://example.com/rss", language: "en" }, new Date("2026-07-18T10:00:00.000Z"));

  assert.deepEqual(rows.map((row) => row.originalUrl), [
    "https://example.com/described-generic",
    "https://example.com/content-generic",
    "https://example.com/meaningful-title",
  ]);
  assert.match(rows[0].excerpt, /detailed budget proposal/);
  assert.match(rows[1].excerpt, /negotiations will resume/);
  assert.equal(rows[2].excerpt, "");
});

test("only publisher full-content fields are exposed as full article text", () => {
  const descriptionWords = Array.from({ length: 140 }, (_, index) => `mô-tả-${index}`).join(" ");
  const metadataOnly = parseRssXml(`<?xml version="1.0"?><rss><channel><item><title>Bài chỉ có mô tả</title><link>https://example.com/description</link><description><![CDATA[${descriptionWords}]]></description><pubDate>Sat, 18 Jul 2026 09:00:00 GMT</pubDate></item></channel></rss>`, { feedUrl: "https://example.com/rss", language: "vi" })[0];
  assert.equal(metadataOnly.contentStatus, "source_only");
  assert.equal(metadataOnly.fullContent, null);

  const firstParagraph = Array.from({ length: 70 }, (_, index) => `đoạn-một-${index}`).join(" ");
  const secondParagraph = Array.from({ length: 70 }, (_, index) => `đoạn-hai-${index}`).join(" ");
  const full = parseRssXml(`<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Bài có toàn văn</title><link>https://example.com/full</link><content:encoded><![CDATA[<p>${firstParagraph}</p><p>${secondParagraph}</p>]]></content:encoded><pubDate>Sat, 18 Jul 2026 09:00:00 GMT</pubDate></item></channel></rss>`, { feedUrl: "https://example.com/rss", language: "vi" })[0];
  assert.equal(full.contentStatus, "available");
  assert.equal(full.contentWordCount, 140);
  assert.ok(full.fullContent?.includes("\n\n"));
});

test("RSS parser rejects entity declarations", () => {
  assert.throws(() => parseRssXml(`<!DOCTYPE x [<!ENTITY y "bad">]><rss><channel /></rss>`, { feedUrl: "https://example.com/rss", language: "vi" }), /không được hỗ trợ/);
});

test("general-news ingestion keeps sports beyond football", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Wimbledon công bố lịch thi đấu mới</title><link>https://example.com/tennis</link><guid>tennis-1</guid><description>Giải quần vợt cập nhật lịch thi đấu.</description><pubDate>Tue, 14 Jul 2026 09:00:00 GMT</pubDate><category>Thể thao</category></item></channel></rss>`;
  const rows = parseRssXml(xml, { feedUrl: "https://example.com/rss", language: "vi" }, new Date("2026-07-14T10:00:00.000Z"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Wimbledon công bố lịch thi đấu mới");
});

test("global original and canonical URL duplicates are skipped without changing first-source attribution", () => {
  const duplicate = parsedArticle();
  const fresh = parsedArticle({
    externalId: "article-2",
    originalUrl: "https://example.com/article-2?ref=rss",
    canonicalUrl: "https://example.com/article-2",
    title: "Một sự kiện khác",
    normalizedTitle: "mot su kien khac",
  });
  const accepted = selectPersistableRssArticles(
    "source-b",
    [duplicate, fresh],
    [],
    [{ original_url: "https://example.com/article-1?utm_source=source-a", canonical_url: "https://example.com/article-1" }],
  );

  assert.deepEqual(accepted.map((article) => article.externalId), ["article-2"]);
  assert.equal(accepted[0].contentHash, rssContentHash("source-b", fresh));
});

test("source-scoped identifiers do not suppress a different publisher with a different URL", () => {
  const article = parsedArticle({ externalId: "shared-guid" });
  const accepted = selectPersistableRssArticles("source-b", [article], [], []);
  assert.equal(accepted.length, 1);
});

test("one unique-conflict row cannot poison the rest of an RSS batch", async () => {
  const writes: string[][] = [];
  const conflicts: unknown[] = [];
  const result = await persistRowsWithConflictIsolation(
    ["fresh-a", "duplicate", "fresh-b"],
    async (batch) => {
      writes.push(batch);
      if (batch.includes("duplicate")) return { data: null, error: { code: "23505", message: "duplicate key" } };
      return { data: batch.map((id) => ({ id })), error: null };
    },
    (error) => conflicts.push(error),
  );

  assert.deepEqual(result, { inserted: 2, skipped: 1 });
  assert.equal(conflicts.length, 1);
  assert.ok(writes.some((batch) => batch.length > 1), "fast batch path must run before row isolation");
});

test("non-conflict Supabase errors remain visible to the caller", async () => {
  await assert.rejects(
    persistRowsWithConflictIsolation(["article"], async () => ({ data: null, error: { code: "42501", message: "permission denied" } })),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "42501"),
  );
});
