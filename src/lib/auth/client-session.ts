import type { AppRole } from "@/lib/actions/auth";

/** Forma de perfil que consume el cliente (snake_case legado de la UI). */
export interface ClientUserProfile {
  id: string;
  email: string;
  nombre_completo: string | null;
  sucursal_id: string | null;
  unidad_negocio_id: string | null;
  is_admin: boolean;
  unidades_negocio_ids?: string[];
  sucursales_ids?: string[];
}

export interface ClientSessionUser {
  id: string;
  email: string;
}

export interface InitialAuth {
  user: ClientSessionUser;
  profile: ClientUserProfile;
  role: AppRole | null;
}

/** Mapea el profile Drizzle (camelCase) al shape del cliente — usable en RSC y cliente. */
export function toUserProfile(profile: {
  id: string;
  email: string;
  nombreCompleto: string | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  isAdmin: boolean;
  unidadesNegocioIds: string[];
  sucursalesIds: string[];
}): ClientUserProfile {
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
