import assert from "node:assert/strict";
import test from "node:test";
import { scheduledPipelineTask } from "../../lib/cron/schedule";

test("one-minute cron alternates RSS and story processing", () => {
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 20)), "rss");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 21)), "stories");
  assert.equal(scheduledPipelineTask(Date.UTC(2026, 6, 15, 1, 22)), "rss");
});

test("scheduled pipeline rejects an invalid timestamp", () => {
  assert.throws(() => scheduledPipelineTask(Number.NaN), /finite/);
});
