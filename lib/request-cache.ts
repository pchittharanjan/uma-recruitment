import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request memoization for read-only API routes.
 *
 * Route handlers opt in by wrapping their body in `runWithRequestCache`.
 * Query helpers wrapped with `cachedPerRequest` then dedupe repeated reads
 * (user row, access grants, active round, …) within that one request.
 *
 * Outside a cache scope every call falls through to the database, so
 * mutation routes keep exact read-after-write semantics. Only wrap GET
 * handlers that don't write.
 */
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  if (storage.getStore()) return fn();
  return storage.run(new Map(), fn);
}

export function cachedPerRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return fn();

  const hit = store.get(key);
  if (hit) return hit as Promise<T>;

  const promise = fn().catch((err) => {
    store.delete(key); // don't cache failures
    throw err;
  });
  store.set(key, promise);
  return promise;
}
