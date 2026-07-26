import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // src/tests/excel.test.ts is a standalone bun script (bun run src/tests/excel.test.ts),
    // not a vitest suite — it has no describe/it blocks and reads a real .xlsx fixture.
    exclude: [
      "**/node_modules/**",
      "**/.bun-cache/**",
      "**/.output/**",
      "**/dist/**",
      "src/tests/excel.test.ts",
      "e2e/**",
    ],
  },
});
