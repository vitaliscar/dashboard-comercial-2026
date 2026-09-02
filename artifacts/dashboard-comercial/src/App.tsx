import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  ShieldAlert,
  Target,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Link, Route, Switch, useLocation } from "wouter";
import { getHealthCheckQueryKey, useHealthCheck } from "@workspace/api-client-react";
import { ModulePage } from "./components/module-pages";
import ResumenPage from "./pages/resumen";
import UnidadLivePage from "./pages/unidad-live";
import type { UnidadKey } from "./lib/unidad-http";
import DashboardPage from "./pages/dashboard";
import { useAuth } from "./hooks/use-auth";
import { AuthForm } from "./components/auth-form";

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

const trend = [42, 48, 45, 56, 61, 58, 67, 72, 69, 78, 84, 88];

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
  asesor: ["/resumen", "/dashboard", "/alertas", "/cliente-360", "/minutas"],
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
        <h2 className="mt-2 font-display text-2xl font-semibold">Este módulo no corresponde a tu rol demo</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          La vista actual está simulando el alcance de {DEMO_ROLE_LABELS[role]}. Cambia el rol desde el encabezado para revisar otro alcance.
        </p>
      </section>
    </div>
  );
}

function DemoModuleRoute({ module, role }: { module: Module; role: DemoRole }) {
  return canAccessDemoModule(role, module.path) ? <ModulePage module={module} /> : <AccessDenied role={role} />;
}

const LIVE_UNIT_KEYS: Partial<Record<string, UnidadKey>> = {
  "/repuestos": "repuestos",
  "/lubfiltros": "lubfiltros",
  "/servicios": "servicios",
  "/equipos": "equipos",
  "/alquiler": "alquiler",
};

function UnitRoute({ module, role, unitKey }: { module: Module; role: DemoRole; unitKey: UnidadKey }) {
  const { session, loading } = useAuth();
  if (!loading && session) return <UnidadLivePage unitKey={unitKey} />;
  return <DemoModuleRoute module={module} role={role} />;
}

function DashboardRoute({ module, role }: { module: Module; role: DemoRole }) {
  const { session, loading } = useAuth();
  if (!loading && session) return <DashboardPage />;
  return <DemoModuleRoute module={module} role={role} />;
}

function DemoRoleDashboardRoute({ path, role }: { path: string; role: DemoRole }) {
  const requiredRole = DEMO_DASHBOARD_ALIASES[path];
  const dashboard = modules.find((module) => module.path === "/dashboard")!;
  return requiredRole === role ? <DemoModuleRoute module={dashboard} role={role} /> : <AccessDenied role={role} />;
}

function ResumenRoute({ module, role }: { module: Module; role: DemoRole }) {
  const { session, loading } = useAuth();
  if (!loading && session) return <ResumenPage />;
  return <DemoModuleRoute module={module} role={role} />;
}

