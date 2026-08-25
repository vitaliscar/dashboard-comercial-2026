"use server";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import {
  users,
  sessions,
  profiles,
  userRoles,
  profileUnidadesNegocio,
  profileSucursales,
} from "@/db/schema";
import { authRateLimiter } from "@/lib/rate-limiter";
import { verifyPassword } from "@/lib/auth/password";
import { sessionExpiryDate, isSessionExpired, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { logAuthFailure } from "@/lib/logger";

export type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

const isProd = process.env.NODE_ENV === "production";

/** Hash argon2id de un password dummy — iguala el costo de verify cuando el email no existe (anti-timing). */
const DUMMY_PASSWORD_HASH =
  process.env.AUTH_DUMMY_PASSWORD_HASH ??
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

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

async function clientMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    const userAgent = h.get("user-agent") || undefined;
    return { ip, userAgent };
  } catch {
    return {};
  }
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

  const sucursalBridgeRows = await dbAdmin
    .select({ sucursalId: profileSucursales.sucursalId })
    .from(profileSucursales)
    .where(eq(profileSucursales.profileId, userId));

  const sucursalesIds =
    sucursalBridgeRows.length > 0
      ? sucursalBridgeRows.map((r) => r.sucursalId)
      : profile.sucursalId
        ? [profile.sucursalId]
        : [];

  let role: AppRole | null = null;
  if (profile.isAdmin) {
    role = "gerencia";
  } else {
    const priority: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];
    const roleNames = roles.map((r) => r.role);
    role = priority.find((rr) => roleNames.includes(rr)) ?? null;
  }

  return { profile: { ...profile, unidadesNegocioIds, sucursalesIds }, role };
}

export async function loginAction(data: { email: string; password: string }) {
  const fail = (error: string) => ({ error, user: null, profile: null, role: null }) as const;
  const meta = await clientMeta();

  const cleanEmail = (data.email || "").trim().toLowerCase();
  // No hacer trim del password: espacios significativos deben preservarse (CN-033).
  const cleanPassword = data.password || "";

  const rateKey = [cleanEmail || "unknown", meta.ip || "noip"].join("|");
  const limitCheck = authRateLimiter.isRateLimited(rateKey);
  if (limitCheck.limited) {
    logAuthFailure(cleanEmail || "unknown", "rate_limited", meta);
    return fail("Demasiados intentos de inicio de sesión. Por favor, intente más tarde.");
  }

  const [user] = await dbAdmin.select().from(users).where(eq(users.email, cleanEmail)).limit(1);

  // Siempre verificar contra un hash (real o dummy) para no filtrar existencia por timing (CN-031).
  const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await verifyPassword(hashToVerify, cleanPassword);

  if (!user || !user.isActive || !valid) {
    const reason = !user ? "unknown_user" : !user.isActive ? "inactive" : "bad_password";
    logAuthFailure(cleanEmail || "unknown", reason, meta);
    return fail("Correo o contraseña incorrectos.");
  }

  const payload = await loadAuthPayload(user.id);
  if (!payload) {
    logAuthFailure(cleanEmail, "missing_profile", meta);
    return fail("No se pudo cargar el perfil del usuario.");
  }

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
export const getCurrentSession = cache(async () => {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  try {
    const [session] = await dbAdmin
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session || isSessionExpired(session.expiresAt)) {
      try {
        store.delete(SESSION_COOKIE_NAME);
      } catch {
        // Cookie deletion is only allowed in Server Actions / Route Handlers.
      }
      return null;
    }

    const [user] = await dbAdmin.select().from(users).where(eq(users.id, session.userId)).limit(1);
    // CN-026: usuarios desactivados no conservan sesión válida.
    if (!user || !user.isActive) {
      await dbAdmin.delete(sessions).where(eq(sessions.userId, session.userId));
      try {
        store.delete(SESSION_COOKIE_NAME);
      } catch {
        // Ignore cookie deletion errors in read-only render context
      }
      return null;
    }

    const payload = await loadAuthPayload(session.userId);
    if (!payload) return null;

    return { user: { id: user.id, email: user.email }, ...payload };
  } catch (error) {
    console.error("Error validando sesión:", error);
    try {
      store.delete(SESSION_COOKIE_NAME);
    } catch {
      // Ignore cookie deletion errors in context where cookies are read-only
    }
    return null;
  }
});

export async function meAction() {
  return getCurrentSession();
}
