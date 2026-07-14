import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedEmail, isInternalMode, isPublicSignupAllowed } from "../../lib/config";
import { ConfigurationError, toSafeError } from "../../lib/core/errors";
import { ProviderRegistry } from "../../lib/providers/registry";

test("internal mode closes signup and uses explicit email allowlists", () => {
  const env = { NODE_ENV: "test", INTERNAL_MODE: "true", ALLOW_PUBLIC_SIGNUP: "true", ALLOWED_EMAILS: "member@example.com", ADMIN_EMAILS: "owner@example.com" } as NodeJS.ProcessEnv;
  assert.equal(isInternalMode(env), true);
  assert.equal(isPublicSignupAllowed(env), false);
  assert.equal(isAllowedEmail("MEMBER@example.com", env), true);
  assert.equal(isAllowedEmail("stranger@example.com", env), false);
});

test("typed errors expose safe codes without stack traces", () => {
  const safe = toSafeError(new ConfigurationError("Thiếu key", "football-data"));
  assert.deepEqual(safe, { code: "CONFIGURATION_REQUIRED", message: "Thiếu key", status: 503, retryable: false });
  assert.equal("stack" in safe, false);
});

test("provider registry reports disabled providers instead of production mocks", () => {
  const previousProvider = process.env.SPORTS_DATA_PROVIDER;
  const previousKey = process.env.SPORTS_DATA_API_KEY;
  const previousFixtures = process.env.ENABLE_DEVELOPMENT_FIXTURES;
  process.env.SPORTS_DATA_PROVIDER = "";
  process.env.SPORTS_DATA_API_KEY = "";
  process.env.ENABLE_DEVELOPMENT_FIXTURES = "false";
  try {
    const sports = new ProviderRegistry().describe().find((entry) => entry.kind === "sports");
    assert.equal(sports?.name, "disabled");
    assert.equal(sports?.state, "configuration_required");
  } finally {
    if (previousProvider === undefined) delete process.env.SPORTS_DATA_PROVIDER; else process.env.SPORTS_DATA_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.SPORTS_DATA_API_KEY; else process.env.SPORTS_DATA_API_KEY = previousKey;
    if (previousFixtures === undefined) delete process.env.ENABLE_DEVELOPMENT_FIXTURES; else process.env.ENABLE_DEVELOPMENT_FIXTURES = previousFixtures;
  }
});
