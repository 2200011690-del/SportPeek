interface Env {
  UPSTREAM: Fetcher;
}

const PROXY_RETRY_DELAY_MS = 75;

const upstreamRequest = (request: Request) => {
  const forwarded = new Request(request);
  forwarded.headers.set("x-newspeek-proxy", "1");
  forwarded.headers.set("x-forwarded-host", new URL(request.url).host);
  return forwarded;
};

const temporarilyUnavailableResponse = () =>
  new Response(
    JSON.stringify({
      status: "error",
      error: {
        code: "UPSTREAM_TEMPORARILY_UNAVAILABLE",
        message: "NewsPeek đang tải lại dữ liệu. Vui lòng thử lại sau ít giây.",
      },
    }),
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "content-type": "application/json; charset=utf-8",
        "retry-after": "2",
        "strict-transport-security":
          "max-age=31536000; includeSubDomains; preload",
        "x-content-type-options": "nosniff",
      },
    },
  );

export async function forwardPublicRequest(
  request: Request,
  env: Env,
  retryDelayMs = PROXY_RETRY_DELAY_MS,
): Promise<Response> {
  const retryable = request.method === "GET" || request.method === "HEAD";
  try {
    const response = await env.UPSTREAM.fetch(upstreamRequest(request));
    if (!retryable || response.status < 500) return response;
    await response.body?.cancel();
  } catch (error) {
    if (!retryable) throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  try {
    const response = await env.UPSTREAM.fetch(upstreamRequest(request));
    if (response.status < 500) return response;
    await response.body?.cancel();
  } catch {}
  return temporarilyUnavailableResponse();
}

export const publicProxyWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return forwardPublicRequest(request, env);
  },
};

export default publicProxyWorker;
