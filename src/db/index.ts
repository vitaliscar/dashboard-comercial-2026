import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Conexión con rol `app_admin` (BYPASSRLS) — solo para el pipeline de carga de
// Excel y migraciones. NUNCA usar en código que sirve requests de usuarios.
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) throw new Error("Missing DATABASE_ADMIN_URL");
export const dbAdmin = drizzle(postgres(adminUrl), { schema });

// Conexión con rol `app_user` (sin BYPASSRLS) — la que sirve requests reales.
// El scope por rol se aplica vía RLS + `SET LOCAL` (ver Fase 4 del plan), no aquí.
const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error("Missing DATABASE_URL");
export const db = drizzle(postgres(appUrl), { schema });
