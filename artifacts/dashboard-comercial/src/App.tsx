import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  ShieldAlert,
  Target,
  Truck,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getHealthCheckQueryKey,
  useHealthCheck,
} from "@workspace/api-client-react";
import type { UnidadKey } from "./lib/unidad-http";
import { useAuth } from "./hooks/use-auth";
import { useSucursales, useUnidades } from "./hooks/use-catalogos";
import { useSharedFilters } from "./hooks/use-shared-filters";
import {
  canAccessModule,
  canManageManualAdjustments,
  type ModuleKey,
} from "./lib/permissions";
import { unidadLabelInfo } from "./lib/unidad-labels";
import { AuthForm } from "./components/auth-form";
import { ProtectedShell } from "./components/protected-shell";
import { getAlertas } from "./lib/alertas-http";

// Code-splitting por ruta: cada rol solo descarga las páginas a las que
// tiene acceso (ver ROLE_MODULE_ACCESS), en vez de las 16 en el bundle
// inicial. Usuarios/Ajustes-manuales/Carga son exclusivas de gerencia y no
// deberían pesar en la carga inicial de un asesor o coordinador.
const ResumenPage = lazy(() => import("./pages/resumen"));
const UnidadLivePage = lazy(() => import("./pages/unidad-live"));
const CobranzasPage = lazy(() => import("./pages/cobranzas"));
const PresupuestosPage = lazy(() => import("./pages/presupuestos"));
const PresupuestoCoordinadorPage = lazy(
  () => import("./pages/presupuesto-coordinador"),
);
const AsesoresPage = lazy(() => import("./pages/asesores"));
const MinutasPage = lazy(() => import("./pages/minutas"));
const NuevaMinutaPage = lazy(() => import("./pages/minutas/nueva"));
const AlertasPage = lazy(() => import("./pages/alertas"));
const Cliente360Page = lazy(() => import("./pages/cliente-360"));
const EmbudoPage = lazy(() => import("./pages/embudo"));
const DashboardPage = lazy(() => import("./pages/dashboard"));
const GerenciaNacionalPage = lazy(() => import("./pages/gerencia-nacional"));
const SucursalPage = lazy(() => import("./pages/sucursal"));
const CoordinadorPage = lazy(() => import("./pages/coordinador"));
const AsesorPanelPage = lazy(() => import("./pages/asesor-panel"));
const EvaluacionPage = lazy(() => import("./pages/evaluacion"));
const EvaluacionAsesorPage = lazy(() => import("./pages/evaluacion-asesor"));
const EvaluacionSucursalPage = lazy(
  () => import("./pages/evaluacion-sucursal"),
);
const EvaluacionUnidadPage = lazy(() => import("./pages/evaluacion-unidad"));
const AjustesPage = lazy(() =>
  import("./pages/administracion").then((m) => ({ default: m.AjustesPage })),
);
const CargaPage = lazy(() =>
  import("./pages/administracion").then((m) => ({ default: m.CargaPage })),
);
const CommandPalette = lazy(() => import("./components/command-palette"));
const UsuariosPage = lazy(() =>
  import("./pages/administracion").then((m) => ({ default: m.UsuariosPage })),
);

export type Module = {
  path: string;
  accessKey: ModuleKey;
  label: string;
  group: string;
  icon: typeof BarChart3;
  description: string;
};

export type DemoRole =
  "administrador" | "director" | "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