function MetricCard({
  label,
  value,
  delta,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta: string;
  tone?: "primary" | "success" | "warning";
}) {
  const toneClass = {
    primary: "text-primary",
    success: "text-emerald-400",
    warning: "text-amber-400",
  }[tone];
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <strong className="font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</strong>
        <span className={`rounded-full bg-background px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{delta}</span>
      </div>
    </article>
  );
}

function Overview() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Facturación acumulada" value="$ 4.82M" delta="+12.4%" tone="success" />
        <MetricCard label="Cumplimiento de meta" value="87.6%" delta="+5.2 pts" />
        <MetricCard label="Pipeline activo" value="$ 1.36M" delta="42 cuentas" />
        <MetricCard label="Cartera en riesgo" value="$ 284K" delta="-8.1%" tone="warning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-border bg-card">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Rendimiento 2026</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Ventas vs. meta comercial</h2>
            </div>
            <span className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">Ene — Dic</span>
          </header>
          <div className="p-5">
            <div className="flex h-64 items-end gap-2 sm:gap-3" aria-label="Tendencia mensual de ventas">
              {trend.map((value, index) => (
                <div key={index} className="group flex h-full flex-1 items-end">
                  <div
                    className="relative w-full rounded-t-md bg-gradient-to-t from-primary/55 to-primary transition-all duration-500 group-hover:brightness-125"
                    style={{ height: `${value}%` }}
                  >
                    <span className="absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-background px-2 py-1 font-mono text-[10px] group-hover:block">
                      {value}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-12 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
              {"EFMAMJJASOND".split("").map((month, index) => <span key={index}>{month}</span>)}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Foco de gestión</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Prioridades de hoy</h2>
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><AlertTriangle size={19} /></span>
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["Cartera vencida > 60 días", "12 clientes", "Alta"],
              ["Cotizaciones sin seguimiento", "28 oportunidades", "Media"],
              ["Sucursales bajo 75% de meta", "3 sucursales", "Media"],
              ["Clientes con recompra probable", "19 cuentas", "Oportunidad"],
            ].map(([title, detail, level], index) => (
              <button key={title} className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background/55 p-3 text-left transition hover:border-primary/45 hover:bg-primary/5">
                <span className={`size-2 rounded-full ${index === 0 ? "bg-rose-400" : index === 3 ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{detail} · {level}</span>
                </span>
                <ChevronRight size={16} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Servicios", "94%", "$ 1.18M", "Mejor desempeño del período"],
          ["Repuestos", "86%", "$ 940K", "Mayor oportunidad en Oriente"],
          ["Equipos", "78%", "$ 1.42M", "Pipeline fuerte para septiembre"],
        ].map(([name, pct, amount, note]) => (
          <article key={name} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div><p className="font-display text-lg font-semibold">{name}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
              <strong className="font-mono text-primary">{pct}</strong>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: pct }} /></div>
            <p className="mt-3 font-mono text-sm text-foreground">{amount} facturado</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function DashboardApp() {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [period, setPeriod] = useState(() => {
    if (typeof window === "undefined") return "Agosto 2026";
    return window.sessionStorage.getItem("ccv-demo-period") ?? "Agosto 2026";
  });
  const [branch, setBranch] = useState(() => {
    if (typeof window === "undefined") return "Todas las sucursales";
    return window.sessionStorage.getItem("ccv-demo-branch") ?? "Todas las sucursales";
  });
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [demoRole, setDemoRole] = useState<DemoRole>(() => {
    if (typeof window === "undefined") return "gerencia";
    const saved = window.sessionStorage.getItem("ccv-demo-role");
    return saved === "gerente_comercial" || saved === "coordinador" || saved === "asesor"
      ? saved
      : "gerencia";
  });
  const {
    session: authSession,
    profile: authProfile,
    role: authRole,
    loading: authLoading,
  } = useAuth();
  const isLiveSession = !authLoading && Boolean(authSession && authRole);
  const shellRole: DemoRole = isLiveSession && authRole ? authRole : demoRole;
  const apiHealth = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30_000,
      retry: 1,
    },
  });
  const current = modules.find((item) => location === item.path) ?? modules.find((item) => item.path === "/dashboard")!;
  const currentLabel = DEMO_DASHBOARD_LABELS[location] ?? current.label;
  const groups = useMemo(() => [...new Set(modules.map((item) => item.group))], []);
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };
  const accessibleModules = useMemo(
    () => modules.filter((item) => canAccessDemoModule(shellRole, item.path)),
    [shellRole],
  );
  const visibleModules = accessibleModules.filter((item) =>
    `${item.label} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    window.sessionStorage.setItem("ccv-demo-role", demoRole);
  }, [demoRole]);

  useEffect(() => {
    window.sessionStorage.setItem("ccv-demo-period", period);
    window.sessionStorage.setItem("ccv-demo-branch", branch);
  }, [period, branch]);

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

  const handleRoleChange = (nextRole: DemoRole) => {
    setDemoRole(nextRole);
    if (location === "/dashboard" || DEMO_DASHBOARD_ALIASES[location]) {
      setLocation(DEMO_DASHBOARD_PATHS[nextRole]);
    } else if (location !== "/" && !canAccessDemoModule(nextRole, location)) {
      setLocation("/resumen");
    }
    notify(`Vista demo: ${DEMO_ROLE_LABELS[nextRole]}`);
  };

  if (location === "/auth") {
    return <AuthForm />;
  }
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
            return (
            <div key={group} className="mb-5">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-sidebar-foreground/40">{group}</p>
              <div className="space-y-1">
                {groupModules.map((item) => {
                  const Icon = item.icon;
                  const itemHref = item.path === "/dashboard" ? DEMO_DASHBOARD_PATHS[shellRole] : item.path;
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
            <div className="rounded-xl bg-sidebar-accent p-3"><p className="text-xs font-semibold">{isLiveSession ? "Sesión autenticada" : "Datos de demostración"}</p><p className="mt-1 text-[11px] text-sidebar-foreground/55">{isLiveSession ? `Usuario: ${authProfile?.nombre_completo ?? authSession?.email}` : `Rol simulado: ${DEMO_ROLE_LABELS[demoRole]}`}</p>{!isLiveSession && <select aria-label="Rol de demostración en menú móvil" value={demoRole} onChange={(event) => handleRoleChange(event.target.value as DemoRole)} className="mt-3 w-full rounded-lg border border-sidebar-border bg-sidebar px-2 py-2 text-xs font-semibold sm:hidden">{Object.entries(DEMO_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</div>
        </div>
      </aside>

      <main className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-border bg-background/88 px-4 backdrop-blur-xl sm:px-6">
           <button type="button" aria-label="Abrir navegación" className="flex size-10 items-center justify-center rounded-xl border border-border lg:hidden" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">{current.group}</p><h1 className="truncate font-display text-lg font-semibold">{currentLabel}</h1></div>
           <button type="button" aria-label="Abrir buscador de módulos" onClick={() => setPaletteOpen(true)} className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 sm:flex"><Search size={16} />Buscar <kbd className="ml-2 text-[10px] text-muted-foreground">⌘K</kbd></button>
           <button type="button" aria-label="Abrir buscador de módulos" onClick={() => setPaletteOpen(true)} className="flex size-10 items-center justify-center rounded-xl border border-border bg-card sm:hidden"><Search size={17} /></button>
           <button type="button" aria-label="Ver notificaciones" onClick={() => notify("No hay nuevas notificaciones")} className="relative flex size-10 items-center justify-center rounded-xl border border-border bg-card"><Bell size={17} /><span className="absolute right-2 top-2 size-2 rounded-full border-2 border-card bg-rose-400" /></button>
           <span title={apiHealth.isSuccess ? "API conectada" : "API no disponible"} className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-2 text-[10px] font-semibold sm:flex ${apiHealth.isSuccess ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400" : apiHealth.isError ? "border-rose-400/20 bg-rose-400/10 text-rose-400" : "border-border bg-card text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${apiHealth.isSuccess ? "bg-emerald-400" : apiHealth.isError ? "bg-rose-400" : "bg-muted-foreground"}`} />{apiHealth.isSuccess ? "API online" : apiHealth.isError ? "API offline" : "Conectando API"}</span>
           <label className="sr-only" htmlFor="demo-role">Rol de demostración</label>
           {!isLiveSession && <select id="demo-role" aria-label="Rol de demostración" value={demoRole} onChange={(event) => handleRoleChange(event.target.value as DemoRole)} className="hidden h-10 max-w-[180px] rounded-xl border border-border bg-card px-3 text-xs font-semibold sm:block">
             {Object.entries(DEMO_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
           </select>}
           <div title={isLiveSession ? `Sesión de ${DEMO_ROLE_LABELS[shellRole]}` : `Rol demo: ${DEMO_ROLE_LABELS[demoRole]}`} className="flex size-10 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground">{roleInitials(shellRole)}</div>
        </header>
        <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
             <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary"><span className="size-1.5 rounded-full bg-primary" />{isLiveSession ? "DATOS REALES" : "DATOS DE DEMOSTRACIÓN"}</div><p className="text-sm text-muted-foreground">Centro de decisiones comerciales</p><h2 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Buenos días, {isLiveSession ? authProfile?.nombre_completo ?? DEMO_ROLE_LABELS[shellRole] : DEMO_ROLE_LABELS[demoRole]}</h2></div>
             <div className="flex flex-wrap gap-2">
               <label className="sr-only" htmlFor="global-branch">Sucursal</label><select id="global-branch" aria-label="Filtrar por sucursal" value={branch} onChange={(event) => { setBranch(event.target.value); notify(`Sucursal: ${event.target.value}`); }} className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option>Todas las sucursales</option><option>Santa Cruz</option><option>La Paz</option><option>Cochabamba</option></select>
               <label className="sr-only" htmlFor="global-period">Período</label><select id="global-period" aria-label="Seleccionar período" value={period} onChange={(event) => { setPeriod(event.target.value); notify(`Período: ${event.target.value}`); }} className="rounded-xl border border-border bg-card px-3 py-2 text-sm"><option>Agosto 2026</option><option>Julio 2026</option><option>Junio 2026</option></select>
               <button type="button" onClick={() => notify("Briefing demo listo para exportar")} className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">Exportar briefing</button>
             </div>
          </div>
         {paletteOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Buscar módulos" onClick={() => setPaletteOpen(false)}><div className="ccv-command-panel w-full max-w-lg rounded-2xl border border-border bg-card p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-2 border-b border-border pb-3"><Search size={17} className="text-primary" /><input autoFocus aria-label="Buscar módulo" placeholder="Buscar módulo..." className="w-full bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" aria-label="Cerrar buscador" onClick={() => { setPaletteOpen(false); setQuery(""); }}><X size={16} /></button></div><div className="mt-3 max-h-72 overflow-y-auto">{(query ? visibleModules : accessibleModules).map((item) => <Link key={item.path} href={item.path} onClick={() => { setPaletteOpen(false); setQuery(""); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-primary/10"><item.icon size={16} className="text-primary" /><span>{item.label}</span><span className="ml-auto text-xs text-muted-foreground">{item.group}</span></Link>)}{query && visibleModules.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin módulos encontrados.</p>}</div></div></div>}
         {notice && !paletteOpen && <div className="ccv-toast" role="status">{notice}</div>}
          <Switch>
            <Route path="/"><Overview /></Route>
            <Route path="/dashboard"><DashboardRoute module={modules.find((item) => item.path === "/dashboard")!} role={demoRole} /></Route>
            {Object.keys(DEMO_DASHBOARD_ALIASES).filter((path) => path !== "/dashboard").map((path) => <Route key={path} path={path}><DemoRoleDashboardRoute path={path} role={demoRole} /></Route>)}
             {modules.map((item) => <Route key={item.path} path={item.path}>{item.path === "/resumen" ? <ResumenRoute module={item} role={demoRole} /> : LIVE_UNIT_KEYS[item.path] ? <UnitRoute module={item} role={demoRole} unitKey={LIVE_UNIT_KEYS[item.path]!} /> : <DemoModuleRoute module={item} role={demoRole} />}</Route>)}
            <Route><Overview /></Route>
          </Switch>
        </div>
      </main>
    </div>
  );
}

export default DashboardApp;