import assert from "node:assert/strict";
import test from "node:test";
import { derivePersistedAIStatus } from "../../lib/stories/persisted-repository";

test("persisted AI status only reports ok after real AI output exists", () => {
  assert.deepEqual(derivePersistedAIStatus([{ aiGenerated: false }], [], "cloudflare"), {
    provider: "cloudflare",
    state: "error",
    translatedCount: 0,
  });
  assert.deepEqual(derivePersistedAIStatus([{ aiGenerated: true }, { aiGenerated: false }], ["cloudflare"], "cloudflare"), {
    provider: "cloudflare",
    state: "ok",
    translatedCount: 1,
  });
});
