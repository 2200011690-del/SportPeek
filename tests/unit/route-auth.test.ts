import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  POST,
  boundedNewsLimit,
  cronAuthorizationState,
  routeRequiresCronAuthorization,
} from "../../app/api/[...path]/route";

test("internal AI endpoints fail closed when CRON_SECRET is missing", () => {
  assert.equal(
    cronAuthorizationState("Bearer anything", ""),
    "configuration_required",
  );
  assert.equal(
    cronAuthorizationState("Bearer anything", "   "),
    "configuration_required",
  );
});

test("internal AI endpoints require an exact bearer secret", () => {
  assert.equal(cronAuthorizationState(null, "secret"), "unauthorized");
  assert.equal(
    cronAuthorizationState("Bearer wrong", "secret"),
    "unauthorized",
  );
  assert.equal(
    cronAuthorizationState("Bearer secret", "secret"),
    "authorized",
  );
});

test("story summarize is public while operational endpoints stay protected", () => {
  assert.equal(routeRequiresCronAuthorization(["stories", "test", "summarize"]), false);
  assert.equal(routeRequiresCronAuthorization(["cron", "ingest"]), true);
  assert.equal(routeRequiresCronAuthorization(["admin", "ingest"]), true);
  assert.equal(routeRequiresCronAuthorization(["ai", "process"]), true);
});

test("public news limits are bounded and default to a compact feed", () => {
  assert.equal(boundedNewsLimit(null), 40);
  assert.equal(boundedNewsLimit("5"), 5);
  assert.equal(boundedNewsLimit("0"), 1);
  assert.equal(boundedNewsLimit("999"), 100);
  assert.equal(boundedNewsLimit("invalid"), 40);
});

const protectedRequest = (authorization?: string) =>
  POST(
    new NextRequest("https://sportpeek.local/api/cron/ingest", {
      method: "POST",
      headers: authorization ? { authorization } : undefined,
    }),
    { params: Promise.resolve({ path: ["cron", "ingest"] }) },
  );

test("protected endpoint returns 503 before any provider call when secret is unconfigured", async () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = await protectedRequest();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Tác vụ nội bộ chưa được cấu hình.",
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("protected endpoint returns 401 before any provider call for an invalid secret", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "expected-secret";
  try {
    const response = await protectedRequest("Bearer wrong-secret");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Không có quyền" });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
