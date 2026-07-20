import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { roleLabel } from "@/lib/format";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  TrendingUp,
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
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { canAccessModule, type ModuleKey } from "@/lib/permissions";
import { StatusPill } from "@/components/status-pill";
import { CommandPalette } from "@/components/command-palette";
import { Kbd } from "@/components/ui/kbd";

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
  { to: "/pareto", label: "Pareto 80/20", icon: TrendingUp, module: "pareto" },
  { to: "/asesores", label: "Asesores", icon: Award, module: "asesores" },
  { to: "/cliente-360", label: "Cliente 360°", icon: UserSearch, module: "cliente_360" },
  { to: "/comisiones", label: "Comisiones", icon: Percent, module: "comisiones" },
  { to: "/simulador", label: "Simulador", icon: Calculator, module: "simulador" },
  { to: "/alertas", label: "Alertas", icon: BellRing, module: "alertas" },
  { to: "/carga", label: "Cargar Excel", icon: Upload, module: "carga" },
  { to: "/usuarios", label: "Usuarios", icon: Users, module: "usuarios" },
];

// Unit-specific routes visible only when the GC has that unit assigned.
// Repuestos has no dedicated nav entry/route — it's handled inside the general
// dashboard (/gerencia-nacional) filtered by unit, like any multi-unit GC would see it.
// Map route path -> canonical unidad_negocio_id
const UNIT_ROUTE_MAP: Record<string, string> = {
  "/servicios": "9c322ad9-75af-4f88-912e-182e708264d3",
  "/lubfiltros": "bd01d86c-c8a5-488a-9afc-141d242b9325",
  "/equipos": "78e09e03-c1aa-4ed5-8755-8310102f5220",
  "/alquiler": "825146fc-ab6d-4f9c-97d4-2078f3e67549",
};

const UNIT_NAV: NavItem[] = [
  { to: "/servicios", label: "Servicios", icon: Wrench, module: "servicios" },
  { to: "/lubfiltros", label: "Lub / Filtros", icon: Wrench, module: "lubfiltros" },
  { to: "/equipos", label: "Equipos", icon: Wrench, module: "equipos" },
  { to: "/alquiler", label: "Alquiler", icon: Wrench, module: "alquiler" },
];

const NAV_ACTIVE_ALIASES: Record<string, string[]> = {
  "/dashboard": ["/gerencia-nacional", "/coordinador", "/sucursal", "/asesor"],
};

function isNavItemActive(currentPath: string, itemPath: string): boolean {
  if (currentPath === itemPath || currentPath.startsWith(itemPath + "/")) {
    return true;
  }

  const aliases = NAV_ACTIVE_ALIASES[itemPath] ?? [];
  return aliases.some(
    (aliasPath) => currentPath === aliasPath || currentPath.startsWith(aliasPath + "/"),
  );
}

const PAGE_TITLES: Record<string, string> = {
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
  "/cliente-360": "Cliente 360°",
  "/comisiones": "Comisiones Proyectadas",
  "/simulador": "Simulador de Presupuesto",
};

function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? "Dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const { filters } = useSharedFilters();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data: sucursales } = useSucursales();

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

  // Build dynamic nav: unit-specific routes filtered by role and assigned units
  const assignedUnitIds = profile?.unidades_negocio_ids ?? [];
  const visibleUnitNav = UNIT_NAV.filter((item) => {
    if (!canAccessModule(role, item.module)) return false;
    // Gerencia sees all unit routes
    if (role === "gerencia") return true;
    // Coordinador can see unit routes where they have access (module check is enough)
    if (role === "coordinador") return true;
    // GC only sees routes for their assigned units
    if (role === "gerente_comercial") {
      const unitId = UNIT_ROUTE_MAP[item.to];
      return unitId ? assignedUnitIds.includes(unitId) : false;
    }
    return false;
  });

  const items = [...NAV.filter((item) => canAccessModule(role, item.module)), ...visibleUnitNav];
  const canUploadExcel = canAccessModule(role, "carga");
  const canExportPdf = role === "gerencia" || role === "gerente_comercial";

  const handleSignOut = async () => {
    await signOut();
    nav({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "no-print fixed lg:sticky top-0 z-40 h-screen w-60 bg-sidebar border-r border-border flex flex-col overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-6 py-6 mb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img src="/logo-ccv.png" alt="CCV" className="size-9 object-contain" />
            <div>
              <div className="font-display font-bold text-sidebar-foreground text-lg leading-tight">
                CCV
              </div>
              <div className="text-[10px] tracking-widest text-sidebar-accent-foreground/70 font-display font-bold">
                {roleLabel(role)}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 pt-2">
          {items.map((n) => {
            const active = isNavItemActive(loc.pathname, n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 font-display text-sm tracking-wide transition-[background-color,color,border-color,transform] duration-150 ease-out border rounded-lg",
                  active
                    ? "border-border bg-accent text-accent-foreground font-bold"
                    : "border-transparent text-sidebar-accent-foreground hover:border-border/30 hover:text-sidebar-foreground hover:bg-sidebar-accent/40",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4 px-3 space-y-1">
          <Link
            to="/auth"
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 font-display text-sm font-bold tracking-wide text-sidebar-accent-foreground border border-transparent rounded-lg hover:border-border/30 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 transition-[border-color,color,background-color]"
          >
            <LogOut className="size-4 shrink-0" />
            Cerrar sesión
          </Link>

          <div className="flex items-center gap-3 px-3 py-3 mt-2">
            <div className="size-8 rounded-full bg-sidebar-accent border border-border flex items-center justify-center text-sidebar-foreground font-display font-bold text-xs shrink-0">
              {profile?.nombre_completo?.[0]?.toUpperCase() ??
                profile?.email?.[0]?.toUpperCase() ??
                "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-sidebar-foreground truncate">
                {profile?.nombre_completo ?? "Usuario"}
              </div>
              <StatusPill kind="neutral">{roleLabel(role)}</StatusPill>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 bg-black/80 z-30 lg:hidden transition-opacity duration-200 ease-out",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print sticky top-0 z-20 h-16 bg-card border-b border-border flex items-center gap-4 px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </Button>

          <div className="flex items-center gap-6 flex-1 min-w-0">
            <h2 className="font-display font-black tracking-tight text-foreground text-lg truncate">
              {pageTitle(loc.pathname)}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex text-muted-foreground font-normal"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" />
              <span>Buscar</span>
              <Kbd className="ml-1">⌘K</Kbd>
            </Button>
            {canUploadExcel && (
              <Link
                to="/carga"
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                <Upload className="size-4" />
                <span className="hidden sm:inline">Cargar Excel</span>
              </Link>
            )}
            {canExportPdf && (
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <FileDown className="size-4" />
                <span className="hidden sm:inline">Exportar PDF</span>
              </Button>
            )}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-accent/40 border border-border px-2.5 py-1 rounded-md max-w-[200px] truncate">
              <span className="text-muted-foreground font-display font-bold text-[10px] uppercase tracking-wider">
                Sucursal:
              </span>
              <span className="font-display font-black text-[11px] uppercase tracking-wide truncate">
                {getSucursalLabel()}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pl-2 border-l border-border">
              <span className="w-2 h-2 bg-success border border-border online-indicator-pulse rounded-full"></span>
              <span className="font-display text-[10px] font-bold">Online</span>
            </div>
          </div>
        </header>

        <main id="print-area" className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
