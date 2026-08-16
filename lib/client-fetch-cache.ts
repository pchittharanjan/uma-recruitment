/**
 * In-memory GET JSON cache with stale-while-revalidate.
 *
 * Fresh hits return instantly.
 * After TTL, we still return the last good body immediately and refresh
 * in the background — so the UI stays snappy even when Turso is slow.
 */

type CacheEntry = {
  freshUntil: number;
  /** After this, drop the entry entirely (don't serve forever-stale data). */
  staleUntil: number;
  status: number;
  ok: boolean;
  body: unknown;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

/** Serve as "fresh" without a network trip. */
const DEFAULT_FRESH_MS = 5 * 60_000;
/** After fresh expires, still return cached body while revalidating. */
const DEFAULT_STALE_MS = 30 * 60_000;

export function invalidateClientFetchCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(urlPrefix)) store.delete(key);
  }
}

function revalidateInBackground(
  url: string,
  ttlMs: number,
  staleMs: number,
  init?: RequestInit,
): void {
  if (inflight.has(url)) return;

  const pending = (async () => {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    const body = await res.json().catch(() => null);
    const now = Date.now();
    const entry: CacheEntry = {
      freshUntil: now + ttlMs,
      staleUntil: now + staleMs,
      status: res.status,
      ok: res.ok,
      body,
    };
    if (res.ok) store.set(url, entry);
    return entry;
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, pending);
}

export async function cachedJsonFetch<T = unknown>(
  url: string,
  options?: {
    /** How long to treat a hit as fresh (default 2 min). */
    ttlMs?: number;
    /** How long to serve stale while refreshing (default 10 min). */
    staleMs?: number;
    force?: boolean;
    init?: RequestInit;
  },
): Promise<{ ok: boolean; status: number; json: T }> {
  const ttlMs = options?.ttlMs ?? DEFAULT_FRESH_MS;
  const staleMs = Math.max(options?.staleMs ?? DEFAULT_STALE_MS, ttlMs);
  const force = options?.force ?? false;
  const method = (options?.init?.method ?? 'GET').toUpperCase();

  if (method !== 'GET') {
    const res = await fetch(url, options?.init);
    const json = (await res.json().catch(() => null)) as T;
    return { ok: res.ok, status: res.status, json };
  }

  const now = Date.now();
  const hit = store.get(url);

  if (!force && hit && hit.freshUntil > now) {
    return { ok: hit.ok, status: hit.status, json: hit.body as T };
  }

  // Stale-while-revalidate: return old data now, refresh quietly.
  if (!force && hit && hit.staleUntil > now) {
    revalidateInBackground(url, ttlMs, staleMs, options?.init);
    return { ok: hit.ok, status: hit.status, json: hit.body as T };
  }

  let pending = inflight.get(url);
  if (!pending || force) {
    pending = (async () => {
      const res = await fetch(url, { ...options?.init, cache: 'no-store' });
      const body = await res.json().catch(() => null);
      const stamped = Date.now();
      const entry: CacheEntry = {
        freshUntil: stamped + ttlMs,
        staleUntil: stamped + staleMs,
        status: res.status,
        ok: res.ok,
        body,
      };
      if (res.ok) store.set(url, entry);
      return entry;
    })().finally(() => {
      inflight.delete(url);
    });
    inflight.set(url, pending);
  }

  const entry = await pending;
  return { ok: entry.ok, status: entry.status, json: entry.body as T };
}
