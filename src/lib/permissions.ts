import type { AppRole } from "@/hooks/use-auth";

export type ModuleKey =
  | "resumen"
  | "dashboard"
  | "minutas"
  | "cobranzas"
  | "pareto"
  | "asesores"
  | "alertas"
  | "embudo"
  | "mercadeo"
  | "carga"
  | "usuarios"
  | "gerencia_nacional"
  | "coordinador"
  | "asesor"
  | "servicios"
  | "lubfiltros"
  | "equipos"
  | "alquiler"
  | "sucursal"
  | "repuestos"
  | "cliente_360"
  | "comisiones"
  | "simulador"
  | "evaluacion_asesor"
  | "evaluacion_sucursal"
  | "evaluacion_unidad";

/**
 * Módulos ocultos en producción (NODE_ENV=production) independientemente del
 * rol — todavía en desarrollo/validación, no listos para los usuarios reales.
 * Quitar de aquí cuando estén listos para salir a producción.
 */
const MODULES_HIDDEN_IN_PRODUCTION: ModuleKey[] = ["comisiones", "simulador", "pareto", "mercadeo"];

const MODULE_ACCESS: Record<ModuleKey, AppRole[]> = {
  resumen: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  dashboard: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  minutas: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  cobranzas: ["gerencia", "gerente_comercial", "coordinador"],
  pareto: ["gerencia", "gerente_comercial"],
  asesores: ["gerencia", "gerente_comercial", "coordinador"],
  alertas: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  embudo: ["gerencia", "gerente_comercial"],
  mercadeo: ["gerencia"],
  carga: ["gerencia"],
  usuarios: ["gerencia"],
  gerencia_nacional: ["gerencia", "gerente_comercial"],
  coordinador: ["coordinador"],
  asesor: ["asesor"],
  servicios: ["gerencia", "gerente_comercial", "coordinador"],
  lubfiltros: ["gerencia", "gerente_comercial", "coordinador"],
  equipos: ["gerencia", "gerente_comercial", "coordinador"],
  alquiler: ["gerencia", "gerente_comercial", "coordinador"],
  sucursal: ["coordinador"],
  repuestos: ["gerencia", "gerente_comercial", "coordinador"],
  cliente_360: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  comisiones: ["gerencia", "gerente_comercial", "coordinador"],
  simulador: ["gerencia", "gerente_comercial"],
  evaluacion_asesor: ["asesor"],
  evaluacion_sucursal: ["gerencia", "gerente_comercial", "coordinador"],
  evaluacion_unidad: ["gerencia", "gerente_comercial", "coordinador"],
};

/**
 * Override en runtime cargado desde la tabla `role_module_access` (config
 * editable desde /usuarios) — reemplaza el MODULE_ACCESS estático de abajo
 * como fuente de verdad una vez que `setModuleAccessOverride` corrió al
 * cargar sesión (ver AuthProvider en use-auth.tsx). Null = todavía no cargó,
 * se usa el fallback estático para que el nav no parpadee vacío.
 *
 * Nota: esto es SOLO visibilidad de UI. El scope de datos (sucursal/unidad/
 * asesor) sigue resuelto 100% por RLS, no por esta tabla.
 */
let moduleAccessOverride: Record<string, boolean> | null = null;

function overrideKey(role: AppRole, module: ModuleKey) {
  return `${role}:${module}`;
}

export function setModuleAccessOverride(
  rows: { role: AppRole; module: string; canView: boolean }[],
) {
  const map: Record<string, boolean> = {};
  rows.forEach((r) => {
    map[`${r.role}:${r.module}`] = r.canView;
  });
  moduleAccessOverride = map;
}

export function canAccessModule(role: AppRole | null, module: ModuleKey): boolean {
  if (!role) return false;
  if (process.env.NODE_ENV === "production" && MODULES_HIDDEN_IN_PRODUCTION.includes(module)) {
    return false;
  }
  // Gerencia siempre tiene acceso total, sin importar la config — mismo
  // criterio que can_read_row() en RLS. Evita que un error de configuración
  // deje a gerencia sin poder entrar a /usuarios a corregirlo.
  if (role === "gerencia") return true;
  if (moduleAccessOverride) {
    return moduleAccessOverride[overrideKey(role, module)] ?? false;
  }
  return MODULE_ACCESS[module].includes(role);
}

export function getModulesForRole(role: AppRole | null): ModuleKey[] {
  if (!role) return [];
  return (Object.keys(MODULE_ACCESS) as ModuleKey[]).filter((m) => canAccessModule(role, m));
}

/**
 * User context containing role and scope information
 */
export interface UserContext {
  role: AppRole;
  sucursal?: string;
  unidad_negocio?: string;
  unidades_negocio?: string[];
  codigo_asesor?: string;
}

/**
 * Checks if a user with the given role can filter data by sucursal (branch)
 */
export function canFilterSucursal(context: UserContext): boolean {
  if (!context.role) return false;

  switch (context.role) {
    case "gerencia":
      return true;
    case "gerente_comercial":
      return true;
    case "coordinador":
      return true;
    case "asesor":
      return false;
    default:
      return false;
  }
}

