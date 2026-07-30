"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { roleLabel } from "@/lib/format";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  GitBranch,
  BellRing,
  Upload,
  Users,
  LogOut,
  Menu,
  FileDown,
  Award,
  Wrench,
  Search,
  UserSearch,
  Percent,
  Calculator,
  Building2,
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
}

const NAV: NavItem[] = [
  { to: "/resumen", label: "Resumen", icon: LayoutDashboard, module: "resumen" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/minutas", label: "Minutas", icon: ClipboardList, module: "minutas" },
  { to: "/cobranzas", label: "Cobranzas", icon: Wallet, module: "cobranzas" },
  { to: "/embudo", label: "Embudo", icon: GitBranch, module: "embudo" },
  { to: "/pareto", label: "Pareto", icon: GitBranch, module: "pareto" },
  { to: "/asesores", label: "Asesores", icon: Award, module: "asesores" },
  { to: "/cliente-360", label: "Clientes", icon: UserSearch, module: "cliente_360" },
  { to: "/comisiones", label: "Comisiones", icon: Percent, module: "comisiones" },
  { to: "/simulador", label: "Simulador", icon: Calculator, module: "simulador" },
  { to: "/alertas", label: "Alertas", icon: BellRing, module: "alertas" },
  { to: "/carga", label: "Cargar Excel", icon: Upload, module: "carga" },
  { to: "/usuarios", label: "Usuarios", icon: Users, module: "usuarios" },
] as const;

const UNIT_ROUTE_MAP = {
  "/servicios": "servicios",
  "/lubfiltros": "lubricantes/filtros",
  "/equipos": "equipos",
  "/alquiler": "alquiler",
  "/repuestos": "repuestos",
} as const;

const UNIT_NAV: NavItem[] = [
  { to: "/servicios", label: "Servicios", icon: Wrench, module: "servicios" },
  { to: "/lubfiltros", label: "Lub / Filtros", icon: Wrench, module: "lubfiltros" },
  { to: "/equipos", label: "Equipos", icon: Wrench, module: "equipos" },
  { to: "/alquiler", label: "Alquiler", icon: Wrench, module: "alquiler" },
  { to: "/repuestos", label: "Repuestos", icon: Wrench, module: "repuestos" },
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
} as const;

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

  const items = [...NAV.filter((item) => canAccessModule(role, item.module)), ...visibleUnitNav];
  const canUploadExcel = canAccessModule(role, "carga");
  const canExportPdf = role === "gerencia" || role === "gerente_comercial";

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* ── Sidebar: collapsed 56px → expanded 220px on hover ─────────── */}
      <aside
        ref={sidebarRef}
        aria-label="Navegación principal"
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        className={cn(
          "no-print fixed lg:sticky top-0 z-40 h-screen flex flex-col overflow-hidden",
          "bg-sidebar border-r border-sidebar-border",
          "transition-[width,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          // Mobile: slide in/out
          open ? "translate-x-0 w-[220px]" : "-translate-x-full lg:translate-x-0",
          // Desktop: collapsed by default, expand on hover
          "lg:w-[56px] lg:hover:w-[220px] lg:group/sidebar",
        )}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border shrink-0 min-w-[220px]">
          <img src="/Logo_CCV.png" alt="CCV" className="size-8 object-contain shrink-0" />
          <div className="min-w-0 opacity-0 lg:group-hover/sidebar:opacity-100 transition-opacity duration-150">
            <div className="font-display font-bold text-sidebar-foreground text-sm leading-tight">
              CCV
            </div>
            <div className="text-[9px] tracking-widest text-primary font-display font-bold uppercase">
              {roleLabel(role)}
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0">
          <div className="space-y-0.5 px-2 min-w-[220px]">
            {items.map((n) => {
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
                    "border-l-2",
                    active
                      ? "border-l-primary bg-primary/10 text-primary font-semibold"
                      : "border-l-transparent text-sidebar-accent-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <n.icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-primary" : "text-sidebar-accent-foreground/50",
                    )}
                  />
                  <span className="opacity-0 lg:group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
                    {n.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom: sign out + avatar */}
        <div className="shrink-0 border-t border-sidebar-border px-2 py-2 space-y-0.5 min-w-[220px]">
          <Link
            href="/auth"
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="flex items-center gap-3 px-2 py-2 rounded-md font-display text-sm text-sidebar-accent-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-[background-color,color] duration-150 border-l-2 border-l-transparent"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="opacity-0 lg:group-hover/sidebar:opacity-100 transition-opacity duration-150 whitespace-nowrap">
              Cerrar sesión
            </span>
          </Link>

          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-7 rounded-full bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-primary font-display font-bold text-xs shrink-0">
              {profile?.nombre_completo?.[0]?.toUpperCase() ??
                profile?.email?.[0]?.toUpperCase() ??
                "U"}
            </div>
            <div className="min-w-0 flex-1 opacity-0 lg:group-hover/sidebar:opacity-100 transition-opacity duration-150">
              <div className="text-xs font-semibold text-sidebar-foreground truncate">
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
                onClick={() => window.print()}
                aria-label="Exportar PDF"
                className="border-border bg-transparent hover:bg-accent"
              >
                <FileDown className="size-4" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </Button>
            )}

            {/* Sucursal badge */}
            <div
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-accent/40 border border-border px-2 sm:px-2.5 py-1 rounded-md max-w-[120px] sm:max-w-[200px] truncate"
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
