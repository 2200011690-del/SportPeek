import assert from "node:assert/strict";
import test from "node:test";
import { createContentSecurityPolicy } from "../../lib/security/csp";

test("production CSP uses a nonce without unsafe script or style directives", () => {
  const value = createContentSecurityPolicy("test-nonce", false);
  assert.match(value, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic'/);
  assert.match(value, /style-src 'self' 'nonce-test-nonce'/);
  assert.doesNotMatch(value, /unsafe-eval|unsafe-inline/);
  assert.match(value, /object-src 'none'/);
});

test("development CSP permits eval only for local React diagnostics", () => {
  const value = createContentSecurityPolicy("test-nonce", true);
  assert.match(value, /unsafe-eval/);
  assert.doesNotMatch(value, /unsafe-inline/);
});
