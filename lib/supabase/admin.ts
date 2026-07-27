import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS = 15_000;

function configuredRequestTimeoutMs() {
  const configured = Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000
    ? Math.floor(configured)
    : DEFAULT_SUPABASE_REQUEST_TIMEOUT_MS;
}

/**
 * Supabase's default fetch has no deadline. A stalled connection can therefore
 * hold a cron job until its database lease expires, blocking later RSS and
 * story phases. Keep every request bounded while preserving caller aborts.
 */
export async function fetchSupabaseWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  timeoutMs = configuredRequestTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const forwardCallerAbort = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    forwardCallerAbort();
  } else {
    callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
  }

  const timer = setTimeout(
    () => controller.abort(new DOMException("Supabase request timed out.", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardCallerAbort);
  }
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_RUNTIME_USE_PUBLIC_KEY === "true"
    ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchSupabaseWithTimeout },
  });
}
