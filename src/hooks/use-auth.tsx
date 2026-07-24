"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loginAction, logoutAction, meAction, type AppRole } from "@/lib/actions/auth";
import { clearSharedFilters } from "@/lib/shared-filters";

export type { AppRole };

export interface UserProfile {
  id: string;
  email: string;
  nombre_completo: string | null;
  sucursal_id: string | null;
  unidad_negocio_id: string | null;
  is_admin: boolean;
  unidades_negocio_ids?: string[];
}

interface SessionUser {
  id: string;
  email: string;
}

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

function toUserProfile(profile: {
  id: string;
  email: string;
  nombreCompleto: string | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  isAdmin: boolean;
  unidadesNegocioIds: string[];
}): UserProfile {
  return {
    id: profile.id,
    email: profile.email,
    nombre_completo: profile.nombreCompleto,
    sucursal_id: profile.sucursalId,
    unidad_negocio_id: profile.unidadNegocioId,
    is_admin: profile.isAdmin,
    unidades_negocio_ids: profile.unidadesNegocioIds,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromMe = async () => {
    const me = await meAction();
    if (me) {
      setSession(me.user);
      setProfile(toUserProfile(me.profile));
      setRole(me.role);
    } else {
      setSession(null);
      setProfile(null);
      setRole(null);
    }
  };

  useEffect(() => {
    loadFromMe().finally(() => setLoading(false));
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
      setSession(result.user);
      setProfile(toUserProfile(result.profile));
      setRole(result.role);
      return { error: null };
    },
    signOut: async () => {
      clearSharedFilters();
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
