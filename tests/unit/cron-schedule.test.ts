import assert from "node:assert/strict";
import test from "node:test";
import {
  runScheduledPipelineTask,
  SCHEDULED_PIPELINE_STALL_MS,
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
  const options = [19, 22, 25, 28].map((minute) =>
    scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, minute))
  );
  assert.deepEqual(
    options.map(({ oldestFirst, includeFailed }) => ({ oldestFirst, includeFailed })),
    [
      { oldestFirst: true, includeFailed: true },
      { oldestFirst: false, includeFailed: false },
      { oldestFirst: true, includeFailed: true },
      { oldestFirst: false, includeFailed: false },
    ],
  );
  for (const option of options) {
    assert.equal(option.limit, 12);
    assert.equal(option.candidateLimit, 96);
    assert.equal(option.leaseSeconds, 240);
    assert.equal(option.aiLimit, 0);
    assert.equal(option.matchAiLimit, 0);
    assert.equal(option.useAi, false);
  }
});

test("pipeline recovery lease cannot block more than one recurring phase", () => {
  assert.equal(SCHEDULED_PIPELINE_STALL_MS, 5 * 60_000);
  assert.ok(SCHEDULED_PIPELINE_STALL_MS < 2 * 3 * 60_000);
});

test("exactly every other story phase drains failed backlog", () => {
  const storyMinutes = Array.from({ length: 60 }, (_, minute) => minute)
    .filter((minute) => minute % 3 === 1);
  const drainMinutes = storyMinutes.filter((minute) =>
    scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, minute)).includeFailed
  );
  assert.deepEqual(drainMinutes, [1, 7, 13, 19, 25, 31, 37, 43, 49, 55]);
});