/**
 * Checks if a user with the given role can filter data by unidad_negocio (business unit)
 */
export function canFilterUN(context: UserContext): boolean {
  if (!context.role) return false;

  switch (context.role) {
    case "gerencia":
      return true;
    case "gerente_comercial":
      return true;
    case "coordinador":
      return false;
    case "asesor":
      return false;
    default:
      return false;
  }
}

/**
 * Returns the list of sucursales (branches) accessible to the user
 */
export function getAccessibleSucursales(context: UserContext): string[] {
  if (!context.role) return [];

  switch (context.role) {
    case "gerencia":
      return [];
    case "gerente_comercial":
      return [];
    case "coordinador":
      return context.sucursal ? [context.sucursal] : [];
    case "asesor":
      return [];
    default:
      return [];
  }
}

/**
 * Returns the list of unidades_negocio (business units) accessible to the user
 */
export function getAccessibleUN(context: UserContext): string[] {
  if (!context.role) return [];

  switch (context.role) {
    case "gerencia":
      return [];
    case "gerente_comercial":
      if (context.unidades_negocio && context.unidades_negocio.length > 0) {
        return context.unidades_negocio;
      }
      return context.unidad_negocio ? [context.unidad_negocio] : [];
    case "coordinador":
      return [];
    case "asesor":
      return [];
    default:
      return [];
  }
}

/**
 * Returns the list of asesores (advisors) accessible to the user
 * - Gerencia: all asesores (empty array indicates all)
 * - Gerente Comercial: all asesores within their unidad_negocio (empty array indicates all in their unit)
 * - Coordinador: all asesores within their sucursal (empty array indicates all in their branch)
 * - Asesor: themselves only
 */
export function getAccessibleAsesores(context: UserContext): string[] {
  if (!context.role) return [];

  switch (context.role) {
    case "gerencia":
      // Empty array means access to all asesores
      return [];
    case "gerente_comercial":
      // Gerente Comercial can see all asesores in their unidad_negocio
      // Empty array signals to filter by UN in queries, not by individual asesor
      return [];
    case "coordinador":
      // Coordinador can see all asesores in their sucursal
      // Empty array signals to filter by sucursal in queries, not by individual asesor
      return [];
    case "asesor":
      // Asesor can only access their own data
      return context.codigo_asesor ? [context.codigo_asesor] : [];
    default:
      return [];
  }
}

/**
 * Checks if a user has permission to view all dashboard data
 * Only Gerencia can see everything
 */
export function canViewAllData(context: UserContext): boolean {
  return context.role === "gerencia";
}

/**
 * Checks if a user has permission to manage users
 * Only Gerencia can manage users
 */
export function canManageUsers(context: UserContext): boolean {
  return context.role === "gerencia";
}

/**
 * Checks if a user has permission to export data
 * Gerencia and Gerente Comercial can export
 */
export function canExportData(context: UserContext): boolean {
  return context.role === "gerencia" || context.role === "gerente_comercial";
}

/**
 * Checks if a user has permission to edit sales pipeline (carga)
 * Gerencia, Gerente Comercial, and Coordinador can edit
 * Asesor can only edit their own records (enforced at API level)
 */
export function canEditPipeline(context: UserContext): boolean {
  return (
    context.role === "gerencia" ||
    context.role === "gerente_comercial" ||
    context.role === "coordinador" ||
    context.role === "asesor"
  );
}

/**
 * Checks if a user has permission to view collections/cobranzas
 * All roles can view collections relevant to their scope
 */
export function canViewCollections(context: UserContext): boolean {
  return !!context.role;
}

/**
 * Checks if a user has permission to edit collections/cobranzas
 * Gerencia, Gerente Comercial, and Coordinador can edit
 * Asesor can edit their own records (enforced at API level)
 */
export function canEditCollections(context: UserContext): boolean {
  return (
    context.role === "gerencia" ||
    context.role === "gerente_comercial" ||
    context.role === "coordinador" ||
    context.role === "asesor"
  );
}

/**
 * Checks if a user has permission to view notes/minutas
 * All roles can view notes relevant to their scope
 */
export function canViewNotes(context: UserContext): boolean {
  return !!context.role;
}

/**
 * Checks if a user has permission to create notes/minutas
 * All roles can create notes
 */
export function canCreateNotes(context: UserContext): boolean {
  return !!context.role;
}

/**
 * Checks if a user has permission to view Pareto analysis
 * Gerencia and Gerente Comercial can view Pareto
 */
export function canViewPareto(context: UserContext): boolean {
  return context.role === "gerencia" || context.role === "gerente_comercial";
}

/**
 * Checks if a user has permission to view reports
 * All roles can view reports relevant to their scope
 */
export function canViewReports(context: UserContext): boolean {
  return !!context.role;
}

/**
 * Checks if a user has permission to create reports
 * Gerencia and Gerente Comercial can create reports
 */
export function canCreateReports(context: UserContext): boolean {
  return context.role === "gerencia" || context.role === "gerente_comercial";
}
