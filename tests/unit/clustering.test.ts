import assert from "node:assert/strict";
import test from "node:test";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";
import {
  analyzeSourceIndependence,
  CLUSTER_THRESHOLDS,
  clusterSimilarity,
  storyEventType,
} from "../../lib/stories/clustering";

const article = (
  id: string,
  sourceId: string,
  title: string,
  publishedAt = "2026-07-14T10:00:00.000Z",
) => ({ id, sourceId, title, excerpt: title, publishedAt });

test("clustering joins highly similar coverage from independent publishers", () => {
  const left = article(
    "a",
    "source-a",
    "Manchester United quan tâm tiền đạo trẻ Benjamin Sesko",
  );
  const right = article(
    "b",
    "source-b",
    "Man United quan tâm tiền đạo Benjamin Sesko",
  );
  const result = clusterSimilarity(left, { articles: [right] });
  assert.equal(result.compatible, true);
  assert.ok(result.score >= CLUSTER_THRESHOLDS.autoMerge);
});

test("clustering requires shared context for generic publisher headlines", () => {
  const newYorkTimes = {
    ...article("nyt", "new-york-times", "Here's the latest."),
    excerpt:
      "The United States launches fresh strikes against Iran as officials assess overnight damage.",
  };
  const bbc = {
    ...article("bbc", "bbc", "Here's the latest."),
    excerpt:
      "Hannah decided to keep her maiden name after the wedding and explained the family choice.",
  };

  const unrelated = clusterSimilarity(newYorkTimes, { articles: [bbc] });
  assert.equal(unrelated.compatible, false);
  assert.equal(unrelated.reason, "generic_title_without_shared_context");

  const syndicated = {
    ...article("wire", "wire-service", "Here's the latest."),
    excerpt: newYorkTimes.excerpt,
  };
  const sameEvent = clusterSimilarity(newYorkTimes, {
    articles: [syndicated],
  });
  assert.equal(sameEvent.compatible, true);
  assert.ok(sameEvent.score >= CLUSTER_THRESHOLDS.autoMerge);
});

test("clustering blocks conflicting score facts, unrelated participants and stale events", () => {
  const resultA = article("a", "one", "Kết quả Arsenal thắng Liverpool 2-0");
  const resultB = article("b", "two", "Kết quả Arsenal thắng Liverpool 3-0");
  assert.equal(
    clusterSimilarity(resultA, { articles: [resultB] }).reason,
    "score_fact_conflict",
  );

  const otherMatch = article(
    "c",
    "three",
    "Kết quả Chelsea thắng Liverpool 2-0",
  );
  assert.equal(
    clusterSimilarity(resultA, { articles: [otherMatch] }).compatible,
    false,
  );

  const oldTransfer = article(
    "d",
    "four",
    "Manchester United quan tâm Benjamin Sesko",
    "2026-06-01T10:00:00.000Z",
  );
  assert.equal(
    clusterSimilarity(
      article("e", "five", "Man United quan tâm tiền đạo Benjamin Sesko"),
      { articles: [oldTransfer] },
    ).reason,
    "outside_event_time_window",
  );
});

test("event classification distinguishes Vietnamese month from a win", () => {
  assert.equal(storyEventType("Kế hoạch tháng 7 của Arsenal"), "news");
  assert.equal(storyEventType("Arsenal thắng Chelsea 2-1"), "result");
});

test("event classification covers general-news events without treating every win as sport", () => {
  assert.equal(
    storyEventType("Động đất 7,2 độ làm rung chuyển Nhật Bản"),
    "disaster",
  );
  assert.equal(
    storyEventType("Trump wins US presidential election"),
    "election",
  );
  assert.equal(storyEventType("Apple wins major lawsuit in court"), "legal");
  assert.equal(
    storyEventType("Quốc hội thông qua luật bảo vệ dữ liệu mới"),
    "decision",
  );
  assert.equal(storyEventType("Cục Dự trữ Liên bang giảm lãi suất"), "economy");
});

test("clustering joins equivalent Vietnamese and English reports", () => {
  const vietnamese = {
    ...article(
      "vi",
      "source-vi",
      "Ông Trump công bố thuế mới với hàng hóa Việt Nam",
    ),
    excerpt: "Hoa Kỳ áp mức thuế 20% với hàng hóa từ Việt Nam.",
  };
  const english = {
    ...article(
      "en",
      "source-en",
      "Donald Trump announces new tariffs on Vietnamese goods",
    ),
    excerpt:
      "The United States will impose a 20% tariff on goods from Vietnam.",
  };
  const result = clusterSimilarity(vietnamese, { articles: [english] });
  assert.equal(result.compatible, true);
  assert.ok(result.score >= CLUSTER_THRESHOLDS.autoMerge);
});

test("clustering joins multilingual disaster updates but keeps distinct geographies apart", () => {
  const vietnamese = article(
    "vi",
    "source-vi",
    "Nhật Bản ban cảnh báo sóng thần sau động đất 7,1 độ",
  );
  const english = article(
    "en",
    "source-en",
    "Japan issues tsunami warning after magnitude 7.1 earthquake",
  );
  assert.ok(
    clusterSimilarity(vietnamese, { articles: [english] }).score >=
      CLUSTER_THRESHOLDS.autoMerge,
  );

  const china = article(
    "cn",
    "source-a",
    "Trump announces new tariffs on goods from China",
  );
  const vietnam = article(
    "vn",
    "source-b",
    "Trump announces new tariffs on goods from Vietnam",
  );
  assert.equal(
    clusterSimilarity(china, { articles: [vietnam] }).reason,
    "geography_conflict",
  );
});

