import assert from "node:assert/strict";
import test from "node:test";
import type { NewsItem } from "../../lib/types";
import {
  filterNewsItems,
  isTransferNews,
  normalizeSearchText,
  paginateItems,
  personalizedNewsItems,
  relatedNewsItems,
} from "../../lib/ui-logic";

const makeNews = (
  id: string,
  title: string,
  team: string,
  hotness = 60,
): NewsItem => ({
  id,
  title,
  slug: id,
  summary: `Cập nhật về ${team}`,
  keyPoints: [],
  category: "Bóng đá",
  competition: "Premier League",
  team,
  publishedAt: "vừa xong",
  hotness,
  reliability: 80,
  sources: ["Nguồn thử nghiệm"],
  imageTone: "green",
});

const items = [
  makeNews("arsenal", "Arsenal hoàn tất thương vụ mới", "Arsenal", 75),
  makeNews("liverpool", "Liverpool chuẩn bị trận đấu", "Liverpool", 82),
  makeNews("vietnam", "Đội tuyển Việt Nam hội quân", "Việt Nam", 65),
];

test("search normalizes Vietnamese accents", () => {
  assert.equal(normalizeSearchText("Đội tuyển Việt Nam"), "doi tuyen viet nam");
  assert.deepEqual(filterNewsItems(items, { query: "Viet Nam" }).map((item) => item.id), ["vietnam"]);
});

test("news filters combine query, team and hotness", () => {
  assert.deepEqual(filterNewsItems(items, { team: "Arsenal", minHotness: 70 }).map((item) => item.id), ["arsenal"]);
  assert.equal(filterNewsItems(items, { team: "Arsenal", minHotness: 80 }).length, 0);
});

test("personalization moves followed-team stories ahead of generic hot stories", () => {
  assert.equal(personalizedNewsItems(items, ["Arsenal"])[0].id, "arsenal");
});

test("related news never fills with unrelated stories", () => {
  assert.deepEqual(relatedNewsItems(items, ["Arsenal"]).map((item) => item.id), ["arsenal"]);
  assert.equal(relatedNewsItems(items, ["Real Madrid"]).length, 0);
});

test("transfer detection and pagination use real content", () => {
  assert.equal(isTransferNews(items[0]), true);
  assert.deepEqual(paginateItems(items, 2, 2), { items: [items[2]], page: 2, totalPages: 2 });
});
