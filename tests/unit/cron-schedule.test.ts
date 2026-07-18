import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduledPipelineTask,
  scheduledStoryProcessingOptions,
} from "../../lib/cron/schedule";

test("one-minute cron alternates RSS and story processing", () => {
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 20)), "rss");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 21)), "stories");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 22)), "rss");
});

test("scheduled pipeline rejects an invalid timestamp", () => {
  assert.throws(() => scheduledPipelineTask(Number.NaN), /finite/);
});

test("scheduled story batches preserve AI quota and alternate freshness with backlog fairness", () => {
  const newest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 21));
  const oldest = scheduledStoryProcessingOptions(Date.UTC(2026, 6, 15, 1, 23));
  assert.equal(newest.limit, 20);
  assert.equal(newest.aiLimit, 1);
  assert.equal(newest.oldestFirst, false);
  assert.equal(oldest.oldestFirst, true);
  assert.equal(newest.useAi, true);
});
