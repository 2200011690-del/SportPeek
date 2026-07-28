import assert from "node:assert/strict";
import test from "node:test";
import type { NewsItem } from "../../lib/types";
import {
  filterNewsItems,
  normalizeSearchText,
  paginateItems,
  personalizedNewsItems,
  relatedNewsItems,
} from "../../lib/ui-logic";

const makeNews = (
  id: string,
  title: string,
  category: string,
  source: string,
  hotness = 60,
): NewsItem => ({
  id,
  title,
  slug: id,
  summary: `Cập nhật về ${category}`,
  keyPoints: [],
  category,
  primaryTopic: category,
  region: category === "Thế giới" ? "Quốc tế" : "Việt Nam",
  publishedAt: "vừa xong",
  hotness,
  reliability: 80,
  sources: [source],
  imageTone: "green",
});

const items = [
  makeNews("ai", "AI tạo sinh có cập nhật mới", "Công nghệ", "BBC Technology", 75),
  makeNews("market", "Thị trường chứng khoán tăng điểm", "Kinh tế", "VnExpress", 82),
  makeNews("vietnam", "Việt Nam công bố chính sách mới", "Việt Nam", "Tuổi Trẻ", 65),
];

test("search normalizes Vietnamese accents", () => {
  assert.equal(normalizeSearchText("Chính sách Việt Nam"), "chinh sach viet nam");
  assert.deepEqual(filterNewsItems(items, { query: "Chinh sach" }).map((item) => item.id), ["vietnam"]);
});

test("news filters combine category, source and hotness", () => {
  assert.deepEqual(filterNewsItems(items, { category: "Công nghệ", source: "BBC Technology", minHotness: 70 }).map((item) => item.id), ["ai"]);
  assert.equal(filterNewsItems(items, { category: "Công nghệ", minHotness: 80 }).length, 0);
});

test("personalization moves followed-source stories ahead of generic hot stories", () => {
  assert.equal(personalizedNewsItems(items, ["BBC Technology"])[0].id, "ai");
});

test("related news never fills with unrelated stories", () => {
  assert.deepEqual(relatedNewsItems(items, ["AI tạo sinh"]).map((item) => item.id), ["ai"]);
  assert.equal(relatedNewsItems(items, ["Nông nghiệp"]).length, 0);
});

test("pagination returns the requested page", () => {
  assert.deepEqual(paginateItems(items, 2, 2), { items: [items[2]], page: 2, totalPages: 2 });
});
