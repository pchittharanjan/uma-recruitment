import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@libsql/client'],
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

export default nextConfig;
