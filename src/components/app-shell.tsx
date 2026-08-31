"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { roleLabel } from "@/lib/format";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  LayoutDashboard,
  BarChart3,
  Bell,
  Funnel,
  Users,
  UserCheck,
  FileText,
  Calculator,
  Receipt,
  BadgeDollarSign,
  PieChart,
  Wrench,
  Truck,
  Droplet,
  Package,
  KeyRound,
  FileUp,
  UserCog,
  Upload,
  LogOut,
  Menu,
  FileDown,
  Search,
  Building2,
  Megaphone,
  ChevronsLeft,
  ChevronsRight,
  FileBarChart,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";
import { StatusPill } from "@/components/status-pill";
import { CommandPalette } from "@/components/command-palette";
import { Kbd } from "@/components/ui/kbd";
import { useOnlineStatus } from "@/hooks/use-online-status";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  /** Además del módulo, exige profile.isAdmin (no basta con role="gerencia") —
   * para acciones sensibles que solo el administrador de la app debe ver,
   * aunque en el futuro haya más de un usuario con rol gerencia. */
  requiresAdmin?: boolean;
}

const UNIT_ROUTE_MAP = {
  "/servicios": "servicios",
  "/lubfiltros": "lubricantes/filtros",
  "/equipos": "equipos",
  "/alquiler": "alquiler",
  "/repuestos": "repuestos",
} as const;

const UNIT_NAV: NavItem[] = [
  { to: "/repuestos", label: "Repuestos", icon: Package, module: "repuestos" },
  { to: "/lubfiltros", label: "Lub / Filtros", icon: Droplet, module: "lubfiltros" },
  { to: "/servicios", label: "Servicios", icon: Wrench, module: "servicios" },
  { to: "/equipos", label: "Equipos", icon: Truck, module: "equipos" },
  { to: "/alquiler", label: "Alquiler", icon: KeyRound, module: "alquiler" },
] as const;

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Visión General",
    items: [
      { to: "/resumen", label: "Resumen", icon: BarChart3, module: "resumen" },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
      { to: "/alertas", label: "Alertas", icon: Bell, module: "alertas" },
    ],
  },
  {
    title: "Gestión Comercial y Ventas",
    items: [
      { to: "/embudo", label: "Embudo", icon: Funnel, module: "embudo" },
      { to: "/cliente-360", label: "Clientes", icon: Users, module: "cliente_360" },
      { to: "/asesores", label: "Asesores", icon: UserCheck, module: "asesores" },
      { to: "/minutas", label: "Minutas", icon: FileText, module: "minutas" },
      { to: "/simulador", label: "Simulador", icon: Calculator, module: "simulador" },
    ],
  },
  {
    title: "Finanzas y Rendimiento",
    items: [
      { to: "/cobranzas", label: "Cobranzas", icon: Receipt, module: "cobranzas" },
      { to: "/comisiones", label: "Comisiones", icon: BadgeDollarSign, module: "comisiones" },
      { to: "/pareto", label: "Pareto", icon: PieChart, module: "pareto" },
    ],
  },
  {
    title: "Mercadeo",
    items: [{ to: "/mercadeo", label: "Mercadeo", icon: Megaphone, module: "mercadeo" }],
  },
  {
    title: "Evaluación de Desempeño",
    items: [
      {
        to: "/evaluacion/asesor",
        label: "Mi Evaluación",
        icon: FileBarChart,
        module: "evaluacion_asesor",
      },
      {
        to: "/evaluacion/sucursal",
        label: "Evaluación Sucursal",
        icon: FileBarChart,
        module: "evaluacion_sucursal",
      },
      {
        to: "/evaluacion/unidad",
        label: "Evaluación Unidad",
        icon: FileBarChart,
        module: "evaluacion_unidad",
      },
    ],
  },
  // "Unidad de Negocios" se arma en runtime a partir de
  // UNIT_NAV filtrado por unidades asignadas — ver visibleUnitNav.
  {
    title: "Administración y Datos",
    items: [
      { to: "/carga", label: "Cargar Excel", icon: FileUp, module: "carga" },
      { to: "/usuarios", label: "Usuarios", icon: UserCog, module: "usuarios" },
      {
        to: "/ajustes-manuales",
        label: "Ajustes Manuales",
        icon: FileBarChart,
        module: "ajustes_manuales",
        requiresAdmin: true,
      },
    ],
  },
] as const;