const modules: Module[] = [
  {
    path: "/resumen",
    accessKey: "resumen",
    label: "Resumen",
    group: "Visión general",
    icon: BarChart3,
    description: "Pulso comercial consolidado",
  },
  {
    path: "/dashboard",
    accessKey: "dashboard",
    label: "Dashboard",
    group: "Visión general",
    icon: LayoutDashboard,
    description: "Vista ejecutiva por rol",
  },
  {
    path: "/alertas",
    accessKey: "alertas",
    label: "Alertas",
    group: "Visión general",
    icon: Bell,
    description: "Riesgos y oportunidades",
  },
  {
    path: "/embudo",
    accessKey: "embudo",
    label: "Embudo",
    group: "Gestión comercial",
    icon: Target,
    description: "Conversión de cotizaciones",
  },
  {
    path: "/cliente-360",
    accessKey: "cliente_360",
    label: "Clientes",
    group: "Gestión comercial",
    icon: Users,
    description: "Valor y actividad por cliente",
  },
  {
    path: "/asesores",
    accessKey: "asesores",
    label: "Asesores",
    group: "Gestión comercial",
    icon: UserCheck,
    description: "Rendimiento de la fuerza de ventas",
  },
  {
    path: "/minutas",
    accessKey: "minutas",
    label: "Minutas",
    group: "Gestión comercial",
    icon: FileText,
    description: "Compromisos y seguimiento",
  },
  {
    path: "/evaluacion",
    accessKey: "evaluacion",
    label: "Evaluación",
    group: "Rendimiento comercial",
    icon: BarChart3,
    description: "Cumplimiento y gestión por alcance",
  },
  {
    path: "/cobranzas",
    accessKey: "cobranzas",
    label: "Cobranzas",
    group: "Finanzas",
    icon: Receipt,
    description: "Cartera, mora y recuperación",
  },
  {
    path: "/presupuestos",
    accessKey: "presupuestos",
    label: "Presupuestos",
    group: "Finanzas",
    icon: Target,
    description: "Planeación y distribución de metas",
  },
  {
    path: "/servicios",
    accessKey: "servicios",
    label: "Servicios",
    group: "Unidades de negocio",
    icon: Wrench,
    description: "Talleres y servicios estratégicos",
  },
  {
    path: "/repuestos",
    accessKey: "repuestos",
    label: "Repuestos",
    group: "Unidades de negocio",
    icon: Package,
    description: "Ventas, meta e inventario",
  },
  {
    path: "/lubfiltros",
    accessKey: "lubfiltros",
    label: "Lub / Filtros",
    group: "Unidades de negocio",
    icon: Filter,
    description: "Desempeño por marca y sucursal",
  },
  {
    path: "/equipos",
    accessKey: "equipos",
    label: "Equipos",
    group: "Unidades de negocio",
    icon: Truck,
    description: "Facturación, pipeline e inventario",
  },
  {
    path: "/alquiler",
    accessKey: "alquiler",
    label: "Alquiler",
    group: "Unidades de negocio",
    icon: Building2,
    description: "Ocupación y rendimiento",
  },
  {
    path: "/carga",
    accessKey: "carga",
    label: "Fuentes de datos",
    group: "Administración",
    icon: FileSpreadsheet,
    description: "Estado de la conexión operativa",
  },
  {
    path: "/usuarios",
    accessKey: "usuarios",
    label: "Usuarios",
    group: "Administración",
    icon: Users,
    description: "Roles, permisos y cobertura",
  },
  {
    path: "/ajustes-manuales",
    accessKey: "ajustes_manuales",
    label: "Ajustes manuales",
    group: "Administración",
    icon: Settings,
    description: "Metas y correcciones autorizadas",
  },
];

const DEMO_ROLE_LABELS: Record<DemoRole, string> = {
  administrador: "Administrador",
  director: "Dirección",
  gerencia: "Gerencia",
  gerente_comercial: "Gerente comercial",
  coordinador: "Coordinador",
  asesor: "Asesor",
};

const DEMO_DASHBOARD_PATHS: Record<DemoRole, string> = {
  administrador: "/gerencia-nacional",
  director: "/gerencia-nacional",
  gerencia: "/gerencia-nacional",
  gerente_comercial: "/dashboard",
  coordinador: "/coordinador",
  asesor: "/asesor",
};

const DEMO_DASHBOARD_ALIASES: Record<string, DemoRole> = {
  "/gerencia-nacional": "gerencia",
  "/coordinador": "coordinador",
  "/sucursal": "coordinador",
  "/asesor": "asesor",
};

const DEMO_DASHBOARD_LABELS: Record<string, string> = {
  "/gerencia-nacional": "Dashboard Comercial",
  "/coordinador": "Panel Coordinador",
  "/sucursal": "Panel Sucursal",
  "/asesor": "Mi Panel",
};

function roleInitials(role: DemoRole) {
  return {
    administrador: "AD",
    director: "DI",
    gerencia: "GN",
    gerente_comercial: "GC",
    coordinador: "CO",
    asesor: "AS",
  }[role];
}

function AccessDenied({ role }: { role: DemoRole }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <section className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-400">
          <ShieldAlert size={22} />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Acceso restringido
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          Este módulo no corresponde a tu rol
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tu cuenta tiene el rol {DEMO_ROLE_LABELS[role]}. Contacta al
          administrador si necesitas acceso a esta vista.
        </p>
      </section>
    </div>
  );
}

