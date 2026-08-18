import { execSync } from "node:child_process";
import type { NextConfig } from "next";

const GITHUB_REPO = "pchittharanjan/uma-recruitment";

async function lastUpdatedIso(): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "uma-recruitment",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { pushed_at?: string };
      if (json.pushed_at) return json.pushed_at;
    }
  } catch {
    // Fall through to Vercel build time / local git.
  }

  // A GitHub push triggers the Vercel build, so build time is the push time.
  if (process.env.VERCEL) {
    return new Date().toISOString();
  }

  try {
    return execSync("git log -1 origin/main --format=%cI", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString();
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ['@libsql/client'],
  experimental: {
    // Next 16 defaults dynamic staleTime to 0, so every click re-renders
    // layouts against Turso. Reuse the last RSC payload for 30s.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    optimisticRouting: true,
  },
  async redirects() {
    return [
      // v1 routes removed in v2
      { source: '/setup', destination: '/login', permanent: false },
      { source: '/grade', destination: '/login', permanent: false },
      { source: '/grade/:path*', destination: '/login', permanent: false },
      // deleted admin pages — auth layout still gates /admin/*
      { source: '/admin/assignments', destination: '/admin/dashboard', permanent: false },
      { source: '/admin/dashboard/finalize', destination: '/admin/dashboard', permanent: false },
    ];
  },
};

export default async function config(): Promise<NextConfig> {
  return {
    ...nextConfig,
    env: {
      NEXT_PUBLIC_LAST_UPDATED: await lastUpdatedIso(),
    },
  };
}