const NAV_ACTIVE_ALIASES = {
  "/dashboard": ["/gerencia-nacional", "/coordinador", "/sucursal", "/asesor"],
} as const;

function isNavItemActive(currentPath: string, itemPath: string): boolean {
  if (currentPath === itemPath) return true;
  if (currentPath.startsWith(itemPath + "/")) return true;
  const aliases = NAV_ACTIVE_ALIASES[itemPath as keyof typeof NAV_ACTIVE_ALIASES];
  if (!aliases) return false;
  for (const aliasPath of aliases) {
    if (currentPath === aliasPath || currentPath.startsWith(aliasPath + "/")) return true;
  }
  return false;
}

const PAGE_TITLES = {
  "/resumen": "Resumen",
  "/dashboard": "Dashboard",
  "/gerencia-nacional": "Dashboard Comercial",
  "/coordinador": "Panel Coordinador",
  "/sucursal": "Panel Sucursal",
  "/asesor": "Mi Panel",
  "/cobranzas": "Cobranzas",
  "/minutas": "Minutas",
  "/embudo": "Embudo Comercial",
  "/pareto": "Análisis Pareto",
  "/asesores": "Análisis de Asesores",
  "/alertas": "Alertas",
  "/carga": "Carga de Datos",
  "/usuarios": "Usuarios",
  "/servicios": "Servicios",
  "/lubfiltros": "Lubricantes y Filtros",
  "/equipos": "Equipos",
  "/alquiler": "Alquiler",
  "/repuestos": "Repuestos",
  "/cliente-360": "Clientes",
  "/comisiones": "Comisiones Proyectadas",
  "/simulador": "Simulador de Presupuesto",
  "/evaluacion/asesor": "Mi Evaluación de Desempeño",
  "/evaluacion/sucursal": "Evaluación de Desempeño — Sucursal",
  "/evaluacion/unidad": "Evaluación de Desempeño — Unidad de Negocio",
  "/ajustes-manuales": "Ajustes Manuales",
} as const;

// Rutas que ya tienen su propia página de Evaluación de Desempeño con PDF real
// (Playwright) — el botón global "Exportar PDF" navega ahí en vez de imprimir
// crudo. El resto de las páginas cae al window.print() de siempre.
const EVALUACION_ROUTE_BY_PATH: Record<string, string> = {
  "/sucursal": "/evaluacion/sucursal",
  "/coordinador": "/evaluacion/unidad",
};

