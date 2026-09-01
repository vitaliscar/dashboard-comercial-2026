"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearSharedFilters } from "@/lib/shared-filters";

export type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

export interface UserProfile {
  id: string;
  email: string;
  nombre_completo: string | null;
  sucursal_id: string | null;
  unidad_negocio_id: string | null;
  is_admin: boolean;
  unidades_negocio_ids?: string[];
  sucursales_ids?: string[];
}

interface SessionUser {
  id: string;
  email: string;
}

interface AuthPayload {
  user: SessionUser;
  profile: {
    id: string;
    email: string;
    nombreCompleto: string | null;
    sucursalId: string | null;
    unidadNegocioId: string | null;
    isAdmin: boolean;
    unidadesNegocioIds: string[];
    sucursalesIds: string[];
  };
  role: AppRole | null;
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
  sucursalesIds: string[];
}): UserProfile {
  return {
    id: profile.id,
    email: profile.email,
    nombre_completo: profile.nombreCompleto,
    sucursal_id: profile.sucursalId,
    unidad_negocio_id: profile.unidadNegocioId,
    is_admin: profile.isAdmin,
    unidades_negocio_ids: profile.unidadesNegocioIds,
    sucursales_ids: profile.sucursalesIds,
  };
}

async function requestAuth(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

async function readAuthPayload(response: Response): Promise<AuthPayload | null> {
  if (!response.ok) return null;
  const payload = (await response.json()) as AuthPayload;
  return payload?.user && payload?.profile ? payload : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromMe = async () => {
    try {
      const me = await readAuthPayload(await requestAuth("/me"));
      if (me) {
        setSession(me.user);
        setProfile(toUserProfile(me.profile));
        setRole(me.role);
        return;
      }
    } catch {
      // The demo shell remains usable while the API is unavailable.
    }
    {
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
      try {
        const response = await requestAuth("/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        const result = await readAuthPayload(response);
        if (!result) {
          const body = (await response.clone().json().catch(() => null)) as { message?: string } | null;
          return { error: new Error(body?.message ?? "Correo o contraseña incorrectos.") };
        }
        setSession(result.user);
        setProfile(toUserProfile(result.profile));
        setRole(result.role);
        return { error: null };
      } catch {
        return { error: new Error("No se pudo conectar con el servidor de autenticación.") };
      }
    },
    signOut: async () => {
      clearSharedFilters();
      await requestAuth("/logout", { method: "POST" }).catch(() => {});
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
