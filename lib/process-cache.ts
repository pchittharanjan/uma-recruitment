/**
 * Short-lived in-process cache for hot Turso reads (session user, team row).
 * Layouts hit these on every App Router navigation; without this each click
 * waits on a remote HTTPS round-trip even when nothing changed.
 */

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function invalidateProcessCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export async function cachedProcess<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fn()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise as Promise<T>;
}
