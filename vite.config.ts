import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";
import type { Connect, Plugin } from "vite";

// Vite's ServerOptions has no `middlewares` field — connect middleware is registered
// via a plugin's configureServer hook, not a static server config array.
function serveLogoGlb(): Plugin {
  return {
    name: "serve-logo-3d-glb",
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        if (req.url?.startsWith("/logo_3D.glb")) {
          const filePath = path.join(process.cwd(), "logo_3D.glb");
          if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);
            res.setHeader("Content-Type", "model/gltf-binary");
            res.setHeader("Content-Length", data.length);
            res.end(data);
            return;
          }
        }
        next();
      };
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    watch: {
      ignored: [
        "**/.git/**",
        "**/.bun-cache/**",
        "**/.vinxi/**",
        "**/.tsr/**",
        "**/graphify-out/**",
        "**/.output/**",
        "**/dist/**",
        "**/.tanstack/**",
        "**/supabase/.temp/**",
        "**/*.xlsx",
        "**/*.glb",
        "**/node_modules/**",
      ],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      // @ts-expect-error target option is passed to Nitro dynamically
      target: "node-server",
    }),
    viteReact(),
    serveLogoGlb(),
  ],
  optimizeDeps: {
    noDiscovery: true,
    entries: ["src/router.tsx", "src/start.ts"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "scheduler",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/react-start",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "clsx",
      "tailwind-merge",
      "sonner",
      "zustand",
      "use-sync-external-store",
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
      "use-sync-external-store/shim/with-selector.js",
      "@tanstack/react-store",
      "date-fns",
      "zod",
    ],
    exclude: ["three", "xlsx", "@react-three/fiber", "@react-three/drei"],
  },
  ssr: {
    external: ["three", "@react-three/fiber", "@react-three/drei", "xlsx"],
    noExternal: ["use-sync-external-store"],
  },
});