function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname as keyof typeof PAGE_TITLES] ?? "Dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const { profile, role, signOut } = useAuth();
  const { filters } = useSharedFilters();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Colapso del sidebar (solo desktop) — arranca sin animar y sin leer
  // localStorage para que coincida con el render del servidor; una vez
  // montado, sincroniza la preferencia guardada y recién ahí habilita la
  // transición, así no "flashea" un colapso animado en cada carga.
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("ccv-sidebar-collapsed") === "1");
    setCollapseReady(true);
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ccv-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "Tab" && sidebarRef.current) {
        const focusables = sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const getSucursalLabel = () => {
    if (!sucursales) return "...";
    if (role === "coordinador" || role === "asesor") {
      const userSuc = sucursales.find((s) => s.id === profile?.sucursal_id);
      return userSuc?.nombre ?? "Propia";
    }
    const selectedIds = filters?.sucursales ?? [];
    if (selectedIds.length === 0) return "Todas";
    const selectedNames = sucursales.filter((s) => selectedIds.includes(s.id)).map((s) => s.nombre);
    if (selectedNames.length === 0) return "Todas";
    return selectedNames.join(", ");
  };

  const assignedUnitIds = profile?.unidades_negocio_ids ?? [];
  const visibleUnitNav = UNIT_NAV.filter((item) => {
    if (!canAccessModule(role, item.module)) return false;
    if (role === "gerencia") return true;
    if (role === "coordinador") return true;
    if (role === "gerente_comercial") {
      const nombre = UNIT_ROUTE_MAP[item.to as keyof typeof UNIT_ROUTE_MAP];
      const unitId = unidades?.find((u) => u.nombre.trim().toLowerCase() === nombre)?.id;
      return unitId ? assignedUnitIds.includes(unitId) : false;
    }
    return false;
  });

  const [visionGeneral, gestionComercial, finanzas, mercadeo, administracion] = NAV_GROUPS.map(
    (group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          canAccessModule(role, item.module) && (!item.requiresAdmin || profile?.is_admin),
      ),
    }),
  );

  // Un gerente_comercial de una sola unidad (repuestos, servicios o
  // lubricantes/filtros) ya cae directo en la vista de su unidad al entrar a
  // "Dashboard" (ver src/app/(app)/dashboard/page.tsx) — mostrarle además un
  // link redundante a esa misma unidad bajo "Unidad de Negocios" no aporta.
  // Los gerentes multi-unidad (ej. Equipos + Alquiler) sí necesitan el grupo,
  // porque su "Dashboard" cae en /gerencia-nacional en vez de una unidad fija.
  const showUnitNavGroup = !(role === "gerente_comercial" && assignedUnitIds.length <= 1);

  const navGroups: NavGroup[] = [
    visionGeneral,
    ...(showUnitNavGroup ? [{ title: "Unidad de Negocios", items: visibleUnitNav }] : []),
    gestionComercial,
    finanzas,
    mercadeo,
    administracion,
  ].filter((group) => group.items.length > 0);

  const canUploadExcel = canAccessModule(role, "carga");
  const canExportPdf = role === "gerencia" || role === "gerente_comercial";

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Sidebar: 220px, colapsable a 56px en desktop ────────────────── */}
      <aside
        ref={sidebarRef}
        aria-label="Navegación principal"
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        style={{
          width: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-expanded-width)",
        }}
        className={cn(
          "no-print fixed lg:sticky top-0 z-40 h-screen flex flex-col overflow-hidden",
          "bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapseReady &&
            "lg:transition-[width] lg:duration-200 lg:ease-[cubic-bezier(0.32,0.72,0,1)]",
          // Mobile: slide in/out (el ancho colapsado solo aplica en desktop)
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo area */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-4 border-b border-sidebar-border shrink-0",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <img src="/Logo_CCV.png" alt="CCV" className="size-8 object-contain shrink-0" />
          <div className={cn("min-w-0", collapsed && "lg:hidden")}>
            <div className="font-display font-bold text-white text-sm leading-tight">CCV</div>
            <div className="text-[9px] tracking-widest text-primary font-display font-bold uppercase">
              {roleLabel(role)}
            </div>
          </div>
        </div>

        {/* Collapse toggle — solo desktop, el mobile usa el overlay completo */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={cn(
            "hidden lg:flex items-center gap-2 mx-2 mt-2 px-2 py-1.5 rounded-md shrink-0",
            "text-white/50 hover:text-white hover:bg-sidebar-accent/60",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            collapsed && "justify-center",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="size-4 shrink-0" />
          ) : (
            <ChevronsLeft className="size-4 shrink-0" />
          )}
          {!collapsed && <span className="text-xs font-display">Colapsar</span>}
        </button>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0">
          {navGroups.map((group, i) => (
            <div key={group.title} className={cn("px-2", i > 0 && "mt-3")}>
              <p
                className={cn(
                  "px-2 pb-1 text-[10px] font-display font-bold uppercase tracking-wider text-white/40",
                  collapsed && "lg:hidden",
                )}
              >
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((n) => {
                  const active = isNavItemActive(pathname, n.to);
                  return (
                    <Link
                      key={n.to}
                      href={n.to}
                      onClick={() => setOpen(false)}
                      title={n.label}
                      className={cn(
                        "flex items-center gap-3 px-2 py-2 rounded-md font-display text-sm tracking-wide",
                        "transition-[background-color,color] duration-150 ease-out",
                        active
                          ? "bg-primary/10 text-white font-semibold ring-1 ring-inset ring-primary/25"
                          : "text-white/70 hover:text-white hover:bg-sidebar-accent/60",
                        collapsed && "lg:justify-center",
                      )}
                    >
                      <n.icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-primary" : "text-sidebar-accent-foreground/50",
                        )}
                      />
                      <span className={cn("whitespace-nowrap", collapsed && "lg:hidden")}>
                        {n.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: sign out + avatar */}
        <div className="shrink-0 border-t border-sidebar-border px-2 py-2 space-y-0.5">
          <Link
            href="/auth"
            onClick={handleSignOut}
            title="Cerrar sesión"
            className={cn(
              "flex items-center gap-3 px-2 py-2 rounded-md font-display text-sm text-white/70 hover:text-white hover:bg-sidebar-accent/60 transition-[background-color,color] duration-150",
              collapsed && "lg:justify-center",
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span className={cn("whitespace-nowrap", collapsed && "lg:hidden")}>Cerrar sesión</span>
          </Link>

          <div
            className={cn("flex items-center gap-3 px-2 py-2", collapsed && "lg:justify-center")}
          >
            <div
              title={collapsed ? (profile?.nombre_completo ?? "Usuario") : undefined}
              className="size-7 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-primary font-display font-bold text-xs shrink-0"
            >
              {profile?.nombre_completo?.[0]?.toUpperCase() ??
                profile?.email?.[0]?.toUpperCase() ??
                "U"}
            </div>
            <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <div className="text-xs font-semibold text-white truncate">
                {profile?.nombre_completo ?? "Usuario"}
              </div>
              <StatusPill kind="neutral">{roleLabel(role)}</StatusPill>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-[2px] z-30 lg:hidden transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="no-print sticky top-0 z-20 h-14 bg-sidebar border-b border-sidebar-border flex items-center gap-2 sm:gap-4 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-sidebar-foreground"
            onClick={() => setOpen(true)}
            aria-label="Toggle menu"
          >
            <Menu />
          </Button>

          {/* Page title: eyebrow + name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <p className="text-[9px] font-mono font-bold tracking-[0.18em] text-primary uppercase leading-none mb-0.5">
                CCV · Comercial
              </p>
              <h2 className="font-display font-bold tracking-tight text-foreground text-sm sm:text-base truncate leading-tight">
                {pageTitle(pathname)}
              </h2>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex text-muted-foreground font-normal border-border bg-transparent hover:bg-accent"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" />
              <span>Buscar</span>
              <Kbd className="ml-1">⌘K</Kbd>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden text-muted-foreground"
              onClick={() => setPaletteOpen(true)}
              aria-label="Buscar"
            >
              <Search className="size-4" />
            </Button>

            {canUploadExcel && (
              <Link
                href="/carga"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "bg-secondary text-secondary-foreground border border-border hover:bg-accent",
                )}
              >
                <Upload className="size-4" />
                <span className="hidden sm:inline">Cargar Excel</span>
              </Link>
            )}

            {canExportPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const evaluacionRoute = EVALUACION_ROUTE_BY_PATH[pathname];
                  if (evaluacionRoute) {
                    router.push(evaluacionRoute);
                  } else {
                    window.print();
                  }
                }}
                aria-label="Exportar PDF"
                className="border-border bg-transparent hover:bg-accent"
              >
                <FileDown className="size-4" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </Button>
            )}

            {/* Sucursal badge */}
            <div
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-accent/40 border border-border px-2 sm:px-2.5 py-1 rounded-md max-w-30 sm:max-w-50 truncate"
              title={`Sucursal: ${getSucursalLabel()}`}
            >
              <Building2 className="size-3.5 text-primary shrink-0 sm:hidden" />
              <span className="hidden sm:inline text-muted-foreground font-display font-bold text-[10px] uppercase tracking-wider">
                Sucursal:
              </span>
              <span className="font-display font-black text-[11px] uppercase tracking-wide truncate">
                {getSucursalLabel()}
              </span>
            </div>

            {/* Online indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border">
              <span
                className={cn(
                  "w-2 h-2 border border-border rounded-full",
                  isOnline ? "bg-success online-indicator-pulse" : "bg-danger",
                )}
              />
              <span className="font-display text-[10px] font-bold">
                {isOnline ? "Online" : "Sin conexión"}
              </span>
            </div>
          </div>
        </header>

        <main id="print-area" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
