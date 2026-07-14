import assert from "node:assert/strict";
import test from "node:test";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";
import { clusterSimilarity, storyEventType } from "../../lib/stories/clustering";

const article = (id: string, sourceId: string, title: string, publishedAt = "2026-07-14T10:00:00.000Z") => ({ id, sourceId, title, excerpt: title, publishedAt });

test("clustering joins highly similar coverage from independent publishers", () => {
  const left = article("a", "source-a", "Manchester United quan tâm tiền đạo trẻ Benjamin Sesko");
  const right = article("b", "source-b", "Man United quan tâm tiền đạo Benjamin Sesko");
  const result = clusterSimilarity(left, { articles: [right] });
  assert.equal(result.compatible, true); assert.ok(result.score >= 0.58);
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
