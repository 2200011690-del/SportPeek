import assert from "node:assert/strict";
import test from "node:test";
import { getHighResolutionStoryImageUrl } from "../../lib/stories/images";
import { cleanSummaryParagraphs, prioritizeAISummaryCandidates, storyDisplaySummaryParagraphs } from "../../lib/stories/summary";
import { CLUSTER_SUMMARY_TASK } from "../../lib/ai/remote-base";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";

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

test("AI stories render one editorial summary instead of appending source excerpts", () => {
  assert.deepEqual(storyDisplaySummaryParagraphs({
    aiGenerated: true,
    summary: "AI đã gộp dữ kiện chung thành một bản tin duy nhất.",
    summaryLong: "AI đã gộp dữ kiện chung thành một bản tin duy nhất.\n\nNguồn A kể lại cùng sự kiện.\n\nNguồn B tiếp tục kể lại cùng sự kiện.",
  }), ["AI đã gộp dữ kiện chung thành một bản tin duy nhất."]);
  assert.match(CLUSTER_SUMMARY_TASK, /gộp các dữ kiện chung/);
  assert.match(CLUSTER_SUMMARY_TASK, /không lặp cùng một ý/);
  assert.match(CLUSTER_SUMMARY_TASK, /không nối các trích đoạn/);
});

test("AI story detail prefers clean long-form editorial summaries", () => {
  assert.deepEqual(storyDisplaySummaryParagraphs({
    aiGenerated: true,
    summary: "Bản ngắn cho danh sách tin.",
    summaryLong: "Bản dài giải thích đầy đủ bối cảnh chính của sự kiện.\n\nĐoạn tiếp theo bổ sung diễn biến quan trọng và loại bỏ các dữ kiện trùng lặp giữa nhiều nguồn.",
  }), [
    "Bản dài giải thích đầy đủ bối cảnh chính của sự kiện.",
    "Đoạn tiếp theo bổ sung diễn biến quan trọng và loại bỏ các dữ kiện trùng lặp giữa nhiều nguồn.",
  ]);
});

test("story detail removes the generic RSS disclaimer and shows actual story information", () => {
  assert.deepEqual(storyDisplaySummaryParagraphs({
    aiGenerated: false,
    title: "U23 Việt Nam giành chiến thắng ở trận ra quân",
    summary: "SportPeek ghi nhận thông tin này từ VOV Thể thao, Tuổi Trẻ Thể thao. Bản tổng hợp chỉ dựa trên tiêu đề và mô tả ngắn do các nguồn phát hành qua RSS. Có 2 nhà xuất bản cùng đề cập sự kiện.",
    summaryLong: "",
    articles: [],
  }), ["U23 Việt Nam giành chiến thắng ở trận ra quân"]);
});

test("heuristic summary uses source titles when RSS descriptions are empty", async () => {
  const provider = new HeuristicAIProvider();
  const result = await provider.summarizeCluster({ articles: [
    { id: "a", title: "U23 Việt Nam thắng trận mở màn", excerpt: "", sourceName: "Nguồn A", publishedAt: "2026-07-15T01:00:00.000Z" },
    { id: "b", title: "Chiến thắng của U23 Việt Nam trong ngày ra quân", excerpt: "", sourceName: "Nguồn B", publishedAt: "2026-07-15T01:05:00.000Z" },
  ] });
  assert.match(result.summary, /U23 Việt Nam/);
  assert.doesNotMatch(result.summary, /chưa được xử lý|metadata nguồn/i);
});

test("AI backfill prioritizes unprocessed international stories", () => {
  const stories = [
    { id: "vi", aiGenerated: false, language: "vi" as const, updatedAt: "2026-07-15T03:00:00.000Z" },
    { id: "done", aiGenerated: true, language: "en" as const, updatedAt: "2026-07-15T04:00:00.000Z" },
    { id: "en", aiGenerated: false, language: "en" as const, updatedAt: "2026-07-15T02:00:00.000Z" },
  ];
  assert.deepEqual(prioritizeAISummaryCandidates(stories, 2).map((story) => story.id), ["en", "vi"]);
});
