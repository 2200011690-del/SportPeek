import assert from "node:assert/strict";
import test from "node:test";
import { articleContentParagraphs } from "../../lib/articles/content";
import { extractPublisherArticleContent } from "../../lib/articles/publisher";

test("article content keeps publisher paragraph boundaries", () => {
  assert.deepEqual(
    articleContentParagraphs("Đoạn thứ nhất.\n\nĐoạn thứ hai.\n\nĐoạn thứ ba."),
    ["Đoạn thứ nhất.", "Đoạn thứ hai.", "Đoạn thứ ba."],
  );
});

test("article content groups a flat RSS body into readable paragraphs", () => {
  const sentences = Array.from(
    { length: 24 },
    (_, index) => `Câu số ${index + 1} cung cấp một dữ kiện rõ ràng cho người đọc.`,
  ).join(" ");
  const paragraphs = articleContentParagraphs(sentences);
  assert.ok(paragraphs.length >= 2);
  assert.equal(paragraphs.join(" "), sentences);
});

test("article content never returns executable markup", () => {
  const paragraphs = articleContentParagraphs("Nội dung an toàn. <script>alert(1)</script>");
  assert.equal(paragraphs.join(" "), "Nội dung an toàn.");
});

test("publisher extractor prefers NewsArticle JSON-LD articleBody", () => {
  const body = Array.from({ length: 130 }, (_, index) => `noi-dung-${index}`).join(" ");
  const extracted = extractPublisherArticleContent(`
    <html><head><script type="application/ld+json">
      {"@type":"NewsArticle","articleBody":"${body}"}
    </script></head><body><article><p>Đoạn quá ngắn.</p></article></body></html>
  `);
  assert.equal(extracted?.wordCount, 130);
  assert.equal(extracted?.content, body);
});

test("publisher extractor reads article HTML and drops navigation noise", () => {
  const paragraphs = Array.from(
    { length: 4 },
    (_, index) => `<p>${Array.from({ length: 35 }, (__, word) => `doan-${index}-${word}`).join(" ")}</p>`,
  ).join("");
  const extracted = extractPublisherArticleContent(`
    <html><body><nav>${Array.from({ length: 180 }, (_, index) => `menu-${index}`).join(" ")}</nav><article>${paragraphs}</article></body></html>
  `);
  assert.equal(extracted?.wordCount, 140);
  assert.match(extracted?.content ?? "", /doan-0-0/);
  assert.doesNotMatch(extracted?.content ?? "", /menu-0/);
});

test("publisher extractor respects nosnippet robots metadata", () => {
  const body = Array.from({ length: 130 }, (_, index) => `blocked-${index}`).join(" ");
  assert.equal(
    extractPublisherArticleContent(`<html><head><meta name="robots" content="nosnippet"></head><body><article><p>${body}</p></article></body></html>`),
    null,
  );
});
