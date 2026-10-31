import type { NextConfig } from "next";

/**
 * /api/* is proxied by `app/api/[...path]/route.ts` so the browser and the
 * phone only ever talk to the portal origin. That keeps the HttpOnly session
 * cookie first-party and removes the need for CORS. The proxy target is a
 * runtime environment variable; no rewrite is baked into the build.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The repository contains unrelated lockfiles above this app; keep tracing
  // scoped to the portal so builds do not infer the home directory as root.
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
