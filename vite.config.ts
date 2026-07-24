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

// @node-rs/argon2 es un addon nativo de Node usado solo en handlers server-side
// (password.ts, vía loginFn). Pero auth.ts es importado por el hook cliente
// use-auth.tsx, así que el grafo del cliente incluye el import estático de argon2.
// Su campo `browser` de package.json apunta a browser.js → `@node-rs/argon2-wasm32-wasi`
// (no instalado) → el build del cliente falla. El cliente nunca ejecuta argon2, así
// que lo redirigimos a un stub SOLO en el environment "client"; SSR/servidor usan el
// binding nativo real. Ver src/shims/argon2-browser.ts.
const ARGON2_STUB = path.resolve(__dirname, "src/shims/argon2-browser.ts");
function stubArgon2InClient(): Plugin {
  return {
    name: "stub-argon2-client",
    enforce: "pre",
    resolveId(id) {
      if (id === "@node-rs/argon2" && this.environment?.name === "client") {
        return ARGON2_STUB;
      }
      return null;
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
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
  plugins: [tailwindcss(), tanstackStart(), viteReact(), serveLogoGlb(), stubArgon2InClient()],
  optimizeDeps: {
    // Packages in `include` (notably @tanstack/react-start) get their `node:async_hooks`
    // import externalized to an empty stub by the dep pre-bundler — `new AsyncLocalStorage()`
    // then throws "is not a constructor" in the browser and silently kills React hydration
    // (no 3D logo, login form falls back to a native POST). This Rolldown plugin redirects
    // that import to our sync browser shim at pre-bundle time. optimizeDeps only runs for the
    // client/browser environment, so the server keeps Node's real, reentrant AsyncLocalStorage.
    rolldownOptions: {
      plugins: [
        {
          name: "shim-node-async-hooks",
          resolveId(id) {
            if (/^(node:)?async_hooks$/.test(id)) {
              return path.resolve(__dirname, "src/shims/async-hooks-browser.ts");
            }
            return null;
          },
        },
        {
          // El optimizeDeps de rolldown solo corre para el cliente/navegador, así
          // que aquí siempre redirigimos argon2 al stub (mismo motivo que arriba).
          name: "stub-argon2-optimizer",
          resolveId(id) {
            if (id === "@node-rs/argon2") {
              return path.resolve(__dirname, "src/shims/argon2-browser.ts");
            }
            return null;
          },
        },
      ],
    },
    // These CJS packages need Vite's optimizer to convert them to ESM with a proper
    // default export — without an explicit include, esbuild's auto-discovery misses
    // these subpaths and React/Zustand/@tanstack/react-store's internals crash with
    // "does not provide an export named 'default'". (NOTE: deliberately no
    // `noDiscovery`/`entries` here — that combination previously broke TanStack
    // Start's dev-mode client-entry script injection into the SSR HTML.)
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
