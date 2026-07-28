export type AsyncTtlCache<T> = {
  get(loader: () => Promise<T>): Promise<T>;
  clear(): void;
};

/**
 * Small isolate-local cache for read-only runtime data. It coalesces concurrent
 * misses so a burst of page requests only performs one upstream read.
 */
export function createAsyncTtlCache<T>(
  ttlMs: number,
  now: () => number = Date.now,
): AsyncTtlCache<T> {
  const safeTtlMs = Math.max(0, Math.floor(ttlMs));
  let hasValue = false;
  let value: T;
  let expiresAt = 0;
  let pending: Promise<T> | null = null;

  return {
    get(loader) {
      if (hasValue && now() < expiresAt) return Promise.resolve(value);
      if (pending) return pending;

      pending = loader()
        .then((nextValue) => {
          value = nextValue;
          hasValue = true;
          expiresAt = now() + safeTtlMs;
          return nextValue;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    clear() {
      hasValue = false;
      expiresAt = 0;
      pending = null;
    },
  };
}
