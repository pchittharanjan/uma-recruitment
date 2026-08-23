import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Top-level source roots / files whose mtimes count as “local code change”. */
const SOURCE_ENTRIES = [
  'app',
  'components',
  'lib',
  'hooks',
  'scripts',
  'middleware.ts',
  'SCHEMA.sql',
  'SPEC.md',
  'AGENTS.md',
  'CLAUDE.md',
  'next.config.ts',
  'package.json',
] as const;

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'coverage',
  'public',
  'agent-transcripts',
]);

function latestSourceMtimeMs(cwd: string): number | null {
  let latest = 0;

  function walk(abs: string) {
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }

    if (st.isFile()) {
      latest = Math.max(latest, st.mtimeMs);
      return;
    }

    if (!st.isDirectory()) return;

    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (ent.isDirectory() && (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.'))) {
        continue;
      }
      walk(join(abs, ent.name));
    }
  }

  for (const entry of SOURCE_ENTRIES) {
    walk(join(cwd, entry));
  }

  return latest || null;
}

/**
 * Local: newest mtime under source dirs (updates as you save during `npm run dev`).
 * Production (Vercel): commit date of the deployed GitHub push.
 */
export async function resolveLastUpdatedIso(): Promise<string> {
  if (process.env.VERCEL) {
    const commitDate = process.env.VERCEL_GIT_COMMIT_DATE?.trim();
    if (commitDate) return commitDate;
    const baked = process.env.NEXT_PUBLIC_LAST_UPDATED?.trim();
    if (baked) return baked;
    return new Date().toISOString();
  }

  const mtimeMs = latestSourceMtimeMs(process.cwd());
  if (mtimeMs) return new Date(mtimeMs).toISOString();
  return new Date().toISOString();
}
