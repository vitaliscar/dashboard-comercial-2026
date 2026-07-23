import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { users, sessions, profiles, userRoles, profileUnidadesNegocio } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sessionExpiryDate, isSessionExpired, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

const isProd = process.env.NODE_ENV === "production";

function setSessionCookie(sessionId: string, expiresAt: Date) {
  setCookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Carga profile + role + scope (sucursal/unidad/unidades múltiples) para un
 * usuario ya autenticado. Misma forma que `use-auth.tsx` esperaba de Supabase.
 */
async function loadAuthPayload(userId: string) {
  const [profile] = await dbAdmin.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) return null;

  const roles = await dbAdmin
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  const bridgeRows = await dbAdmin
    .select({ unidadNegocioId: profileUnidadesNegocio.unidadNegocioId })
    .from(profileUnidadesNegocio)
    .where(eq(profileUnidadesNegocio.profileId, userId));

  const unidadesNegocioIds =
    bridgeRows.length > 0
      ? bridgeRows.map((r) => r.unidadNegocioId)
      : profile.unidadNegocioId
        ? [profile.unidadNegocioId]
        : [];

  let role: AppRole | null = null;
  if (profile.isAdmin) {
    role = "gerencia";
  } else {
    const priority: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];
    const roleNames = roles.map((r) => r.role);
    role = priority.find((rr) => roleNames.includes(rr)) ?? null;
  }

  return { profile: { ...profile, unidadesNegocioIds }, role };
}

/** Middleware que reemplaza `requireSupabaseAuth` — valida la cookie de sesión. */
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const sessionId = getCookie(SESSION_COOKIE_NAME);
  if (!sessionId) throw new Error("Unauthorized: no session cookie");

  const [session] = await dbAdmin
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session || isSessionExpired(session.expiresAt)) {
    deleteCookie(SESSION_COOKIE_NAME);
    throw new Error("Unauthorized: session expired or not found");
  }

  const payload = await loadAuthPayload(session.userId);
  if (!payload) throw new Error("Unauthorized: profile not found");

  return next({
    context: { userId: session.userId, role: payload.role, profile: payload.profile },
  });
});

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const [user] = await dbAdmin.select().from(users).where(eq(users.email, data.email)).limit(1);
    if (!user || !user.isActive) return { error: "Correo o contraseña incorrectos." };

    const valid = await verifyPassword(user.passwordHash, data.password);
    if (!valid) return { error: "Correo o contraseña incorrectos." };

    const payload = await loadAuthPayload(user.id);
    if (!payload) return { error: "No se pudo cargar el perfil del usuario." };

    const expiresAt = sessionExpiryDate();
    const [session] = await dbAdmin
      .insert(sessions)
      .values({ userId: user.id, expiresAt })
      .returning({ id: sessions.id });

    setSessionCookie(session.id, expiresAt);

    return { error: null, user: { id: user.id, email: user.email }, ...payload };
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const sessionId = getCookie(SESSION_COOKIE_NAME);
  if (sessionId) {
    await dbAdmin.delete(sessions).where(eq(sessions.id, sessionId));
  }
  deleteCookie(SESSION_COOKIE_NAME);
  return { success: true };
});

export const meFn = createServerFn({ method: "GET" }).handler(async () => {
  const sessionId = getCookie(SESSION_COOKIE_NAME);
  if (!sessionId) return null;

  const [session] = await dbAdmin
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session || isSessionExpired(session.expiresAt)) {
    deleteCookie(SESSION_COOKIE_NAME);
    return null;
  }

  const payload = await loadAuthPayload(session.userId);
  if (!payload) return null;

  const [user] = await dbAdmin.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;

  return { user: { id: user.id, email: user.email }, ...payload };
});

/**
 * Crea un usuario nuevo (usado por seeding/`/usuarios`, no expuesto en el
 * login). Hashea el password con argon2id.
 */
export async function createUserWithPassword(email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [user] = await dbAdmin.insert(users).values({ email, passwordHash }).returning();
  await dbAdmin.insert(profiles).values({ id: user.id, email });
  return user;
}
