import type { NextConfig } from "next";

// Note on HSTS (Strict-Transport-Security):
// HSTS is intentionally omitted here as it should be configured at the reverse proxy level (Nginx/Caddy) in production.

// Content Security Policy directive.
// 'unsafe-inline' and 'unsafe-eval' are included in script-src as required for Next.js App Router client hydration,
// React 19, and 3D rendering libraries (Three.js / React Three Fiber).
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: blob:;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: ["172.18.123.76"],
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
  experimental: {
    serverActions: {
      // Límite global bajo para login y mutaciones normales (CN-010).
      // La carga de Excel (~28MB) usa /api/carga con límite propio.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
