import assert from "node:assert/strict";
import test from "node:test";
import {
  runScheduledPipelineTask,
  scheduledPipelineTask,
  scheduledStoryProcessingOptions,
} from "../../lib/cron/schedule";

test("one-minute cron rotates RSS, story processing, and AI backfill", () => {
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 21)), "rss");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 22)), "stories");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 23)), "ai");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 24)), "rss");
});

test("scheduled pipeline rejects an invalid timestamp", () => {
  assert.throws(() => scheduledPipelineTask(Number.NaN), /finite/);
});

test("scheduled runner awaits the selected task and propagates failures", async () => {
  const calls: string[] = [];
  const runners = {
    rss: async () => { calls.push("rss"); },
    stories: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      calls.push("stories");
    },
    ai: async () => { calls.push("ai"); },
  };
  await runScheduledPipelineTask("stories", runners);
  assert.deepEqual(calls, ["stories"]);
  await assert.rejects(
    runScheduledPipelineTask("rss", {
      ...runners,
      rss: async () => { throw new Error("rss failed"); },
    }),
    /rss failed/,
  );
});

test("scheduled story batches never invoke remote AI and alternate freshness with backlog fairness", () => {
  const newest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 22));
  const oldest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 31));
  assert.equal(newest.limit, 12);
  assert.equal(newest.candidateLimit, 96);
  assert.equal(newest.leaseSeconds, 600);
  assert.equal(newest.aiLimit, 0);
  assert.equal(newest.matchAiLimit, 0);
  assert.equal(newest.oldestFirst, false);
  assert.equal(newest.includeFailed, false);
  assert.equal(oldest.oldestFirst, true);
  assert.equal(oldest.includeFailed, true);
  assert.equal(newest.useAi, false);
});
