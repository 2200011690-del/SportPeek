import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeArticleUrl, parseRssXml, safeHttpUrl } from "../../lib/rss/parser";
import { rssContentHash } from "../../lib/rss/sync";

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

test("RSS parser rejects entity declarations", () => {
  assert.throws(() => parseRssXml(`<!DOCTYPE x [<!ENTITY y "bad">]><rss><channel /></rss>`, { feedUrl: "https://example.com/rss", language: "vi" }), /không được hỗ trợ/);
});

test("general-news ingestion keeps sports beyond football", () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Wimbledon công bố lịch thi đấu mới</title><link>https://example.com/tennis</link><guid>tennis-1</guid><description>Giải quần vợt cập nhật lịch thi đấu.</description><pubDate>Tue, 14 Jul 2026 09:00:00 GMT</pubDate><category>Thể thao</category></item></channel></rss>`;
  const rows = parseRssXml(xml, { feedUrl: "https://example.com/rss", language: "vi" }, new Date("2026-07-14T10:00:00.000Z"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Wimbledon công bố lịch thi đấu mới");
});
