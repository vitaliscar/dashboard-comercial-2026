import { defineConfig } from "drizzle-kit";

// Bun carga .env.local nativamente — no hace falta dotenv.
// Migraciones y `drizzle-kit push` corren como app_admin (BYPASSRLS) — ver docs/MASTER_STRATEGY.md.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
  },
});