test("clustering does not merge unrelated updates about the same public figure", () => {
  const tariffs = article("a", "one", "Trump announces new tariffs on Vietnam");
  const summit = article("b", "two", "Trump meets NATO leaders in Brussels");
  assert.equal(
    clusterSimilarity(tariffs, { articles: [summit] }).compatible,
    false,
  );

  const attack = article(
    "c",
    "three",
    "Israel launches missile attack overnight",
    "2026-07-14T10:00:00.000Z",
  );
  const laterAttack = article(
    "d",
    "four",
    "Israel confirms missile attack overnight",
    "2026-07-16T10:00:00.000Z",
  );
  assert.equal(
    clusterSimilarity(attack, { articles: [laterAttack] }).reason,
    "outside_event_time_window",
  );
});

test("score conflict detection follows reversed participant order", () => {
  const arsenalFirst = article("a", "one", "Kết quả Arsenal thắng Chelsea 2-1");
  const chelseaFirst = article("b", "two", "Chelsea thua Arsenal 1-2");
  const mirrored = clusterSimilarity(arsenalFirst, {
    articles: [chelseaFirst],
  });
  assert.equal(mirrored.compatible, true);
  assert.notEqual(mirrored.reason, "score_fact_conflict");

  const sameOrderConflict = article(
    "c",
    "three",
    "Kết quả Arsenal thua Chelsea 1-2",
  );
  assert.equal(
    clusterSimilarity(arsenalFirst, { articles: [sameOrderConflict] }).reason,
    "score_fact_conflict",
  );
});

test("source independence collapses explicit wire copies but retains another publisher", () => {
  const articles = [
    {
      ...article("r", "reuters", "Arsenal công bố huấn luyện viên mới"),
      sourceName: "Reuters",
      author: "Reuters",
      originalUrl: "https://reuters.com/a",
    },
    {
      ...article("c", "cnn", "Arsenal công bố huấn luyện viên mới"),
      sourceName: "CNN",
      author: "Reuters",
      originalUrl: "https://cnn.com/a",
    },
    {
      ...article("b", "bbc", "Arsenal công bố huấn luyện viên mới"),
      sourceName: "BBC Sport",
      author: "BBC Sport",
      originalUrl: "https://bbc.com/a",
    },
  ];
  const result = analyzeSourceIndependence(articles);
  assert.equal(result.independentSourceCount, 2);
  assert.equal(result.syndicatedArticleIds.has("c"), true);
  assert.equal(result.syndicatedArticleIds.has("r"), false);
});

test("source independence conservatively detects a near-verbatim republication", () => {
  const excerpt =
    "Arsenal xác nhận huấn luyện viên mới sẽ bắt đầu công việc vào tuần tới sau khi hai bên hoàn tất hợp đồng và công bố thông tin chính thức trên trang chủ câu lạc bộ.";
  const first = {
    ...article("a", "one", "Arsenal xác nhận huấn luyện viên mới"),
    excerpt,
    sourceName: "Nguồn A",
    originalUrl: "https://one.example/a",
  };
  const copy = {
    ...article("b", "two", "Arsenal xác nhận huấn luyện viên mới"),
    excerpt,
    sourceName: "Nguồn B",
    originalUrl: "https://two.example/b",
    publishedAt: "2026-07-14T10:05:00.000Z",
  };
  const result = analyzeSourceIndependence([first, copy]);
  assert.equal(result.independentSourceCount, 1);
  assert.equal(result.syndicatedArticleIds.has("b"), true);
});

test("clustering does not merge preview/result or injury/recovery updates", () => {
  const preview = article(
    "a",
    "one",
    "Nhận định trước trận Arsenal gặp Liverpool",
  );
  const result = article(
    "b",
    "two",
    "Kết quả Arsenal thắng Liverpool sau trận đấu",
  );
  assert.equal(
    clusterSimilarity(preview, { articles: [result] }).compatible,
    false,
  );
  assert.equal(storyEventType("Cầu thủ trở lại sau chấn thương"), "recovery");
  assert.equal(
    clusterSimilarity(article("c", "one", "Cầu thủ A dính chấn thương"), {
      articles: [article("d", "two", "Cầu thủ A hồi phục và trở lại")],
    }).compatible,
    false,
  );
});

test("heuristic output remains source-backed and timeline references articles", async () => {
  const provider = new HeuristicAIProvider();
  const articles = [
    {
      id: "a",
      title: "Tin A",
      excerpt: "Dữ kiện A từ nguồn.",
      publishedAt: "2026-07-14T09:00:00.000Z",
      sourceName: "Nguồn A",
    },
    {
      id: "b",
      title: "Tin A được xác nhận",
      excerpt: "Dữ kiện A từ nguồn thứ hai.",
      publishedAt: "2026-07-14T10:00:00.000Z",
      sourceName: "Nguồn B",
    },
  ];
  const summary = await provider.summarizeCluster({ articles });
  const timeline = await provider.generateTimeline({ articles });
  assert.deepEqual(summary.sourceIds, ["a", "b"]);
  assert.deepEqual(
    timeline.flatMap((item) => item.supportingArticleIds),
    ["a", "b"],
  );
  assert.match(
    await provider.answerFromClusterContext({
      question: "Dữ kiện A",
      articles,
    }),
    /Nguồn:/,
  );
});
