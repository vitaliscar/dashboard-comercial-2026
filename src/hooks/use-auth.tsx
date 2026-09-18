"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loginAction, logoutAction, meAction, type AppRole } from "@/lib/actions/auth";
import { clearSharedFilters } from "@/lib/shared-filters";
import { getRoleModuleAccessAction } from "@/lib/actions/permisos";
import { clearModuleAccessOverride, setModuleAccessOverride } from "@/lib/permissions";
import {
  toUserProfile,
  type ClientUserProfile,
  type ClientSessionUser,
  type InitialAuth,
} from "@/lib/auth/client-session";

export type { AppRole, InitialAuth };
export type UserProfile = ClientUserProfile;
export type SessionUser = ClientSessionUser;
export { toUserProfile };

interface AuthContextValue {
  session: SessionUser | null;
  user: SessionUser | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | undefined>(undefined);

/** Limpia estado de cliente que no debe cruzar de un usuario a otro. */
function resetClientAuthArtifacts(queryClient: ReturnType<typeof useQueryClient>) {
  clearSharedFilters();
  clearModuleAccessOverride();
  queryClient.clear();
}

/**
 * @param initialAuth
 * - `undefined` (omitido): hay que resolver sesión en cliente → loading inicial.
 * - `null`: el servidor ya confirmó que no hay sesión.
 * - objeto: hidratar de inmediato (sin flash de "sin rol" / acceso restringido).
 */
export function AuthProvider({
  children,
  initialAuth,
}: {
  children: ReactNode;
  initialAuth?: InitialAuth | null;
}) {
  const queryClient = useQueryClient();
  const serverResolved = initialAuth !== undefined;
  const [session, setSession] = useState<SessionUser | null>(() => initialAuth?.user ?? null);
  const [profile, setProfile] = useState<UserProfile | null>(() => initialAuth?.profile ?? null);
  const [role, setRole] = useState<AppRole | null>(() => initialAuth?.role ?? null);
  const [loading, setLoading] = useState(() => !serverResolved);

  const applyMe = async (me: Awaited<ReturnType<typeof meAction>>) => {
    if (me) {
      setSession(me.user);
      setProfile(toUserProfile(me.profile));
      setRole(me.role);
      try {
        setModuleAccessOverride(await getRoleModuleAccessAction());
      } catch {
        clearModuleAccessOverride();
      }
    } else {
      setSession(null);
      setProfile(null);
      setRole(null);
      clearModuleAccessOverride();
    }
  };

  const loadFromMe = async () => {
    await applyMe(await meAction());
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await meAction();
        if (cancelled) return;
        await applyMe(me);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar: la hidratación inicial viene de props del servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthContextValue = {
    session,
    user: session,
    profile,
    role,
    loading,
    signIn: async (email: string, password: string) => {
      const result = await loginAction({ email, password });
      if (result.error || !result.user || !result.profile) {
        return { error: new Error(result.error ?? "No se pudo iniciar sesión.") };
      }
      resetClientAuthArtifacts(queryClient);
      setSession(result.user);
      setProfile(toUserProfile(result.profile));
      setRole(result.role);
      try {
        setModuleAccessOverride(await getRoleModuleAccessAction());
      } catch {
        clearModuleAccessOverride();
      }
      return { error: null };
    },
    signOut: async () => {
      resetClientAuthArtifacts(queryClient);
      await logoutAction();
      setSession(null);
      setProfile(null);
      setRole(null);
    },
    refresh: async () => {
      await loadFromMe();
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
