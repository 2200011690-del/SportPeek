import { ProviderError, RateLimitError } from "@/lib/core/errors";

type ProviderBudget = { nextAllowedAt: number; failures: number };
const budgets = new Map<string, ProviderBudget>();

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(750 * 2 ** attempt, 4_000) + Math.floor(Math.random() * 150);
}

export async function providerFetch(provider: string, url: string, init: RequestInit = {}, options: { timeoutMs?: number; retries?: number; minimumIntervalMs?: number } = {}): Promise<Response> {
  const budget = budgets.get(provider) ?? { nextAllowedAt: 0, failures: 0 };
  const wait = Math.max(0, budget.nextAllowedAt - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const retries = options.retries ?? 2;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 12_000) });
      budget.nextAllowedAt = Date.now() + (options.minimumIntervalMs ?? 100);
      if (response.ok || response.status === 304) { budget.failures = 0; budgets.set(provider, budget); return response; }
      if ([401, 403].includes(response.status)) throw new ProviderError(`${provider} từ chối API key.`, provider, false);
      if (response.status === 429 && attempt === retries) throw new RateLimitError(`${provider} đã hết quota tạm thời.`);
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) throw new ProviderError(`${provider} HTTP ${response.status}.`, provider, response.status >= 500);
    } catch (error) {
      if (error instanceof ProviderError || error instanceof RateLimitError) throw error;
      if (attempt === retries) throw new ProviderError(`${provider} không phản hồi trong thời hạn.`, provider, true);
    }
    budget.failures += 1;
    budgets.set(provider, budget);
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw new ProviderError(`${provider} không khả dụng.`, provider, true);
}
