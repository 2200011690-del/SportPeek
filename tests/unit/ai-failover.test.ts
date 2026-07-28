import assert from "node:assert/strict";
import test from "node:test";
import { FailoverAIProvider } from "../../lib/ai/failover";
import { evidenceFingerprint, needsClusterSummary, sanitizeClusterSummary, selectClusterSummary } from "../../lib/ai/grounding";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";
import { providerJsonSchema, summarySchema } from "../../lib/ai/remote-base";

test("AI failover advances to the next provider and records the winner", async () => {
  const failing = new HeuristicAIProvider();
  Object.defineProperty(failing, "name", { value: "first" });
  failing.summarizeCluster = async () => { throw new Error("quota exceeded"); };
  const working = new HeuristicAIProvider();
  Object.defineProperty(working, "name", { value: "second" });
  const provider = new FailoverAIProvider([failing, working]);
  const result = await provider.summarizeCluster({ articles: [{ id: "article-1", title: "Tin mới", excerpt: "Thông tin nguồn" }] });
  assert.equal(result.sourceIds[0], "article-1");
  assert.equal(provider.lastProviderName, "second");
});

test("AI failover always returns a source-backed summary when every remote provider fails", async () => {
  const first = new HeuristicAIProvider();
  Object.defineProperty(first, "name", { value: "unavailable-a" });
  first.summarizeCluster = async () => { throw new Error("quota exceeded"); };
  const second = new HeuristicAIProvider();
  Object.defineProperty(second, "name", { value: "unavailable-b" });
  second.summarizeCluster = async () => { throw new Error("network timeout"); };
  const provider = new FailoverAIProvider([first, second]);
  const result = await provider.summarizeCluster({
    articles: [{
      id: "article-1",
      title: "Thành phố mở tuyến metro mới",
      excerpt: "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay sau thời gian chạy thử.",
    }],
  });
  assert.equal(provider.lastProviderName, "heuristic");
  assert.match(result.summary, /Tuyến metro mới bắt đầu phục vụ hành khách/);
  assert.deepEqual(result.citations?.[0].sourceArticleIds, ["article-1"]);
});

test("AI summary validation removes repeated claims and rejects invented sources", () => {
  const articles = [{ id: "a", title: "Arsenal thắng trận", excerpt: "Arsenal thắng trận với tỷ số 2-0 trong trận đấu tối nay." }];
  const cleaned = sanitizeClusterSummary({
    title: "Arsenal thắng trận",
    summary: "Arsenal thắng trận với tỷ số 2-0. Arsenal thắng trận với tỷ số 2-0 trong trận đấu tối nay. Đây là kết quả được ghi nhận từ bài nguồn.",
    keyPoints: ["Arsenal thắng 2-0", "Arsenal thắng với tỷ số 2-0"],
    sourceIds: ["a"],
  }, articles);
  assert.equal(cleaned.keyPoints.length, 1);
  assert.equal((cleaned.summary.match(/Arsenal thắng trận với tỷ số 2-0/g) ?? []).length, 1);
  assert.throws(() => sanitizeClusterSummary({ ...cleaned, sourceIds: ["invented"] }, articles), /unknown source IDs/);
});

test("AI summary validation removes an unsupported claim instead of discarding grounded content", () => {
  const articles = [{
    id: "source-1",
    title: "Thành phố mở tuyến metro mới",
    excerpt: "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay sau thời gian chạy thử. Đại diện thành phố cho biết lịch vận hành sẽ được công bố trong tuần.",
  }];
  const cleaned = sanitizeClusterSummary({
    title: "Thành phố mở tuyến metro mới",
    summary: "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay sau thời gian chạy thử. Tuyến metro đã phục vụ 999.999 hành khách. Đại diện thành phố cho biết lịch vận hành sẽ được công bố trong tuần.",
    keyPoints: [
      "Tuyến metro mới bắt đầu phục vụ hành khách từ sáng nay.",
      "Tuyến metro đã phục vụ 999.999 hành khách.",
    ],
    sourceIds: ["source-1"],
  }, articles);
  assert.doesNotMatch(cleaned.summary, /999\.999/);
  assert.equal(cleaned.keyPoints.length, 1);
  assert.ok(cleaned.citations?.length);
});

test("Groq strict summary schema requires citations", () => {
  const schema = providerJsonSchema(summarySchema) as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  assert.ok(schema.required?.includes("citations"));
  assert.ok(schema.properties?.citations);
});

test("last good AI summary wins over heuristic fallback when remote AI is unavailable", () => {
  const articles = [{ id: "old", title: "Tin cũ", excerpt: "Dữ kiện cũ có nguồn." }, { id: "new", title: "Tin mới", excerpt: "Dữ kiện mới có nguồn." }];
  const heuristic = { title: "Tin mới", summary: "Dữ kiện mới có nguồn.", keyPoints: ["Dữ kiện mới"], sourceIds: ["new"] };
  const selected = selectClusterSummary({
    remote: null,
    heuristic,
    previous: { aiGenerated: true, title: "Bản tổng hợp tốt", summary: "Bản tổng hợp đã được kiểm chứng từ bài nguồn và đang hiển thị ổn định cho người đọc.", keyPoints: ["Dữ kiện đã kiểm chứng"], sourceIds: ["old"] },
    articles,
  });
  assert.equal(selected.origin, "previous");
  assert.equal(selected.summary.title, "Bản tổng hợp tốt");
});

test("evidence fingerprint ignores duplicate claims but changes for a material fact", () => {
  const original = [{ id: "a", title: "Arsenal thắng", excerpt: "Arsenal thắng Liverpool với tỷ số 2-0." }];
  const syndicatedCopy = [...original, { id: "b", title: "Arsenal thắng", excerpt: "Arsenal thắng Liverpool với tỷ số 2-0." }];
  const materialUpdate = [...original, { id: "c", title: "Arsenal thắng", excerpt: "Huấn luyện viên xác nhận cầu thủ chủ chốt bị chấn thương." }];
  assert.equal(evidenceFingerprint(original), evidenceFingerprint(syndicatedCopy));
  assert.notEqual(evidenceFingerprint(original), evidenceFingerprint(materialUpdate));
});

test("backfill retries a stale last-good summary without retrying a valid one", () => {
  assert.equal(needsClusterSummary({ aiGenerated: true, reviewStatus: "pending" }), true);
  assert.equal(needsClusterSummary({ aiGenerated: true, reviewStatus: "auto" }), false);
  assert.equal(needsClusterSummary({ aiGenerated: false, reviewStatus: "pending" }), true);
});
