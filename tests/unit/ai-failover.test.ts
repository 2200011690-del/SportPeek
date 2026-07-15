import assert from "node:assert/strict";
import test from "node:test";
import { FailoverAIProvider } from "../../lib/ai/failover";
import { HeuristicAIProvider } from "../../lib/ai/heuristic";

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