const LIVE_UNIT_KEYS: Partial<Record<string, UnidadKey>> = {
  "/repuestos": "repuestos",
  "/lubfiltros": "lubfiltros",
  "/servicios": "servicios",
  "/equipos": "equipos",
  "/alquiler": "alquiler",
};

function UnitRoute({ unitKey }: { unitKey: UnidadKey }) {
  return <UnidadLivePage unitKey={unitKey} />;
}

// El gate de autenticación en DashboardApp garantiza que solo se llega aquí
// con una sesión real; estos componentes ya no necesitan un fallback demo.
function RoleDashboardRoute({ path, role }: { path: string; role: DemoRole }) {
  if (path === "/coordinador" && role === "coordinador")
    return <CoordinadorPage />;
  if (path === "/asesor" && role === "asesor") return <AsesorPanelPage />;
  if (path === "/sucursal" && role === "coordinador") return <SucursalPage />;
  if (
    path === "/gerencia-nacional" &&
    (role === "gerencia" || role === "director" || role === "administrador")
  )
    return <GerenciaNacionalPage />;
  return <AccessDenied role={role} />;
}

const UNIT_DISPLAY_BY_PATH: Record<string, string> = {
  "/servicios": "Servicios",
  "/repuestos": "Repuestos",
  "/lubfiltros": "Lub / Filtros",
  "/equipos": "Equipos",
  "/alquiler": "Alquiler",
};

function hasAssignedUnit(
  path: string,
  unitIds: string[],
  units: Array<{ id: string; nombre: string }> | undefined,
) {
  const label = UNIT_DISPLAY_BY_PATH[path];
  if (!label) return true;
  const assignedUnit = units?.find(
    (unit) => unidadLabelInfo(unit.nombre).label === label,
  );
  return Boolean(assignedUnit && unitIds.includes(assignedUnit.id));
}

function AuthenticatedModuleRoute({
  children,
  accessKey,
  path,
  role,
  unitIds,
  units,
  unitsLoading,
}: {
  children: React.ReactNode;
  accessKey: ModuleKey;
  path?: string;
  role: DemoRole;
  unitIds: string[];
  units: Array<{ id: string; nombre: string }> | undefined;
  unitsLoading: boolean;
}) {
  if (!canAccessModule(role, accessKey)) return <AccessDenied role={role} />;
  if (role === "gerente_comercial" && path && UNIT_DISPLAY_BY_PATH[path]) {
    if (unitsLoading)
      return (
        <div role="status" className="p-6 text-sm text-muted-foreground">
          Validando unidad asignada…
        </div>
      );
    if (!hasAssignedUnit(path, unitIds, units))
      return <AccessDenied role={role} />;
  }
  return <>{children}</>;
}

function modulePage(path: string, role: DemoRole) {
  if (path === "/resumen") return <ResumenPage />;
  const unitKey = LIVE_UNIT_KEYS[path];
  if (unitKey) return <UnitRoute unitKey={unitKey} />;
  switch (path) {
    case "/alertas":
      return <AlertasPage />;
    case "/cliente-360":
      return <Cliente360Page />;
    case "/embudo":
      return <EmbudoPage />;
    case "/cobranzas":
      return <CobranzasPage />;
    case "/presupuestos":
      return role === "coordinador" ? (
        <PresupuestoCoordinadorPage />
      ) : (
        <PresupuestosPage />
      );
    case "/asesores":
      return <AsesoresPage />;
    case "/minutas":
      return <MinutasPage />;
    case "/usuarios":
      return <UsuariosPage />;
    case "/ajustes-manuales":
      return <AjustesPage />;
    case "/carga":
      return <CargaPage />;
    default:
      return <AccessDenied role={role} />;
  }
}

