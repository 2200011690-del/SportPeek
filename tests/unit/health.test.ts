import assert from "node:assert/strict";
import test from "node:test";
import { overallHealthState } from "../../lib/health";

test("unified health never reports operational while a required service is stale or broken", () => {
  assert.equal(overallHealthState(["operational", "stale", "operational"]), "stale");
  assert.equal(overallHealthState(["operational", "configuration_required"]), "configuration_required");
  assert.equal(overallHealthState(["operational", "degraded", "stale"]), "degraded");
  assert.equal(overallHealthState(["operational", "unavailable"]), "unavailable");
  assert.equal(overallHealthState(["operational", "operational"]), "operational");
});
