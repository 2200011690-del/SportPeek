import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("scheduled story batches never invoke remote AI and alternate freshness with backlog fairness", () => {
  const newest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 22));
  const oldest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 31));
  assert.equal(newest.limit, 8);
  assert.equal(newest.candidateLimit, 96);
  assert.equal(newest.leaseSeconds, 240);
  assert.equal(newest.aiLimit, 0);
  assert.equal(newest.matchAiLimit, 0);
  assert.equal(newest.oldestFirst, false);
  assert.equal(oldest.oldestFirst, true);
  assert.equal(newest.useAi, false);
});
