import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import type { UnidadKey } from "./lib/unidad-http";
import { useAuth } from "./hooks/use-auth";
import { AuthForm } from "./components/auth-form";
import { getAlertas } from "./lib/alertas-http";

// Code-splitting por ruta: cada rol solo descarga las páginas a las que
// tiene acceso (ver ROLE_MODULE_ACCESS), en vez de las 16 en el bundle
// inicial. Usuarios/Ajustes-manuales/Carga son exclusivas de gerencia y no
// deberían pesar en la carga inicial de un asesor o coordinador.
const ResumenPage = lazy(() => import("./pages/resumen"));
const UnidadLivePage = lazy(() => import("./pages/unidad-live"));
const CobranzasPage = lazy(() => import("./pages/cobranzas"));
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
const EvaluacionSucursalPage = lazy(() => import("./pages/evaluacion-sucursal"));
const EvaluacionUnidadPage = lazy(() => import("./pages/evaluacion-unidad"));
const AjustesPage = lazy(() => import("./pages/administracion").then((m) => ({ default: m.AjustesPage })));
const CargaPage = lazy(() => import("./pages/administracion").then((m) => ({ default: m.CargaPage })));
const UsuariosPage = lazy(() => import("./pages/administracion").then((m) => ({ default: m.UsuariosPage })));

export type Module = {
  path: string;
  label: string;
  group: string;
  icon: typeof BarChart3;
  description: string;
};

export type DemoRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

const modules: Module[] = [
  { path: "/resumen", label: "Resumen", group: "Visión general", icon: BarChart3, description: "Pulso comercial consolidado" },
  { path: "/dashboard", label: "Dashboard", group: "Visión general", icon: LayoutDashboard, description: "Vista ejecutiva por rol" },
  { path: "/alertas", label: "Alertas", group: "Visión general", icon: Bell, description: "Riesgos y oportunidades" },
  { path: "/embudo", label: "Embudo", group: "Gestión comercial", icon: Target, description: "Conversión de cotizaciones" },
  { path: "/cliente-360", label: "Clientes", group: "Gestión comercial", icon: Users, description: "Valor y actividad por cliente" },
  { path: "/asesores", label: "Asesores", group: "Gestión comercial", icon: UserCheck, description: "Rendimiento de la fuerza de ventas" },
  { path: "/minutas", label: "Minutas", group: "Gestión comercial", icon: FileText, description: "Compromisos y seguimiento" },
  { path: "/cobranzas", label: "Cobranzas", group: "Finanzas", icon: Receipt, description: "Cartera, mora y recuperación" },
  { path: "/servicios", label: "Servicios", group: "Unidades de negocio", icon: Wrench, description: "Talleres y servicios estratégicos" },
  { path: "/repuestos", label: "Repuestos", group: "Unidades de negocio", icon: Package, description: "Ventas, meta e inventario" },
  { path: "/lubfiltros", label: "Lub / Filtros", group: "Unidades de negocio", icon: Filter, description: "Desempeño por marca y sucursal" },
  { path: "/equipos", label: "Equipos", group: "Unidades de negocio", icon: Truck, description: "Facturación, pipeline e inventario" },
  { path: "/alquiler", label: "Alquiler", group: "Unidades de negocio", icon: Building2, description: "Ocupación y rendimiento" },
  { path: "/carga", label: "Cargar Excel", group: "Administración", icon: FileSpreadsheet, description: "Actualización de fuentes comerciales" },
  { path: "/usuarios", label: "Usuarios", group: "Administración", icon: Users, description: "Roles, permisos y cobertura" },
  { path: "/ajustes-manuales", label: "Ajustes manuales", group: "Administración", icon: Settings, description: "Metas y correcciones autorizadas" },
];

const DEMO_ROLE_LABELS: Record<DemoRole, string> = {
  gerencia: "Gerencia",
  gerente_comercial: "Gerente comercial",
  coordinador: "Coordinador",
  asesor: "Asesor",
};

const DEMO_ROLE_ACCESS: Record<DemoRole, string[]> = {
  gerencia: modules.map((module) => module.path),
  gerente_comercial: [
    "/resumen",
    "/dashboard",
    "/alertas",
    "/embudo",
    "/cliente-360",
    "/asesores",
    "/minutas",
     "/cobranzas",
    "/servicios",
    "/repuestos",
    "/lubfiltros",
    "/equipos",
    "/alquiler",
  ],
  coordinador: [
    "/resumen",
    "/dashboard",
    "/alertas",
    "/cliente-360",
    "/asesores",
    "/minutas",
     "/cobranzas",
    "/servicios",
    "/repuestos",
    "/lubfiltros",
    "/equipos",
    "/alquiler",
  ],
  asesor: ["/resumen", "/dashboard", "/alertas", "/cliente-360", "/minutas", "/asesores"],
};

