import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduledApiFootballTask,
  scheduledFootballDataTask,
  scheduledPipelineTask,
  scheduledSportsTask,
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

test("scheduled story batch gives every completed story one AI attempt", () => {
  const options = scheduledStoryProcessingOptions();
  assert.equal(options.limit, options.aiLimit);
  assert.equal(options.useAi, true);
});

test("sports cron rotates one curated OpenLigaDB competition per slot", () => {
  assert.deepEqual(scheduledSportsTask(Date.UTC(2026, 6, 15, 0, 1)), {
    command: "competitions",
  });
  assert.deepEqual(scheduledSportsTask(Date.UTC(2026, 6, 15, 0, 10)), {
    command: "teams",
    competitionIds: ["bl2"],
  });
  assert.deepEqual(scheduledSportsTask(Date.UTC(2026, 6, 15, 7, 1)), {
    command: "fixtures",
    competitionIds: ["bl2"],
  });
  assert.deepEqual(scheduledSportsTask(Date.UTC(2026, 6, 15, 8, 2)), {
    command: "standings",
    competitionIds: ["bl3"],
  });
  assert.deepEqual(scheduledSportsTask(Date.UTC(2026, 6, 15, 9, 3)), {
    command: "results",
    competitionIds: ["dfb"],
  });
  assert.equal(scheduledSportsTask(Date.UTC(2026, 6, 15, 5, 30)), null);
});

test("football-data cron backfills and refreshes one competition per slot", () => {
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 0, 18)), {
    command: "competitions",
  });
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 0, 20)), {
    command: "teams",
    competitionIds: ["PL"],
  });
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 13, 24)), {
    command: "fixtures",
    competitionIds: ["BL1"],
  });
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 20, 31)), {
    command: "results",
    competitionIds: ["CLI"],
  });
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 15, 30)), {
    command: "standings",
    competitionIds: ["WC"],
  });
  assert.deepEqual(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 12, 46)), {
    command: "live",
    competitionIds: ["CLI"],
  });
  assert.equal(scheduledFootballDataTask(Date.UTC(2026, 6, 15, 5, 30)), null);
});

test("API-Football cron stays within the free daily request budget", () => {
  assert.deepEqual(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 0, 48)),
    { command: "competitions" },
  );
  assert.equal(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 0, 49))?.command,
    "teams",
  );
  assert.deepEqual(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 4, 40)),
    { command: "daily", dateOffset: -1 },
  );
  assert.deepEqual(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 4, 42)),
    { command: "daily", dateOffset: 1 },
  );
  assert.deepEqual(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 9, 50)),
    { command: "live" },
  );
  assert.deepEqual(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 13, 52)),
    { command: "details" },
  );
  assert.equal(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 0, 53))?.command,
    "transfers",
  );
  assert.equal(
    scheduledApiFootballTask(Date.UTC(2026, 6, 15, 8, 50)),
    null,
  );
});
