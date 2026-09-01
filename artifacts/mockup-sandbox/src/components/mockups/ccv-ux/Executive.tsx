import "./_group.css";

import { useMemo, useState, type MouseEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  LayoutDashboard,
  Menu,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";

type Priority = {
  id: number;
  title: string;
  detail: string;
  level: "Crítica" | "Atención" | "Oportunidad";
  color: "risk" | "watch" | "good";
};

const prioritiesSeed: Priority[] = [
  { id: 1, title: "Destrabar cartera crítica", detail: "12 clientes superan 60 días · $ 126K expuestos", level: "Crítica", color: "risk" },
  { id: 2, title: "Recuperar seguimiento de Equipos", detail: "12 oportunidades vencen en los próximos 7 días", level: "Atención", color: "watch" },
  { id: 3, title: "Activar recompra en Oriente", detail: "19 cuentas con señal de compra · $ 146K potencial", level: "Oportunidad", color: "good" },
  { id: 4, title: "Revisar cobertura de Santa Cruz", detail: "68% de meta · 12 puntos por debajo del objetivo", level: "Atención", color: "watch" },
];

const units = [
  { name: "Servicios", pct: 94, amount: "$ 1.18M", state: "Sobre meta", tone: "good" },
  { name: "Repuestos", pct: 86, amount: "$ 940K", state: "Recuperable", tone: "good" },
  { name: "Equipos", pct: 78, amount: "$ 1.42M", state: "Pipeline fuerte", tone: "watch" },
  { name: "Alquiler", pct: 71, amount: "$ 328K", state: "Bajo observación", tone: "watch" },
];

function Kpi({ icon: Icon, label, value, detail, tone = "neutral" }: { icon: typeof Activity; label: string; value: string; detail: string; tone?: "good" | "risk" | "neutral" }) {
  return (
    <article className="ccv-card ccv-card-hover ccv-kpi" data-testid={`executive-kpi-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="ccv-kpi-top">
        <span className="ccv-kpi-label">{label}</span>
        <Icon className="ccv-kpi-icon" size={16} strokeWidth={1.7} />
      </div>
      <div className="ccv-kpi-value">{value}</div>
      <div className={`ccv-kpi-meta ${tone === "good" ? "ccv-up" : tone === "risk" ? "ccv-down" : "ccv-neutral"}`}>
        {tone === "good" ? <ArrowUpRight size={13} /> : tone === "risk" ? <ArrowDownRight size={13} /> : <Activity size={13} />}
        <span>{detail}</span>
      </div>
    </article>
  );
}

function Sidebar({ open, section, onSection, onClose }: { open: boolean; section: string; onSection: (value: string) => void; onClose: () => void }) {
  const nav = [
    { label: "Resumen ejecutivo", icon: LayoutDashboard, count: "" },
    { label: "Alertas", icon: Bell, count: "17" },
    { label: "Embudo", icon: Target, count: "" },
    { label: "Clientes", icon: Users, count: "" },
    { label: "Cobranzas", icon: CircleDollarSign, count: "8" },
  ];
  return (
    <aside className="ccv-sidebar" data-open={open}>
      <div className="ccv-brand">
        <div className="ccv-mark">CCV</div>
        <div><div className="ccv-brand-name">CENTRO COMERCIAL</div><div className="ccv-brand-sub">Decisiones 2026</div></div>
        <button className="ccv-icon-button" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Cerrar navegación" data-testid="button-executive-close-menu"><X size={16} /></button>
      </div>
      <div className="ccv-nav-label">Navegación</div>
      <nav className="ccv-nav" aria-label="Módulos comerciales">
        {nav.map(({ label, icon: Icon, count }) => (
          <button key={label} type="button" data-active={section === label} onClick={() => { onSection(label); onClose(); }} data-testid={`button-executive-nav-${label.toLowerCase().replaceAll(" ", "-")}`}>
            <Icon size={16} strokeWidth={1.7} /><span>{label}</span>{count && <span className="ccv-nav-count">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="ccv-sidebar-foot">
        <div className="ccv-sync"><span className="ccv-sync-dot" />Datos sincronizados</div>
        <p>Actualizado hoy, 08:42 · 384 clientes activos</p>
      </div>
    </aside>
  );
}

function TrendChart({ compact }: { compact?: boolean }) {
  const line = "0,116 8,108 16,111 24,96 32,101 40,87 48,90 56,76 64,81 72,60 80,66 88,52 96,57 104,37 112,44 120,27 128,33 136,14 144,20 152,5";
  return (
    <div className={`ccv-card ccv-chart ${compact ? "ccv-chart-compact" : ""}`}>
      <div className="ccv-chart-top">
        <div><div className="ccv-eyebrow">Rendimiento 2026</div><h2 className="ccv-panel-title" style={{ marginTop: 5 }}>Ventas vs. meta comercial</h2><p className="ccv-panel-description">Facturación acumulada y cumplimiento mensual</p></div>
        <div className="ccv-chart-legend"><span><i className="ccv-legend-dot" style={{ background: "var(--ccv-signal)" }} />Facturado</span><span><i className="ccv-legend-dot" style={{ background: "var(--ccv-teal)" }} />Meta</span></div>
      </div>
      <div className="ccv-chart-area" aria-label="Tendencia mensual de ventas">
        {[0, 33, 66, 100].map((top, index) => <div className="ccv-grid-line" key={top} style={{ top: `${top}%` }}><span className="ccv-grid-label">{["$ 1.8M", "$ 1.2M", "$ 600K", "$ 0"][index]}</span></div>)}
        <svg className="ccv-chart-svg" viewBox="0 0 153 125" preserveAspectRatio="none" role="img" aria-label="Ventas creciendo de enero a agosto">
          <defs><linearGradient id="ccv-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#d4ab54" stopOpacity=".28" /><stop offset="100%" stopColor="#d4ab54" stopOpacity="0" /></linearGradient></defs>
          <path d={`M ${line} L 152,125 L 0,125 Z`} fill="url(#ccv-area)" />
          <polyline points={line} fill="none" stroke="#d4ab54" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <polyline points="0,110 20,104 40,95 60,92 80,76 100,68 120,54 140,45 152,39" fill="none" stroke="#6ec4b4" strokeDasharray="3 3" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <circle cx="152" cy="5" fill="#d4ab54" r="2.7" />
        </svg>
        <div className="ccv-months"><span>Ene</span><span>Mar</span><span>May</span><span>Jul</span><span>Dic</span></div>
      </div>
      <p className="ccv-chart-note">La tendencia se sostiene por <strong>Servicios</strong>; Equipos concentra el próximo salto de facturación.</p>
    </div>
  );
}

export function Executive() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState("Resumen ejecutivo");
  const [region, setRegion] = useState("Todas las sucursales");
  const [period, setPeriod] = useState("Agosto 2026");
  const [priorities, setPriorities] = useState(prioritiesSeed);
  const [toast, setToast] = useState("");
  const [showSignals, setShowSignals] = useState(false);

  const visiblePriorities = useMemo(() => priorities.filter((priority) => priority.level !== "Oportunidad" || region !== "La Paz"), [priorities, region]);
  const actOnPriority = (id: number) => {
    setPriorities((items) => items.map((item) => item.id === id ? { ...item, level: item.level === "Oportunidad" ? "Oportunidad" : item.level, color: item.color } : item));
    setToast("Prioridad abierta en el módulo correspondiente");
    window.setTimeout(() => setToast(""), 2200);
  };
  const markPriority = (event: MouseEvent, id: number) => {
    event.stopPropagation();
    setPriorities((items) => items.filter((item) => item.id !== id));
    setToast("Decisión marcada como atendida");
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <div className="ccv-shell min-h-screen">
      <div className="ccv-layout">
        <Sidebar open={menuOpen} section={section} onSection={setSection} onClose={() => setMenuOpen(false)} />
        {menuOpen && <button aria-label="Cerrar navegación" className="ccv-mobile-scrim" onClick={() => setMenuOpen(false)} data-testid="button-executive-dismiss-menu" />}
        <main className="ccv-main">
          <header className="ccv-topbar">
            <button className="ccv-menu-button" aria-label="Abrir navegación" onClick={() => setMenuOpen(true)} data-testid="button-executive-open-menu"><Menu size={18} /></button>
            <div className="ccv-topbar-title">Gerencia Nacional<strong>{section}</strong></div>
            <div className="ccv-topbar-spacer" />
            <button className="ccv-icon-button" aria-label="Buscar" data-testid="button-executive-search"><Search size={16} /></button>
            <button className="ccv-icon-button" aria-label="Ver notificaciones" data-testid="button-executive-notifications"><Bell size={16} /><span className="ccv-alert-dot" /></button>
            <div className="ccv-user"><div className="ccv-avatar">GN</div><span>Gerencia Nacional</span></div>
          </header>
          <div className="ccv-content">
            <div className="ccv-page-head">
              <div><div className="ccv-eyebrow">Sala de control · {period}</div><h1 className="ccv-display">Buenos días, Gerencia</h1><p>Cuatro señales para decidir dónde poner el foco comercial hoy.</p></div>
              <div className="ccv-head-actions">
                <select className="ccv-select" value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Filtrar por sucursal" data-testid="select-executive-region">
                  <option>Todas las sucursales</option><option>Santa Cruz</option><option>La Paz</option><option>Cochabamba</option>
                </select>
                <select className="ccv-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Seleccionar período" data-testid="select-executive-period">
                  <option>Agosto 2026</option><option>Julio 2026</option><option>Junio 2026</option>
                </select>
                <button className="ccv-button" type="button" onClick={() => { setToast("Briefing descargado"); window.setTimeout(() => setToast(""), 2200); }} data-testid="button-executive-export"><Download size={15} />Exportar briefing</button>
              </div>
            </div>
            <section className="ccv-grid ccv-kpis" aria-label="Indicadores principales">
              <Kpi icon={CircleDollarSign} label="Ingresos del mes" value="$ 618K" detail="+14.8% vs. julio" tone="good" />
              <Kpi icon={Target} label="Meta mensual" value="92.4%" detail="+4.1 pts de avance" tone="good" />
              <Kpi icon={Activity} label="Cobertura pipeline" value="2.2×" detail="+0.3× sobre objetivo" tone="good" />
              <Kpi icon={AlertTriangle} label="Riesgos abiertos" value="17" detail="5 requieren atención" tone="risk" />
            </section>
            <section className="ccv-grid ccv-two-col">
              <TrendChart />
              <article className="ccv-card">
                <div className="ccv-panel-head"><div><div className="ccv-eyebrow">Foco de gestión</div><h2 className="ccv-panel-title" style={{ marginTop: 5 }}>Decisiones prioritarias</h2><p className="ccv-panel-description">Ordenadas por impacto y fecha límite</p></div><AlertTriangle className="ccv-kpi-icon" size={17} /></div>
                <div className="ccv-panel-body">
                  <div className="ccv-priority-list">
                    {visiblePriorities.slice(0, 4).map((priority) => (
                      <div className="ccv-priority" key={priority.id} role="button" tabIndex={0} onClick={() => actOnPriority(priority.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") actOnPriority(priority.id); }} data-testid={`button-executive-priority-${priority.id}`}>
                        <span className={`ccv-priority-mark ${priority.color}`} style={{ background: `var(--ccv-${priority.color === "good" ? "teal" : priority.color === "risk" ? "risk" : "signal"})` }} />
                        <span className="ccv-priority-copy"><span className="ccv-priority-title">{priority.title}</span><span className="ccv-priority-detail">{priority.detail}</span></span>
                        <span className={`ccv-status ${priority.color}`}>{priority.level}</span>
                        <button type="button" className="ccv-icon-button" aria-label={`Marcar ${priority.title} como atendida`} onClick={(event) => markPriority(event, priority.id)} data-testid={`button-executive-resolve-${priority.id}`}><Check size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="ccv-panel-link" onClick={() => { setSection("Alertas"); setToast("Mostrando bandeja completa de alertas"); window.setTimeout(() => setToast(""), 2200); }} data-testid="button-executive-all-alerts">Ver bandeja completa <ChevronRight size={13} style={{ verticalAlign: "middle" }} /></button>
                </div>
              </article>
            </section>
            <section className="ccv-grid ccv-three-col">
              <article className="ccv-card">
                <div className="ccv-panel-head"><div><div className="ccv-eyebrow">Resultado por unidad</div><h2 className="ccv-panel-title" style={{ marginTop: 5 }}>Dónde se está haciendo el negocio</h2></div><button type="button" className="ccv-panel-link" onClick={() => setShowSignals(!showSignals)} data-testid="button-executive-toggle-comparison">{showSignals ? "Ocultar detalle" : "Ver comparativo"}</button></div>
                <div className="ccv-panel-body">
                  {units.map((unit) => <div className="ccv-unit-row" key={unit.name} data-testid={`executive-unit-${unit.name.toLowerCase().replaceAll(" ", "-")}`}><span className="ccv-unit-name">{unit.name}</span><div className="ccv-bar"><span className={unit.tone} style={{ transform: `scaleX(${unit.pct / 100})` }} /></div><span className={`ccv-unit-pct ${unit.tone === "good" ? "ccv-up" : "ccv-neutral"}`}>{unit.pct}%</span><span className="ccv-unit-amount">{unit.amount}</span></div>)}
                  {showSignals && <div className="ccv-recovery-callout"><strong>Señal para la reunión de las 16:00</strong><span>Equipos está 16 puntos debajo de Servicios, pero tiene $ 1.36M en pipeline activo. La decisión sugerida es reasignar seguimiento, no descuento.</span></div>}
                </div>
              </article>
              <article className="ccv-card">
                <div className="ccv-panel-head"><div><div className="ccv-eyebrow">Señales rápidas</div><h2 className="ccv-panel-title" style={{ marginTop: 5 }}>Salud del negocio</h2></div><CalendarDays className="ccv-kpi-icon" size={16} /></div>
                <div className="ccv-panel-body ccv-signal-rail">
                  <div className="ccv-signal-block good"><div className="ccv-signal-value">+$ 84K</div><div className="ccv-signal-label">promesas de pago esta semana</div><div className="ccv-signal-caption">14 cuentas con fecha confirmada</div></div>
                  <div className="ccv-signal-block"><div className="ccv-signal-value">19</div><div className="ccv-signal-label">recompras probables</div><div className="ccv-signal-caption">Última compra hace 11 meses</div></div>
                  <div className="ccv-signal-block risk"><div className="ccv-signal-value">3</div><div className="ccv-signal-label">sucursales bajo 75%</div><div className="ccv-signal-caption">Santa Cruz, Tarija, El Alto</div></div>
                </div>
              </article>
              <article className="ccv-card" style={{ minHeight: 190 }}>
                <div className="ccv-panel-head"><div><div className="ccv-eyebrow">Ritmo del día</div><h2 className="ccv-panel-title" style={{ marginTop: 5 }}>Próximo hito</h2></div></div>
                <div className="ccv-panel-body"><div className="ccv-mono" style={{ color: "var(--ccv-signal)", fontSize: "1.4rem" }}>16:00</div><p style={{ color: "var(--ccv-ink)", fontSize: ".72rem", fontWeight: 600, margin: "8px 0 4px" }}>Comité comercial nacional</p><p className="ccv-muted" style={{ fontSize: ".65rem", lineHeight: 1.45, margin: 0 }}>4 compromisos por revisar<br />Participan 6 líderes de unidad</p><button type="button" className="ccv-button secondary" style={{ marginTop: 15, width: "100%" }} onClick={() => setToast("Minuta abierta para el comité")} data-testid="button-executive-open-agenda">Abrir minuta <ChevronRight size={14} /></button></div>
              </article>
            </section>
          </div>
        </main>
      </div>
      {toast && <div className="ccv-toast" role="status"><Check size={15} style={{ color: "var(--ccv-teal)" }} />{toast}</div>}
    </div>
  );
}