import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_HEALTH_SUCCESS_MAX_AGE_MS,
  evaluateAIHealth,
  evaluatePipelineHealth,
  overallHealthState,
  type AIJobHealthRecord,
  type PipelineJobHealthRecord,
} from "../../lib/health";

test("unified health never reports operational while a required service is stale or broken", () => {
  assert.equal(overallHealthState(["operational", "stale", "operational"]), "stale");
  assert.equal(overallHealthState(["operational", "configuration_required"]), "configuration_required");
  assert.equal(overallHealthState(["operational", "degraded", "stale"]), "degraded");
  assert.equal(overallHealthState(["operational", "unavailable"]), "unavailable");
  assert.equal(overallHealthState(["operational", "operational"]), "operational");
});

const now = Date.parse("2026-07-17T06:00:00.000Z");
const aiJob = (
  status: AIJobHealthRecord["status"],
  completedAt: string | null,
  createdAt = completedAt ?? "2026-07-17T05:55:00.000Z",
): AIJobHealthRecord => ({
  status,
  provider: "groq",
  created_at: createdAt,
  completed_at: completedAt,
});

test("AI health requires a recent successful job instead of historical AI content", () => {
  assert.equal(
    evaluateAIHealth({
      providerName: "failover",
      jobs: [],
      backlogCount: 42,
      now,
    }).state,
    "degraded",
  );

  const oldSuccess = new Date(
    now - AI_HEALTH_SUCCESS_MAX_AGE_MS - 1,
  ).toISOString();
  assert.equal(
    evaluateAIHealth({
      providerName: "failover",
      jobs: [aiJob("completed", oldSuccess)],
      backlogCount: 0,
      now,
    }).state,
    "stale",
  );
});

test("AI health is operational only after a recent successful summary job", () => {
  const completedAt = new Date(now - 60_000).toISOString();
  const result = evaluateAIHealth({
    providerName: "failover",
    jobs: [aiJob("completed", completedAt)],
    backlogCount: 12,
    now,
  });

  assert.equal(result.state, "operational");
  assert.equal(result.provider, "groq");
  assert.equal(result.lastUpdatedAt, completedAt);
});

test("a newer failed AI job degrades a previously healthy provider", () => {
  const successAt = new Date(now - 5 * 60_000).toISOString();
  const failedAt = new Date(now - 60_000).toISOString();
  const result = evaluateAIHealth({
    providerName: "failover",
    jobs: [aiJob("completed", successAt), aiJob("failed", failedAt)],
    backlogCount: 4,
    now,
  });

  assert.equal(result.state, "degraded");
  assert.equal(result.latestStatus, "failed");
  assert.equal(result.lastUpdatedAt, failedAt);
});

test("AI health distinguishes missing configuration and unreadable queue state", () => {
  assert.equal(
    evaluateAIHealth({
      providerName: "heuristic",
      jobs: [],
      backlogCount: 0,
      now,
    }).state,
    "configuration_required",
  );
  assert.equal(
    evaluateAIHealth({
      providerName: "failover",
      jobs: [],
      backlogCount: 0,
      queryFailed: true,
      now,
    }).state,
    "unavailable",
  );
});

const pipelineJob = (
  status: string,
  startedAt: string,
  completedAt: string | null,
): PipelineJobHealthRecord => ({
  status,
  started_at: startedAt,
  completed_at: completedAt,
  error_code: status === "failed" ? "TEST_FAILURE" : null,
});

test("an active pipeline job keeps the last recent success operational", () => {
  const activeAt = new Date(now - 30_000).toISOString();
  const successAt = new Date(now - 2 * 60_000).toISOString();
  const result = evaluatePipelineHealth({
    jobs: [
      pipelineJob("processing", activeAt, null),
      pipelineJob("completed", successAt, successAt),
    ],
    successMaxAgeMs: 15 * 60_000,
    now,
  });

  assert.equal(result.state, "operational");
  assert.equal(result.latestStatus, "processing");
  assert.equal(result.lastUpdatedAt, successAt);
});

test("pipeline health degrades stalled and failed jobs newer than the last success", () => {
  const successAt = new Date(now - 7 * 60_000).toISOString();
  const stalledAt = new Date(now - 6 * 60_000).toISOString();
  const failedAt = new Date(now - 60_000).toISOString();

  assert.equal(
    evaluatePipelineHealth({
      jobs: [
        pipelineJob("processing", stalledAt, null),
        pipelineJob("completed", successAt, successAt),
      ],
      successMaxAgeMs: 15 * 60_000,
      stallAfterMs: 5 * 60_000,
      now,
    }).state,
    "degraded",
  );
  assert.equal(
    evaluatePipelineHealth({
      jobs: [
        pipelineJob("failed", failedAt, failedAt),
        pipelineJob("completed", successAt, successAt),
      ],
      successMaxAgeMs: 15 * 60_000,
      now,
    }).state,
    "degraded",
  );
});

test("pipeline health is stale only when its last success exceeds the freshness window", () => {
  const oldSuccess = new Date(now - 16 * 60_000).toISOString();
  assert.equal(
    evaluatePipelineHealth({
      jobs: [pipelineJob("completed", oldSuccess, oldSuccess)],
      successMaxAgeMs: 15 * 60_000,
      now,
    }).state,
    "stale",
  );
  assert.equal(
    evaluatePipelineHealth({
      jobs: [],
      successMaxAgeMs: 15 * 60_000,
      queryFailed: true,
      now,
    }).state,
    "unavailable",
  );
});
