import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** Build-time seed for the credit bar; runtime `/api/last-updated` is authoritative. */
function lastUpdatedIso(): string {
  const vercelCommit = process.env.VERCEL_GIT_COMMIT_DATE?.trim();
  if (vercelCommit) return vercelCommit;

  try {
    return execSync("git log -1 --format=%cI", {
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
      NEXT_PUBLIC_LAST_UPDATED: lastUpdatedIso(),
    },
  };
}
