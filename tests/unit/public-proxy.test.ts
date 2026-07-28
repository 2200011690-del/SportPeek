import assert from "node:assert/strict";
import test from "node:test";
import { forwardPublicRequest } from "../../worker/public-proxy";

type ProxyEnv = Parameters<typeof forwardPublicRequest>[1];

test("public proxy retries one transient upstream exception for safe requests", async () => {
  let attempts = 0;
  const env = {
    UPSTREAM: {
      async fetch(request: Request) {
        attempts += 1;
        assert.equal(request.headers.get("x-newspeek-proxy"), "1");
        assert.equal(request.headers.get("x-forwarded-host"), "newspeek.test");
        if (attempts === 1) throw new Error("transient upstream failure");
        return new Response("ok", { status: 200 });
      },
    },
  } as unknown as ProxyEnv;

  const response = await forwardPublicRequest(
    new Request("https://newspeek.test/"),
    env,
    0,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 2);
});

test("public proxy retries one transient upstream 5xx for safe requests", async () => {
  let attempts = 0;
  const env = {
    UPSTREAM: {
      async fetch() {
        attempts += 1;
        return attempts === 1
          ? new Response("temporary failure", { status: 500 })
          : new Response("ok", { status: 200 });
      },
    },
  } as unknown as ProxyEnv;

  const response = await forwardPublicRequest(
    new Request("https://newspeek.test/api/stories/example"),
    env,
    0,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 2);
});

test("public proxy never retries a state-changing request", async () => {
  let attempts = 0;
  const env = {
    UPSTREAM: {
      async fetch() {
        attempts += 1;
        throw new Error("upstream failure");
      },
    },
  } as unknown as ProxyEnv;

  await assert.rejects(
    () =>
      forwardPublicRequest(
        new Request("https://newspeek.test/api/action", { method: "POST" }),
        env,
        0,
      ),
    /upstream failure/,
  );
  assert.equal(attempts, 1);
});

test("public proxy returns a hardened 503 when both safe attempts fail", async () => {
  let attempts = 0;
  const env = {
    UPSTREAM: {
      async fetch() {
        attempts += 1;
        throw new Error("upstream failure");
      },
    },
  } as unknown as ProxyEnv;

  const response = await forwardPublicRequest(
    new Request("https://newspeek.test/"),
    env,
    0,
  );

  assert.equal(response.status, 503);
  assert.equal(attempts, 2);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );
});

test("public proxy replaces repeated upstream 5xx with a hardened 503", async () => {
  let attempts = 0;
  const env = {
    UPSTREAM: {
      async fetch() {
        attempts += 1;
        return new Response("platform exception", { status: 500 });
      },
    },
  } as unknown as ProxyEnv;

  const response = await forwardPublicRequest(
    new Request("https://newspeek.test/api/stories/example"),
    env,
    0,
  );

  assert.equal(response.status, 503);
  assert.equal(attempts, 2);
  assert.equal(response.headers.get("retry-after"), "2");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );
});