const DEMO_DASHBOARD_PATHS: Record<DemoRole, string> = {
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

function canAccessDemoModule(role: DemoRole, path: string) {
  return DEMO_ROLE_ACCESS[role].includes(path);
}

function roleInitials(role: DemoRole) {
  return { gerencia: "GN", gerente_comercial: "GC", coordinador: "CO", asesor: "AS" }[role];
}

function AccessDenied({ role }: { role: DemoRole }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <section className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-400/10 text-rose-400">
          <ShieldAlert size={22} />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Acceso restringido</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Este módulo no corresponde a tu rol</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tu cuenta tiene el rol {DEMO_ROLE_LABELS[role]}. Contacta al administrador si necesitas acceso a esta vista.
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
  if (path === "/coordinador" && role === "coordinador") return <CoordinadorPage />;
  if (path === "/asesor" && role === "asesor") return <AsesorPanelPage />;
  if (path === "/sucursal" && role === "coordinador") return <SucursalPage />;
  if (path === "/gerencia-nacional" && role === "gerencia") return <GerenciaNacionalPage />;
  return <AccessDenied role={role} />;
}

function AuthenticatedModuleRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DashboardApp() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "Administración" (Usuarios/Ajustes-manuales/Carga) es el grupo menos
  // usado — colapsado por defecto reduce los 16 módulos planos que gerencia
  // ve de una sola vez (viola la Ley de Hick sin esto). Se auto-expande si
  // la ruta activa cae dentro, para no esconder dónde está el usuario.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(["Administración"]),
  );
  const [query, setQuery] = useState("");
  const {
    session: authSession,
    profile: authProfile,
    role: authRole,
    loading: authLoading,
    signOut,
  } = useAuth();
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
    queryFn: async () => (await getAlertas()).filter((a) => a.estado === "abierta").length,
    enabled: isLiveSession,
    refetchInterval: 60_000,
  });
  const current = modules.find((item) => location === item.path) ?? modules.find((item) => item.path === "/dashboard")!;
  const currentLabel = DEMO_DASHBOARD_LABELS[location] ?? current.label;
  const groups = useMemo(() => [...new Set(modules.map((item) => item.group))], []);
  // Sin sesión real, `authRole` es null; el gate de abajo impide que este
  // valor llegue a renderizarse, pero el hook debe ejecutarse siempre.
  const accessibleModules = useMemo(
    () => (authRole ? modules.filter((item) => canAccessDemoModule(authRole, item.path)) : []),
    [authRole],
  );
  const visibleModules = accessibleModules.filter((item) =>
    `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setMenuOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
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
    <div className="ccv-shell min-h-screen bg-background text-foreground">
      {menuOpen && <button type="button" className="fixed inset-0 z-30 bg-black/70 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
          <img src={`${import.meta.env.BASE_URL}Logo_CCV.png`} alt="CCV" className="size-10 rounded-xl object-contain" />
           <div className="min-w-0 flex-1"><p className="font-display text-sm font-bold tracking-wide">CENTRO COMERCIAL</p><p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Decisiones 2026</p></div>
           <button type="button" aria-label="Cerrar navegación" className="text-sidebar-foreground/60 lg:hidden" onClick={() => setMenuOpen(false)}><X size={19} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => {
            const groupModules = accessibleModules.filter((item) => item.group === group);
            if (groupModules.length === 0) return null;
            const isActiveGroup = groupModules.some((item) => location === item.path);
            const isCollapsed = collapsedGroups.has(group) && !isActiveGroup;
            return (
            <div key={group} className="mb-5">
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
                className="mb-2 flex w-full items-center justify-between px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
              >
                {group}
                <ChevronDown size={12} className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              <div className={`space-y-1 ${isCollapsed ? "hidden" : ""}`}>
                {groupModules.map((item) => {
                  const Icon = item.icon;
                  const itemHref = item.path === "/dashboard" ? DEMO_DASHBOARD_PATHS[role] : item.path;
                  const active = location === item.path || location === itemHref || (location === "/" && item.path === "/resumen");
                  return (
                    <Link key={item.path} href={itemHref} onClick={() => setMenuOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                      <Icon size={17} /><span className="flex-1">{item.label}</span>{active && <span className="size-1.5 rounded-full bg-current" />}
                    </Link>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>
         <div className="border-t border-sidebar-border p-4">
            <div className="rounded-xl bg-sidebar-accent p-3">
              <p className="text-xs font-semibold">Sesión autenticada</p>
              <p className="mt-1 text-[11px] text-sidebar-foreground/55">Usuario: {authProfile?.nombre_completo ?? authSession?.email}</p>
              <button type="button" onClick={() => signOut()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-foreground/80 transition hover:border-primary/40 hover:text-sidebar-foreground">
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-border bg-background/88 px-4 backdrop-blur-xl sm:px-6">
           <button type="button" aria-label="Abrir navegación" className="flex size-11 items-center justify-center rounded-xl border border-border lg:hidden" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">{current.group}</p><h1 className="truncate font-display text-lg font-semibold">{currentLabel}</h1></div>
           <button type="button" aria-label="Abrir buscador de módulos" onClick={() => setPaletteOpen(true)} className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 sm:flex"><Search size={16} />Buscar <kbd className="ml-2 text-[10px] text-muted-foreground">⌘K</kbd></button>
           <button type="button" aria-label="Abrir buscador de módulos" onClick={() => setPaletteOpen(true)} className="flex size-11 items-center justify-center rounded-xl border border-border bg-card sm:hidden"><Search size={17} /></button>
           <Link href="/alertas" aria-label={openAlertsCount > 0 ? `Ver alertas (${openAlertsCount} abiertas)` : "Ver alertas"} className="relative flex size-11 items-center justify-center rounded-xl border border-border bg-card"><Bell size={17} />{openAlertsCount > 0 && <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-rose-400 text-[9px] font-bold text-white">{openAlertsCount > 9 ? "9+" : openAlertsCount}</span>}</Link>
           <span title={apiHealth.isSuccess ? "API conectada" : "API no disponible"} className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-2 text-[10px] font-semibold sm:flex ${apiHealth.isSuccess ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400" : apiHealth.isError ? "border-rose-400/20 bg-rose-400/10 text-rose-400" : "border-border bg-card text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${apiHealth.isSuccess ? "bg-emerald-400" : apiHealth.isError ? "bg-rose-400" : "bg-muted-foreground"}`} />{apiHealth.isSuccess ? "API online" : apiHealth.isError ? "API offline" : "Conectando API"}</span>
           <div title={`Sesión de ${DEMO_ROLE_LABELS[role]}`} className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground">{roleInitials(role)}</div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
             <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"><span className="size-1.5 rounded-full bg-primary" />DATOS REALES</div><p className="text-sm text-muted-foreground">Centro de decisiones comerciales</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Buenos días, {authProfile?.nombre_completo ?? DEMO_ROLE_LABELS[role]}</h2></div>
          </div>
         {paletteOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar módulos" onClick={() => setPaletteOpen(false)}><div className="ccv-command-panel w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2 border-b border-border pb-3"><Search size={17} className="text-primary" /><input autoFocus aria-label="Buscar módulo" placeholder="Buscar módulo..." className="w-full bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Cerrar buscador" onClick={() => { setPaletteOpen(false); setQuery(""); }}><X size={16} /></button></div><div className="mt-3 max-h-72 overflow-y-auto">{(query ? visibleModules : accessibleModules).map((item) => <Link key={item.path} href={item.path} onClick={() => { setPaletteOpen(false); setQuery(""); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-primary/10"><item.icon size={16} className="text-primary" /><span>{item.label}</span><span className="ml-auto text-xs text-muted-foreground">{item.group}</span></Link>)}{query && visibleModules.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin módulos encontrados.</p>}</div></div></div>}
          <Suspense
            fallback={
              <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                Cargando…
              </div>
            }
          >
          <Switch>
            <Route path="/"><DashboardPage /></Route>
            <Route path="/dashboard"><DashboardPage /></Route>
            {Object.keys(DEMO_DASHBOARD_ALIASES).filter((path) => path !== "/dashboard").map((path) => <Route key={path} path={path}><RoleDashboardRoute path={path} role={role} /></Route>)}
            <Route path="/minutas/nueva">
              <AuthenticatedModuleRoute>
                <NuevaMinutaPage />
              </AuthenticatedModuleRoute>
            </Route>
            <Route path="/evaluacion"><AuthenticatedModuleRoute><EvaluacionPage /></AuthenticatedModuleRoute></Route>
            <Route path="/evaluacion/asesor"><EvaluacionAsesorPage /></Route>
            <Route path="/evaluacion/sucursal"><EvaluacionSucursalPage /></Route>
            <Route path="/evaluacion/unidad"><EvaluacionUnidadPage /></Route>
              {modules.filter((item) => item.path !== "/dashboard").map((item) => <Route key={item.path} path={item.path}>{item.path === "/resumen" ? <ResumenPage /> : LIVE_UNIT_KEYS[item.path] ? <UnitRoute unitKey={LIVE_UNIT_KEYS[item.path]!} /> : item.path === "/alertas" ? <AuthenticatedModuleRoute><AlertasPage /></AuthenticatedModuleRoute> : item.path === "/cliente-360" ? <AuthenticatedModuleRoute><Cliente360Page /></AuthenticatedModuleRoute> : item.path === "/embudo" ? <AuthenticatedModuleRoute><EmbudoPage /></AuthenticatedModuleRoute> : item.path === "/cobranzas" ? <AuthenticatedModuleRoute><CobranzasPage /></AuthenticatedModuleRoute> : item.path === "/asesores" ? <AuthenticatedModuleRoute><AsesoresPage /></AuthenticatedModuleRoute> : item.path === "/minutas" ? <AuthenticatedModuleRoute><MinutasPage /></AuthenticatedModuleRoute> : item.path === "/usuarios" ? <AuthenticatedModuleRoute><UsuariosPage /></AuthenticatedModuleRoute> : item.path === "/ajustes-manuales" ? <AuthenticatedModuleRoute><AjustesPage /></AuthenticatedModuleRoute> : item.path === "/carga" ? <AuthenticatedModuleRoute><CargaPage /></AuthenticatedModuleRoute> : <AccessDenied role={role} />}</Route>)}
            <Route><DashboardPage /></Route>
          </Switch>
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default DashboardApp;
