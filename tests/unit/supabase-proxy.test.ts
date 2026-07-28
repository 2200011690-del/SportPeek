import assert from "node:assert/strict";
import test from "node:test";
import { hasSupabaseSessionCookie } from "../../lib/supabase/proxy";

test("Supabase session detection recognizes normal and chunked auth cookies", () => {
  assert.equal(
    hasSupabaseSessionCookie(["theme", "sb-project-auth-token"]),
    true,
  );
  assert.equal(
    hasSupabaseSessionCookie(["sb-project-auth-token.0", "sb-project-auth-token.1"]),
    true,
  );
});

test("Supabase session detection ignores unrelated and verifier cookies", () => {
  assert.equal(hasSupabaseSessionCookie(["theme", "locale"]), false);
  assert.equal(
    hasSupabaseSessionCookie(["sb-project-auth-token-code-verifier"]),
    false,
  );
});
