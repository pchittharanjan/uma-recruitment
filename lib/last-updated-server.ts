import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const GITHUB_REPO = 'pchittharanjan/uma-recruitment';

function gitOutput(command: string): string | null {
  try {
    const out = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

function latestUncommittedMtimeMs(cwd: string): number | null {
  const porcelain = gitOutput('git status --porcelain');
  if (!porcelain) return null;

  let latest = 0;
  for (const line of porcelain.split('\n')) {
    if (!line) continue;
    let file = line.slice(3).trim();
    if (file.includes(' -> ')) {
      file = file.slice(file.lastIndexOf(' -> ') + 4);
    }
    file = file.replace(/^"|"$/g, '');
    try {
      latest = Math.max(latest, statSync(join(cwd, file)).mtimeMs);
    } catch {
      // Ignored / deleted paths.
    }
  }
  return latest || null;
}

async function githubPushedAt(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'uma-recruitment',
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { pushed_at?: string };
    return json.pushed_at ?? null;
  } catch {
    return null;
  }
}

/** Local: newest save/commit. Production: last GitHub push (or this deploy). */
export async function resolveLastUpdatedIso(): Promise<string> {
  if (process.env.VERCEL) {
    return (await githubPushedAt()) ?? new Date().toISOString();
  }

  const commitIso = gitOutput('git log -1 --format=%cI');
  const dirtyMs = latestUncommittedMtimeMs(process.cwd());
  const commitMs = commitIso ? Date.parse(commitIso) : 0;
  if (dirtyMs && dirtyMs >= commitMs) {
    return new Date(dirtyMs).toISOString();
  }
  return commitIso ?? new Date().toISOString();
}
