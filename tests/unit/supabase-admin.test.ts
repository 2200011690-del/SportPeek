import assert from "node:assert/strict";
import test from "node:test";
import { fetchSupabaseWithTimeout } from "../../lib/supabase/admin";

test("fetchSupabaseWithTimeout returns a normal response before the deadline", async () => {
  let receivedLiveSignal = false;
  const response = await fetchSupabaseWithTimeout(
    "https://example.test",
    {},
    async (_input, init) => {
      receivedLiveSignal = Boolean(init?.signal && !init.signal.aborted);
      return new Response("ok");
    },
    50,
  );

  assert.equal(await response.text(), "ok");
  assert.equal(receivedLiveSignal, true);
});

test("fetchSupabaseWithTimeout aborts a stalled request at the deadline", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    fetchSupabaseWithTimeout(
      "https://example.test",
      {},
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
      25,
    ),
    (error: unknown) =>
      error instanceof DOMException && error.name === "TimeoutError",
  );
  assert.ok(Date.now() - startedAt < 500);
});

test("fetchSupabaseWithTimeout forwards an existing caller abort", async () => {
  const caller = new AbortController();
  const request = fetchSupabaseWithTimeout(
    "https://example.test",
    { signal: caller.signal },
    async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      }),
    1_000,
  );

  caller.abort(new DOMException("Caller cancelled.", "AbortError"));
  await assert.rejects(
    request,
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
  );
});
