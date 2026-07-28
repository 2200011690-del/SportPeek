import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncTtlCache } from "../../lib/cache/async-ttl";

test("async TTL cache reuses a value until it expires", async () => {
  let currentTime = 1_000;
  let calls = 0;
  const cache = createAsyncTtlCache(100, () => currentTime);
  const load = async () => ++calls;

  assert.equal(await cache.get(load), 1);
  assert.equal(await cache.get(load), 1);
  currentTime += 101;
  assert.equal(await cache.get(load), 2);
});

test("async TTL cache coalesces concurrent misses", async () => {
  let calls = 0;
  const cache = createAsyncTtlCache(100);
  const load = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return "ready";
  };

  assert.deepEqual(
    await Promise.all([cache.get(load), cache.get(load), cache.get(load)]),
    ["ready", "ready", "ready"],
  );
  assert.equal(calls, 1);
});

test("async TTL cache does not retain failed loads", async () => {
  let calls = 0;
  const cache = createAsyncTtlCache(100);
  const load = async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return "recovered";
  };

  await assert.rejects(() => cache.get(load), /temporary/);
  assert.equal(await cache.get(load), "recovered");
  assert.equal(calls, 2);
});
