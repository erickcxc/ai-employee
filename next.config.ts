import type { NextConfig } from "next";

// Security headers on every response (SOC 2 CC6.6, CC6.7): no framing, no sniffing, strict referrer,
// HTTPS only, and the microphone allowed for this site alone (Mike's calls).
const headers = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // The in-process Postgres loads its WASM at runtime; bundling it breaks that.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

export default config;
