"use client";

import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  GitBranch,
  BellRing,
  Upload,
  Users,
  Award,
  Wrench,
  UserSearch,
  type LucideIcon,
} from "lucide-react";

interface PaletteRoute {
  to: string;
  label: string;
  hint: string;
  group: string;
  module: ModuleKey;
  icon: LucideIcon;
  requiresAdmin?: boolean;
}

// Todas las rutas navegables de la app. La visibilidad real se filtra por rol
// vía canAccessModule — la misma fuente de verdad que app-shell.tsx.
const ROUTES: PaletteRoute[] = [
  { to: "/resumen", label: "Resumen", hint: "Pulso comercial", group: "Visión general", module: "resumen", icon: LayoutDashboard },
  { to: "/dashboard", label: "Dashboard", hint: "Vista por rol", group: "Visión general", module: "dashboard", icon: LayoutDashboard },
  { to: "/alertas", label: "Alertas", hint: "Riesgos abiertos", group: "Visión general", module: "alertas", icon: BellRing },
  { to: "/repuestos", label: "Repuestos", hint: "Unidad de negocio", group: "Unidades de negocio", module: "repuestos", icon: Wrench },
  { to: "/lubfiltros", label: "Lub / Filtros", hint: "Unidad de negocio", group: "Unidades de negocio", module: "lubfiltros", icon: Wrench },
  { to: "/servicios", label: "Servicios", hint: "Unidad de negocio", group: "Unidades de negocio", module: "servicios", icon: Wrench },
  { to: "/equipos", label: "Equipos", hint: "Unidad de negocio", group: "Unidades de negocio", module: "equipos", icon: Wrench },
  { to: "/alquiler", label: "Alquiler", hint: "Unidad de negocio", group: "Unidades de negocio", module: "alquiler", icon: Wrench },
  { to: "/embudo", label: "Embudo", hint: "Conversión comercial", group: "Gestión comercial", module: "embudo", icon: GitBranch },
  { to: "/cliente-360", label: "Clientes", hint: "Vista 360°", group: "Gestión comercial", module: "cliente_360", icon: UserSearch },
  { to: "/asesores", label: "Asesores", hint: "Fuerza de ventas", group: "Gestión comercial", module: "asesores", icon: Award },
  { to: "/minutas", label: "Minutas", hint: "Compromisos", group: "Gestión comercial", module: "minutas", icon: ClipboardList },
  { to: "/cobranzas", label: "Cobranzas", hint: "Cartera y mora", group: "Finanzas", module: "cobranzas", icon: Wallet },
  { to: "/evaluacion", label: "Evaluación", hint: "Desempeño", group: "Rendimiento", module: "evaluacion", icon: Award },
  { to: "/usuarios", label: "Usuarios", hint: "Roles y cobertura", group: "Administración", module: "usuarios", icon: Users },
  { to: "/carga", label: "Fuentes de datos", hint: "Carga operativa", group: "Administración", module: "carga", icon: Upload },
  {
    to: "/ajustes-manuales",
    label: "Ajustes manuales",
    hint: "Correcciones autorizadas",
    group: "Administración",
    module: "ajustes_manuales",
    icon: ClipboardList,
    requiresAdmin: true,
  },
];

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Paleta de comandos global (Ctrl+K / Cmd+K). Navegación filtrada por rol vía
 * canAccessModule — la misma fuente de verdad que el nav lateral de
 * app-shell.tsx. Ver docs/MASTER_STRATEGY.md §3.3 (F1).
 */
export function CommandPalette({ open, onOpenChange: setOpen }: CommandPaletteProps) {
  const { role, profile } = useAuth();
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const unitIds = profile?.unidades_negocio_ids?.length
    ? profile.unidades_negocio_ids
    : profile?.unidad_negocio_id
      ? [profile.unidad_negocio_id]
      : [];
  const unitRouteNames: Record<string, string> = {
    "/servicios": "servicios",
    "/lubfiltros": "lubricantes/filtros",
    "/equipos": "equipos",
    "/alquiler": "alquiler",
    "/repuestos": "repuestos",
  };
  const visibleRoutes = ROUTES.filter((r) => {
    if (!canAccessModule(role, r.module)) return false;
    if (r.requiresAdmin && !profile?.is_admin) return false;
    if (role === "gerente_comercial" && unitRouteNames[r.to]) {
      const unitId = unidades?.find(
        (unit) => unit.nombre.trim().toLowerCase() === unitRouteNames[r.to],
      )?.id;
      return unitId ? unitIds.includes(unitId) : false;
    }
    return true;
  });
  const groups = [...new Set(visibleRoutes.map((route) => route.group))];
  const branchIds = profile?.sucursales_ids?.length
    ? profile.sucursales_ids
    : profile?.sucursal_id
      ? [profile.sucursal_id]
      : [];
  const branchLabel = sucursales
    ?.filter((branch) => branchIds.includes(branch.id))
    .map((branch) => branch.nombre)
    .join(" · ");
  const unitLabel = unidades
    ?.filter((unit) => unitIds.includes(unit.id))
    .map((unit) => unit.nombre)
    .join(" · ");
  const scopeLabel =
    role === "gerente_comercial"
      ? `Unidad: ${unitLabel || "sin unidad asignada"}`
      : role === "coordinador" || role === "asesor"
        ? `Sucursal: ${branchLabel || "sin sucursal asignada"}`
        : "Alcance: todas las sucursales";

  const go = (to: string) => {
    setOpen(false);
    setLocation(to);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Paleta de comandos"
      description={scopeLabel}
    >
      <CommandInput placeholder="Buscar por módulo, grupo o tarea…" aria-label="Buscar módulo" />
      <p className="px-3 pt-2 text-[11px] text-muted-foreground">{scopeLabel}</p>
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {visibleRoutes
              .filter((route) => route.group === group)
              .map((route) => (
                <CommandItem
                  key={route.to}
                  value={`${route.label} ${route.group} ${route.hint}`}
                  onSelect={() => go(route.to)}
                >
                  <route.icon className="size-4" />
                  <span className="flex min-w-0 flex-col">
                    <span>{route.label}</span>
                    <span className="text-xs text-muted-foreground">{route.hint}</span>
                  </span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
