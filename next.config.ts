import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
  experimental: {
    serverActions: {
      // default 1mb es insuficiente para el Excel multi-hoja de /carga (uploadExcelAction)
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
