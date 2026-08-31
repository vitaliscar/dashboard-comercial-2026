import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  adminClient?: ReturnType<typeof postgres>;
  appClient?: ReturnType<typeof postgres>;
};

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error("Missing DATABASE_ADMIN_URL");

const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error("Missing DATABASE_URL");

const adminClient = globalForDb.adminClient ?? postgres(adminUrl, { max: 10, idle_timeout: 30 });
const appClient = globalForDb.appClient ?? postgres(appUrl, { max: 15, idle_timeout: 30 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.adminClient = adminClient;
  globalForDb.appClient = appClient;
}

// Conexión con rol `app_admin` (BYPASSRLS) — solo para el pipeline de carga de
// Excel y migraciones. NUNCA usar en código que sirve requests de usuarios.
export const dbAdmin = drizzle(adminClient, { schema });

// Conexión con rol `app_user` (sin BYPASSRLS) — la que sirve requests reales.
// El scope por rol se aplica vía RLS + `SET LOCAL` (ver Fase 4 del plan), no aquí.
export const db = drizzle(appClient, { schema });
