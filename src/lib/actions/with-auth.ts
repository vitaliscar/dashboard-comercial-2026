import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { AppRole } from "@/lib/actions/auth";
import { getCurrentSession } from "@/lib/actions/auth";

type AuthedProfile = Awaited<ReturnType<typeof getCurrentSession>> extends infer R
  ? R extends { profile: infer P }
    ? P
    : never
  : never;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reemplaza el middleware `requireAuth` de TanStack Start. Abre una transacción con
 * `SET LOCAL app.current_*` (rol `app_user`, sin BYPASSRLS) para que las RLS policies
 * (Fase 4) apliquen, igual que en la versión anterior — misma firma de contexto
 * (`tx`, `userId`, `role`, `profile`) para que los server functions de src/lib/server/*
 * se porten con cambios mínimos.
 */
export async function withAuth<T>(
  fn: (ctx: { tx: Tx; userId: string; role: AppRole | null; profile: AuthedProfile }) => Promise<T>,
): Promise<T> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Unauthorized: no session");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_role', ${session.role ?? ""}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${session.user.id}, true)`);
    await tx.execute(
      sql`SELECT set_config('app.current_sucursal_id', ${session.profile.sucursalId ?? ""}, true)`,
    );
    return fn({ tx, userId: session.user.id, role: session.role, profile: session.profile });
  });
}
