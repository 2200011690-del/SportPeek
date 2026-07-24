import assert from "node:assert/strict";
import test from "node:test";
import { isAIQuotaExceeded, safeAIErrorMessage } from "../../lib/ai/quota";

test("Cloudflare daily neuron exhaustion is recognized as a quota error", () => {
  const error = new Error("4006: you have used up your daily free allocation of 10,000 neurons");
  assert.equal(isAIQuotaExceeded(error), true);
  assert.equal(isAIQuotaExceeded(new Error("invalid JSON")), false);
  assert.match(safeAIErrorMessage(error), /4006/);
});
