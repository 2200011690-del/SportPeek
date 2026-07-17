import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_HEALTH_SUCCESS_MAX_AGE_MS,
  evaluateAIHealth,
  overallHealthState,
  type AIJobHealthRecord,
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
