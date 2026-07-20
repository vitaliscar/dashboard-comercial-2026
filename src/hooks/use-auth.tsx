import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string, userEmail?: string | null) => {
    const [{ data: p }, { data: r }, { data: un }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profile_unidades_negocio").select("unidad_negocio_id").eq("profile_id", uid),
    ]);

    const profileData = (p as UserProfile) ?? null;
    if (profileData) {
      const bridgeIds = (un ?? []).map((x) => x.unidad_negocio_id);
      profileData.unidades_negocio_ids =
        bridgeIds.length > 0
          ? bridgeIds
          : profileData.unidad_negocio_id
            ? [profileData.unidad_negocio_id]
            : [];
    }
    setProfile(profileData);

    if (profileData?.is_admin) {
      setRole("gerencia");
      return;
    }

    const priority: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];
    const roles = (r ?? []).map((x: { role: AppRole }) => x.role);
    const highest = priority.find((rr) => roles.includes(rr)) ?? null;
    setRole(highest);
  };

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id, s.user.email), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    // Set 5s timeout to prevent hanging if Supabase is unreachable
    timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user)
          loadProfile(data.session.user.id, data.session.user.email).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
            setLoading(false);
          });
        else {
          if (timeoutId) clearTimeout(timeoutId);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to get session:", error);
        if (timeoutId) clearTimeout(timeoutId);
        setLoading(false);
      });

    return () => {
      sub.subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    loading,
    signIn: async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error };
      if (data.session?.user) {
        setSession(data.session);
        await loadProfile(data.session.user.id, data.session.user.email);
      }
      return { error: null };
    },
    signOut: async () => {
      clearSharedFilters();
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id, session.user.email);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
