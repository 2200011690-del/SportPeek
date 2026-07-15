import assert from "node:assert/strict";
import test from "node:test";
import { getHighResolutionStoryImageUrl } from "../../lib/stories/images";
import { cleanSummaryParagraphs, prioritizeAISummaryCandidates } from "../../lib/stories/summary";

test("story detail upgrades known publisher thumbnails without changing unrelated images", () => {
  assert.equal(
    getHighResolutionStoryImageUrl("https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/example.jpg"),
    "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/example.jpg",
  );
  assert.equal(
    getHighResolutionStoryImageUrl("https://images2.thanhnien.vn/zoom/600_315/example.jpg"),
    "https://images2.thanhnien.vn/zoom/1200_630/example.jpg",
  );
  assert.equal(getHighResolutionStoryImageUrl("https://cdn.example.com/photo.jpg"), "https://cdn.example.com/photo.jpg");
  assert.equal(getHighResolutionStoryImageUrl("not-a-url"), null);
});

test("story detail hides obsolete processing notices but keeps full summaries", () => {
  assert.deepEqual(cleanSummaryParagraphs(
    "Bản tóm tắt AI đầy đủ.",
    "Bản tin chưa được xử lý bởi AI; nội dung đang hiển thị từ metadata nguồn.",
    "Thông tin mở rộng từ bài nguồn.",
  ), ["Bản tóm tắt AI đầy đủ.", "Thông tin mở rộng từ bài nguồn."]);
});

test("AI backfill prioritizes unprocessed international stories", () => {
  const stories = [
    { id: "vi", aiGenerated: false, language: "vi" as const, updatedAt: "2026-07-15T03:00:00.000Z" },
    { id: "done", aiGenerated: true, language: "en" as const, updatedAt: "2026-07-15T04:00:00.000Z" },
    { id: "en", aiGenerated: false, language: "en" as const, updatedAt: "2026-07-15T02:00:00.000Z" },
  ];
  assert.deepEqual(prioritizeAISummaryCandidates(stories, 2).map((story) => story.id), ["en", "vi"]);
});
