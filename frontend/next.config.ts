import type { NextConfig } from "next";

/**
 * /api/* is proxied to the FastAPI service so the browser only ever talks to
 * the portal origin. That keeps the HttpOnly session cookie first-party and
 * removes the need for CORS. Override the target per environment.
 */
const apiProxyTarget = (
  process.env.API_PROXY_TARGET || "http://localhost:8000"
).replace(/\/+$/, "");

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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ];
  },
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