function DashboardApp() {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasMenuOpen = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "Administración" (Usuarios/Ajustes-manuales/Carga) es el grupo menos
  // usado — colapsado por defecto reduce los 16 módulos planos que gerencia
  // ve de una sola vez (viola la Ley de Hick sin esto). Se auto-expande si
  // la ruta activa cae dentro, para no esconder dónde está el usuario.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["Administración"]),
  );
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const mobileSearchButtonRef = useRef<HTMLButtonElement>(null);
  const {
    session: authSession,
    profile: authProfile,
    role: authRole,
    loading: authLoading,
    signOut,
  } = useAuth();
  const { data: units, isLoading: unitsLoading } = useUnidades();
  const { data: sucursales } = useSucursales();
  const { filters } = useSharedFilters();
  const isLiveSession = !authLoading && Boolean(authSession && authRole);
  const apiHealth = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30_000,
      retry: 1,
    },
  });
  // La campana antes siempre decía "No hay nuevas notificaciones" sin
  // importar el estado real — un afiche falso que entrena a desconfiar de
  // toda señal futura. Ahora refleja el conteo real de alertas abiertas.
  const { data: openAlertsCount = 0 } = useQuery({
    queryKey: ["alertas", "open-count"],
    queryFn: async () =>
      (await getAlertas()).filter((a) => a.estado === "abierta").length,
    enabled: isLiveSession,
    refetchInterval: 60_000,
  });
  const current =
    modules.find((item) => location === item.path) ??
    modules.find((item) => item.path === "/dashboard")!;
  const currentLabel = DEMO_DASHBOARD_LABELS[location] ?? current.label;
  const groups = useMemo(
    () => [...new Set(modules.map((item) => item.group))],
    [],
  );
  // Sin sesión real, `authRole` es null; el gate de abajo impide que este
  // valor llegue a renderizarse, pero el hook debe ejecutarse siempre.
  const unitIds = authProfile?.unidades_negocio_ids?.length
    ? authProfile.unidades_negocio_ids
    : authProfile?.unidad_negocio_id
      ? [authProfile.unidad_negocio_id]
      : [];
  const branchIds = authProfile?.sucursales_ids?.length
    ? authProfile.sucursales_ids
    : authProfile?.sucursal_id
      ? [authProfile.sucursal_id]
      : [];
  const branchLabel = sucursales
    ?.filter((branch) => branchIds.includes(branch.id))
    .map((branch) => branch.nombre)
    .join(" · ");
  const selectedBranchLabel = sucursales
    ?.filter((branch) => filters.sucursales.includes(branch.id))
    .map((branch) => branch.nombre)
    .join(" · ");
  const unitLabel =
    units
      ?.filter((unit) => unitIds.includes(unit.id))
      .map((unit) => unidadLabelInfo(unit.nombre).label)
      .join(" · ") || "";
  const roleContextLabel =
    authRole === "gerente_comercial"
      ? `Unidad: ${unitLabel || "sin unidad asignada"} · ${filters.sucursales.length ? `Sucursales: ${selectedBranchLabel || "selección activa"}` : "todas las sucursales de la unidad"}`
      : authRole === "coordinador" || authRole === "asesor"
        ? `Sucursal: ${branchLabel || "sin sucursal asignada"}`
        : authRole === "gerencia" || authRole === "administrador"
          ? filters.sucursales.length
            ? `Sucursales: ${selectedBranchLabel || "selección activa"}`
            : "Alcance: todas las sucursales"
          : "Alcance: sin sesión";
  const accessibleModules = useMemo(
    () =>
      authRole
        ? modules.filter((item) => {
            if (
              !canAccessModule(authRole, item.accessKey) ||
              item.path === "/carga"
            )
              return false;
            if (
              item.path === "/ajustes-manuales" &&
              !canManageManualAdjustments(authRole, authProfile?.is_admin)
            )
              return false;
            return (
              authRole !== "gerente_comercial" ||
              hasAssignedUnit(item.path, unitIds, units)
            );
          })
        : [],
    [authRole, authProfile?.is_admin, unitIds, units],
  );
  const moduleHref = (path: string) =>
    path === "/dashboard" && authRole ? DEMO_DASHBOARD_PATHS[authRole] : path;

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, []);

  useEffect(() => {
    if (menuOpen) closeMenuRef.current?.focus();
    else if (
      wasMenuOpen.current &&
      menuTriggerRef.current?.getClientRects().length
    ) {
      menuTriggerRef.current.focus();
    }
    wasMenuOpen.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => {
      setIsMobileNav(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Cargando sesión…
      </div>
    );
  }
  if (!isLiveSession || !authRole) {
    return <AuthForm />;
  }
  const role = authRole;
  return (
    <ProtectedShell>
      <div className="ccv-shell min-h-screen bg-background text-foreground">
        <a className="ccv-skip-link" href="#main-content">
          Ir al contenido
        </a>
        {menuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/70 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          />
        )}
        <aside
          ref={sidebarRef}
          id="primary-navigation"
          aria-label="Navegación principal"
          role={menuOpen ? "dialog" : undefined}
          aria-modal={menuOpen ? "true" : undefined}
          aria-hidden={isMobileNav && !menuOpen}
          inert={isMobileNav && !menuOpen}
          onKeyDown={(event) => {
            if (!menuOpen || event.key !== "Tab") return;
            const focusable = Array.from(
              sidebarRef.current?.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ) ?? [],
            ).filter((element) => element.getClientRects().length > 0);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
          className={`ccv-sidebar fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out motion-reduce:transition-none lg:transition-none lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
            <img
              src={`${import.meta.env.BASE_URL}Logo_CCV.png`}
              alt="CCV"
              className="size-10 rounded-xl object-contain"
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold tracking-wide">
                DASHBOARD COMERCIAL
              </p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">
                Decisiones 2026
              </p>
            </div>
            <button
              ref={closeMenuRef}
              type="button"
              aria-label="Cerrar navegación"
              className="flex size-11 items-center justify-center text-sidebar-foreground/60 lg:hidden"
              onClick={() => setMenuOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {groups.map((group) => {
              const groupModules = accessibleModules.filter(
                (item) => item.group === group,
              );
              if (groupModules.length === 0) return null;
              const canCollapseGroup = groupModules.length > 1;
              const isActiveGroup = groupModules.some(
                (item) =>
                  location === item.path || location === moduleHref(item.path),
              );
              const isCollapsed =
                canCollapseGroup &&
                collapsedGroups.has(group) &&
                !isActiveGroup;
              return (
                <div key={group} className="mb-5">
                  {canCollapseGroup ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(group)) next.delete(group);
                          else next.add(group);
                          return next;
                        })
                      }
                      aria-expanded={!isCollapsed}
                      className="ccv-nav-group mb-2 flex w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
                    >
                      {group}
                      <ChevronDown
                        size={12}
                        className={`transition-transform motion-reduce:transition-none ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                    </button>
                  ) : (
                    <p className="ccv-nav-group mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                      {group}
                    </p>
                  )}
                  <div className={`space-y-1 ${isCollapsed ? "hidden" : ""}`}>
                    {groupModules.map((item) => {
                      const Icon = item.icon;
                      const itemHref =
                        item.path === "/dashboard"
                          ? DEMO_DASHBOARD_PATHS[role]
                          : item.path;
                      const active =
                        location === item.path ||
                        location === itemHref ||
                        (location === "/" && item.path === "/resumen");
                      return (
                        <Link
                          key={item.path}
                          href={itemHref}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`ccv-nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}
                        >
                          <Icon size={17} />
                          <span className="flex-1">{item.label}</span>
                          {active && (
                            <span className="size-1.5 rounded-full bg-current" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-sidebar-border p-3">
            <div className="ccv-user-card flex items-center gap-3 rounded-xl border border-sidebar-border/70 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-display text-sm font-bold text-sidebar-foreground">
                {(authProfile?.nombre_completo ?? authSession?.email ?? "U")
                  .charAt(0)
                  .toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-sidebar-foreground">
                  {authProfile?.nombre_completo ?? authSession?.email}
                </p>
                <p className="mt-0.5 text-[10px] text-sidebar-foreground/65">
                  {DEMO_ROLE_LABELS[role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="ccv-signout flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        <main
          id="main-content"
          tabIndex={-1}
          className="ccv-main min-h-screen lg:pl-[248px]"
        >
          <header className="ccv-topbar sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6">
            <button
              ref={menuTriggerRef}
              type="button"
              aria-label="Abrir navegación"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              className="flex size-11 items-center justify-center rounded-xl border border-border lg:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                {current.group}
              </p>
              <p className="ccv-current-title truncate text-sm font-semibold text-foreground sm:text-base">
                {currentLabel}
              </p>
            </div>
            <span
              className="ccv-role-context hidden md:inline-flex"
              title={roleContextLabel}
            >
              {roleContextLabel}
            </span>
            <button
              ref={searchButtonRef}
              type="button"
              aria-label="Abrir buscador de módulos"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 sm:flex"
            >
              <Search size={16} />
              Buscar{" "}
              <kbd className="ml-2 text-[10px] text-muted-foreground">
                Ctrl K
              </kbd>
            </button>
            <button
              ref={mobileSearchButtonRef}
              type="button"
              aria-label="Abrir buscador de módulos"
              onClick={() => setPaletteOpen(true)}
              className="flex size-11 items-center justify-center rounded-xl border border-border bg-card sm:hidden"
            >
              <Search size={17} />
            </button>
            <Link
              href="/alertas"
              aria-label={
                openAlertsCount > 0
                  ? `Ver alertas (${openAlertsCount} abiertas)`
                  : "Ver alertas"
              }
              className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-card"
            >
              <Bell size={17} />
              {openAlertsCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-rose-400 text-[9px] font-bold text-white">
                  {openAlertsCount > 9 ? "9+" : openAlertsCount}
                </span>
              )}
            </Link>
            <span
              title={
                apiHealth.isSuccess ? "API conectada" : "API no disponible"
              }
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-2 text-[10px] font-semibold sm:flex ${apiHealth.isSuccess ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400" : apiHealth.isError ? "border-rose-400/20 bg-rose-400/10 text-rose-400" : "border-border bg-card text-muted-foreground"}`}
            >
              <span
                className={`size-1.5 rounded-full ${apiHealth.isSuccess ? "bg-emerald-400" : apiHealth.isError ? "bg-rose-400" : "bg-muted-foreground"}`}
              />
              {apiHealth.isSuccess
                ? "API online"
                : apiHealth.isError
                  ? "API offline"
                  : "Conectando API"}
            </span>
            <div
              title={`Sesión de ${DEMO_ROLE_LABELS[role]}`}
              className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground"
            >
              {roleInitials(role)}
            </div>
          </header>
          <div className="ccv-content mx-auto max-w-[1600px] p-4 sm:p-7">
            {paletteOpen && (
              <Suspense fallback={null}>
                <CommandPalette
                  open
                  onOpenChange={setPaletteOpen}
                  modules={accessibleModules}
                  scopeLabel={roleContextLabel}
                  onSelect={(path) => setLocation(moduleHref(path))}
                />
              </Suspense>
            )}
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  Cargando…
                </div>
              }
            >
              <Switch>
                <Route path="/">
                  <DashboardPage />
                </Route>
                <Route path="/dashboard">
                  <DashboardPage />
                </Route>
                {Object.keys(DEMO_DASHBOARD_ALIASES)
                  .filter((path) => path !== "/dashboard")
                  .map((path) => (
                    <Route key={path} path={path}>
                      <RoleDashboardRoute path={path} role={role} />
                    </Route>
                  ))}
                <Route path="/minutas/nueva">
                  <AuthenticatedModuleRoute
                    accessKey="minutas"
                    role={role}
                    unitIds={unitIds}
                    units={units}
                    unitsLoading={unitsLoading}
                  >
                    <NuevaMinutaPage />
                  </AuthenticatedModuleRoute>
                </Route>
                <Route path="/evaluacion">
                  <AuthenticatedModuleRoute
                    accessKey="evaluacion"
                    role={role}
                    unitIds={unitIds}
                    units={units}
                    unitsLoading={unitsLoading}
                  >
                    <EvaluacionPage />
                  </AuthenticatedModuleRoute>
                </Route>
                <Route path="/evaluacion/asesor">
                  <AuthenticatedModuleRoute
                    accessKey="evaluacion_asesor"
                    role={role}
                    unitIds={unitIds}
                    units={units}
                    unitsLoading={unitsLoading}
                  >
                    <EvaluacionAsesorPage />
                  </AuthenticatedModuleRoute>
                </Route>
                <Route path="/evaluacion/sucursal">
                  <AuthenticatedModuleRoute
                    accessKey="evaluacion_sucursal"
                    role={role}
                    unitIds={unitIds}
                    units={units}
                    unitsLoading={unitsLoading}
                  >
                    <EvaluacionSucursalPage />
                  </AuthenticatedModuleRoute>
                </Route>
                <Route path="/evaluacion/unidad">
                  <AuthenticatedModuleRoute
                    accessKey="evaluacion_unidad"
                    role={role}
                    unitIds={unitIds}
                    units={units}
                    unitsLoading={unitsLoading}
                  >
                    <EvaluacionUnidadPage />
                  </AuthenticatedModuleRoute>
                </Route>
                {modules
                  .filter((item) => item.path !== "/dashboard")
                  .map((item) => (
                    <Route key={item.path} path={item.path}>
                      <AuthenticatedModuleRoute
                        accessKey={item.accessKey}
                        path={item.path}
                        role={role}
                        unitIds={unitIds}
                        units={units}
                        unitsLoading={unitsLoading}
                      >
                        {modulePage(item.path, role)}
                      </AuthenticatedModuleRoute>
                    </Route>
                  ))}
                <Route>
                  <DashboardPage />
                </Route>
              </Switch>
            </Suspense>
          </div>
        </main>
      </div>
    </ProtectedShell>
  );
}

export default DashboardApp;
