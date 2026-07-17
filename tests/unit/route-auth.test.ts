import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  POST,
  cronAuthorizationState,
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

const summarizeRequest = (authorization?: string) =>
  POST(
    new NextRequest("https://sportpeek.local/api/stories/test/summarize", {
      method: "POST",
      headers: authorization ? { authorization } : undefined,
    }),
    { params: Promise.resolve({ path: ["stories", "test", "summarize"] }) },
  );

test("story summarize returns 503 before any provider call when secret is unconfigured", async () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = await summarizeRequest();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "Tác vụ nội bộ chưa được cấu hình.",
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("story summarize returns 401 before any provider call for an invalid secret", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "expected-secret";
  try {
    const response = await summarizeRequest("Bearer wrong-secret");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Không có quyền" });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
