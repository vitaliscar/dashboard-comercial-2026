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
  | "simulador";

const MODULE_ACCESS: Record<ModuleKey, AppRole[]> = {
  resumen: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  dashboard: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  minutas: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  cobranzas: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  pareto: ["gerencia", "gerente_comercial"],
  asesores: ["gerencia", "gerente_comercial", "coordinador"],
  alertas: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  embudo: ["gerencia", "gerente_comercial"],
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
  comisiones: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
  simulador: ["gerencia", "gerente_comercial"],
};

export function canAccessModule(role: AppRole | null, module: ModuleKey): boolean {
  if (!role) return false;
  return MODULE_ACCESS[module].includes(role);
}

export function getModulesForRole(role: AppRole | null): ModuleKey[] {
  if (!role) return [];
  return (Object.keys(MODULE_ACCESS) as ModuleKey[]).filter((m) => MODULE_ACCESS[m].includes(role));
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
      return false;
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
