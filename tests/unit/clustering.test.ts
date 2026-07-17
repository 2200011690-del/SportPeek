import assert from "node:assert/strict";
import test from "node:test";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";
import { analyzeSourceIndependence, CLUSTER_THRESHOLDS, clusterSimilarity, storyEventType } from "../../lib/stories/clustering";

const article = (id: string, sourceId: string, title: string, publishedAt = "2026-07-14T10:00:00.000Z") => ({ id, sourceId, title, excerpt: title, publishedAt });

test("clustering joins highly similar coverage from independent publishers", () => {
  const left = article("a", "source-a", "Manchester United quan tâm tiền đạo trẻ Benjamin Sesko");
  const right = article("b", "source-b", "Man United quan tâm tiền đạo Benjamin Sesko");
  const result = clusterSimilarity(left, { articles: [right] });
  assert.equal(result.compatible, true); assert.ok(result.score >= CLUSTER_THRESHOLDS.autoMerge);
});

test("clustering blocks conflicting score facts, unrelated participants and stale events", () => {
  const resultA = article("a", "one", "Kết quả Arsenal thắng Liverpool 2-0");
  const resultB = article("b", "two", "Kết quả Arsenal thắng Liverpool 3-0");
  assert.equal(clusterSimilarity(resultA, { articles: [resultB] }).reason, "score_fact_conflict");

  const otherMatch = article("c", "three", "Kết quả Chelsea thắng Liverpool 2-0");
  assert.equal(clusterSimilarity(resultA, { articles: [otherMatch] }).compatible, false);

  const oldTransfer = article("d", "four", "Manchester United quan tâm Benjamin Sesko", "2026-06-01T10:00:00.000Z");
  assert.equal(clusterSimilarity(article("e", "five", "Man United quan tâm tiền đạo Benjamin Sesko"), { articles: [oldTransfer] }).reason, "outside_event_time_window");
});

test("event classification distinguishes Vietnamese month from a win", () => {
  assert.equal(storyEventType("Kế hoạch tháng 7 của Arsenal"), "news");
  assert.equal(storyEventType("Arsenal thắng Chelsea 2-1"), "result");
});

test("score conflict detection follows reversed participant order", () => {
  const arsenalFirst = article("a", "one", "Kết quả Arsenal thắng Chelsea 2-1");
  const chelseaFirst = article("b", "two", "Chelsea thua Arsenal 1-2");
  const mirrored = clusterSimilarity(arsenalFirst, { articles: [chelseaFirst] });
  assert.equal(mirrored.compatible, true);
  assert.notEqual(mirrored.reason, "score_fact_conflict");

  const sameOrderConflict = article("c", "three", "Kết quả Arsenal thua Chelsea 1-2");
  assert.equal(clusterSimilarity(arsenalFirst, { articles: [sameOrderConflict] }).reason, "score_fact_conflict");
});

test("source independence collapses explicit wire copies but retains another publisher", () => {
  const articles = [
    { ...article("r", "reuters", "Arsenal công bố huấn luyện viên mới"), sourceName: "Reuters", author: "Reuters", originalUrl: "https://reuters.com/a" },
    { ...article("c", "cnn", "Arsenal công bố huấn luyện viên mới"), sourceName: "CNN", author: "Reuters", originalUrl: "https://cnn.com/a" },
    { ...article("b", "bbc", "Arsenal công bố huấn luyện viên mới"), sourceName: "BBC Sport", author: "BBC Sport", originalUrl: "https://bbc.com/a" },
  ];
  const result = analyzeSourceIndependence(articles);
  assert.equal(result.independentSourceCount, 2);
  assert.equal(result.syndicatedArticleIds.has("c"), true);
  assert.equal(result.syndicatedArticleIds.has("r"), false);
});

test("source independence conservatively detects a near-verbatim republication", () => {
  const excerpt = "Arsenal xác nhận huấn luyện viên mới sẽ bắt đầu công việc vào tuần tới sau khi hai bên hoàn tất hợp đồng và công bố thông tin chính thức trên trang chủ câu lạc bộ.";
  const first = { ...article("a", "one", "Arsenal xác nhận huấn luyện viên mới"), excerpt, sourceName: "Nguồn A", originalUrl: "https://one.example/a" };
  const copy = { ...article("b", "two", "Arsenal xác nhận huấn luyện viên mới"), excerpt, sourceName: "Nguồn B", originalUrl: "https://two.example/b", publishedAt: "2026-07-14T10:05:00.000Z" };
  const result = analyzeSourceIndependence([first, copy]);
  assert.equal(result.independentSourceCount, 1);
  assert.equal(result.syndicatedArticleIds.has("b"), true);
});

test("clustering does not merge preview/result or injury/recovery updates", () => {
  const preview = article("a", "one", "Nhận định trước trận Arsenal gặp Liverpool");
  const result = article("b", "two", "Kết quả Arsenal thắng Liverpool sau trận đấu");
  assert.equal(clusterSimilarity(preview, { articles: [result] }).compatible, false);
  assert.equal(storyEventType("Cầu thủ trở lại sau chấn thương"), "recovery");
  assert.equal(clusterSimilarity(article("c", "one", "Cầu thủ A dính chấn thương"), { articles: [article("d", "two", "Cầu thủ A hồi phục và trở lại")] }).compatible, false);
});

test("heuristic output remains source-backed and timeline references articles", async () => {
  const provider = new HeuristicAIProvider(); const articles = [{ id: "a", title: "Tin A", excerpt: "Dữ kiện A từ nguồn.", publishedAt: "2026-07-14T09:00:00.000Z", sourceName: "Nguồn A" }, { id: "b", title: "Tin A được xác nhận", excerpt: "Dữ kiện A từ nguồn thứ hai.", publishedAt: "2026-07-14T10:00:00.000Z", sourceName: "Nguồn B" }];
  const summary = await provider.summarizeCluster({ articles }); const timeline = await provider.generateTimeline({ articles });
  assert.deepEqual(summary.sourceIds, ["a", "b"]); assert.deepEqual(timeline.flatMap((item) => item.supportingArticleIds), ["a", "b"]);
  assert.match(await provider.answerFromClusterContext({ question: "Dữ kiện A", articles }), /Nguồn:/);
});
