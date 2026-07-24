"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { users, sessions, profiles, userRoles, profileUnidadesNegocio } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { sessionExpiryDate, isSessionExpired, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

const isProd = process.env.NODE_ENV === "production";

async function setSessionCookie(sessionId: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Misma forma que loadAuthPayload en la versión TanStack Start — profile + role + scope. */
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

export async function loginAction(data: { email: string; password: string }) {
  const fail = (error: string) => ({ error, user: null, profile: null, role: null }) as const;

  const [user] = await dbAdmin.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (!user || !user.isActive) return fail("Correo o contraseña incorrectos.");

  const valid = await verifyPassword(user.passwordHash, data.password);
  if (!valid) return fail("Correo o contraseña incorrectos.");

  const payload = await loadAuthPayload(user.id);
  if (!payload) return fail("No se pudo cargar el perfil del usuario.");

  const expiresAt = sessionExpiryDate();
  const [session] = await dbAdmin
    .insert(sessions)
    .values({ userId: user.id, expiresAt })
    .returning({ id: sessions.id });

  await setSessionCookie(session.id, expiresAt);

  return { error: null, user: { id: user.id, email: user.email }, ...payload };
}

export async function logoutAction() {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE_NAME)?.value;
  if (sessionId) {
    await dbAdmin.delete(sessions).where(eq(sessions.id, sessionId));
  }
  store.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

/** Lee la sesión actual — usable desde Server Components y Server Actions. */
export async function getCurrentSession() {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const [session] = await dbAdmin
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session || isSessionExpired(session.expiresAt)) {
    store.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const payload = await loadAuthPayload(session.userId);
  if (!payload) return null;

  const [user] = await dbAdmin.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;

  return { user: { id: user.id, email: user.email }, ...payload };
}

export async function meAction() {
  return getCurrentSession();
}
