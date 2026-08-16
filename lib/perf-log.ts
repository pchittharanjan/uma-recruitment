/**
 * Lightweight server timing for hot API routes.
 * Logs in development always; in production set PERF_LOG=1.
 *
 * Watch server console for lines like:
 *   [perf] GET /api/admin/phase 42ms
 */

const ENABLED =
  process.env.PERF_LOG === '1' || process.env.NODE_ENV === 'development';

export async function withPerfLog<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) return fn();
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - started);
    console.info(`[perf] ${label} ${ms}ms`);
  }
}
