import assert from "node:assert/strict";
import test from "node:test";
import { newsStatusLabel } from "../../components/news/news-presenter";

test("single-source stories never claim independent confirmation", () => {
  assert.equal(
    newsStatusLabel({
      storyStatus: "reported",
      category: "Thế giới",
      title: "Tin một nguồn",
      sources: ["Nguồn A"],
    }),
    "Một nguồn",
  );
});

test("multiple publishers are described as reporting, not verification", () => {
  assert.equal(
    newsStatusLabel({
      storyStatus: "reported",
      category: "Việt Nam",
      title: "Tin đa nguồn",
      sources: ["Nguồn A", "Nguồn B"],
    }),
    "Nhiều nguồn đưa tin",
  );
});

test("official status describes source provenance", () => {
  assert.equal(
    newsStatusLabel({
      storyStatus: "official",
      category: "Chính trị",
      title: "Thông báo chính thức",
      sources: ["Cổng thông tin"],
    }),
    "Có nguồn chính thức",
  );
});
