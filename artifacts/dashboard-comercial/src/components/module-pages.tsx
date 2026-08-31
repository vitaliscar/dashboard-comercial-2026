import { useState, type ReactElement, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileUp,
  Filter,
  Flame,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { Module } from "../App";

const money = (value: number) =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const compactMoney = (value: number) =>
  value >= 1_000_000
    ? `$ ${(value / 1_000_000).toFixed(2)}M`
    : `$ ${Math.round(value / 1_000)}K`;

function Metric({
  label,
  value,
  detail,
  tone = "primary",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const tones = {
    primary: "text-primary",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-rose-400",
  };
  return (
    <article className="rounded-2xl border border-border bg-card p-5" data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-mono text-2xl font-semibold text-foreground">{value}</p>
      <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${tones[tone]}`}>
        {tone === "danger" || tone === "warning" ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
        {detail}
      </p>
    </article>
  );
}

function PageIntro({
  module,
  eyebrow,
  action,
  actionIcon: ActionIcon = Plus,
}: {
  module: Module;
  eyebrow?: string;
  action?: string;
  actionIcon?: typeof Plus;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow ?? module.group}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">{module.label}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{module.description}</p>
        </div>
        {action && (
          <button
            type="button"
            data-testid={`button-${module.path.slice(1)}-primary-action`}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <ActionIcon size={16} />
            {action}
          </button>
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && (
          <button type="button" className="text-xs font-semibold text-primary hover:underline" data-testid={`button-${title.toLowerCase().replaceAll(" ", "-")}`}>
            {action}
          </button>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function HorizontalBars({ values, color = "bg-primary" }: { values: Array<{ label: string; value: number; note?: string }>; color?: string }) {
  return (
    <div className="space-y-4">
      {values.map((item, index) => (
        <div key={item.label} data-testid={`bar-${index}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{item.label}</span>
            <span className="font-mono font-semibold text-foreground">{item.note ?? `${item.value}%`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, item.value)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardView({ module }: { module: Module }) {
  return (
    <div className="space-y-6">
      <PageIntro module={module} eyebrow="Sala de control" action="Exportar briefing" actionIcon={Download} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ingresos del mes" value="$ 618K" detail="+14.8% vs. julio" tone="success" />
        <Metric label="Meta mensual" value="92.4%" detail="+4.1 pts de avance" />
        <Metric label="Cobertura pipeline" value="2.2x" detail="+0.3x sobre objetivo" tone="success" />
        <Metric label="Riesgos abiertos" value="17" detail="5 requieren atención" tone="warning" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Section title="Pulso por unidad" description="Lectura ejecutiva del avance contra meta" action="Ver comparativo">
          <div className="space-y-5">
            {[
              ["Servicios", 94, "$ 1.18M", "Sobre meta"],
              ["Repuestos", 86, "$ 940K", "Recuperable"],
              ["Equipos", 78, "$ 1.42M", "Pipeline fuerte"],
              ["Alquiler", 71, "$ 328K", "Bajo observación"],
            ].map(([name, value, amount, status], index) => (
              <div key={name} className="grid grid-cols-[88px_1fr_auto] items-center gap-3" data-testid={`dashboard-unit-${index}`}>
                <span className="text-sm font-medium">{name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-background"><div className={`h-full rounded-full ${Number(value) >= 85 ? "bg-emerald-400" : "bg-primary"}`} style={{ width: `${value}%` }} /></div>
                <span className="text-right"><strong className="font-mono text-sm">{value}%</strong><small className="ml-2 text-xs text-muted-foreground">{status}</small></span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Decisiones sugeridas" description="Acciones con mayor impacto esta semana">
          <div className="space-y-3">
            {[
              ["Reasignar foco", "12 oportunidades de Equipos vencen en 7 días", "Alta"],
              ["Destrabar cartera", "$ 84K tienen promesa de pago esta semana", "Media"],
              ["Activar recompra", "19 clientes están listos para una nueva oferta", "Oportunidad"],
            ].map(([title, text, priority], index) => (
              <button type="button" key={title} data-testid={`decision-${index}`} className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/50 p-3 text-left transition hover:border-primary/50">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${index === 0 ? "bg-rose-400" : index === 1 ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs text-muted-foreground">{text}</span></span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{priority}</span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function AlertsView({ module }: { module: Module }) {
  const alerts = [
    ["Cartera vencida crítica", "Transportes Andinos", "$ 42.8K", "3 días sin gestión", "danger"],
    ["Cotización sin seguimiento", "Constructora El Alto", "$ 118K", "Vence mañana", "warning"],
    ["Meta bajo umbral", "Sucursal Santa Cruz", "68% cumplimiento", "−12 pts vs. objetivo", "warning"],
    ["Recompra detectada", "AgroBolivia S.A.", "$ 26.4K potencial", "Última compra hace 11 meses", "success"],
  ] as const;
  return (
    <div className="space-y-6">
      <PageIntro module={module} eyebrow="Centro de control" action="Marcar todo revisado" actionIcon={CheckCircle2} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Alertas activas" value="17" detail="4 nuevas hoy" tone="danger" />
        <Metric label="Impacto en riesgo" value="$ 284K" detail="−8.1% esta semana" tone="warning" />
        <Metric label="Resueltas en 7 días" value="32" detail="+18% de velocidad" tone="success" />
      </div>
      <Section title="Bandeja priorizada" description="Ordenada por impacto comercial y fecha límite">
        <div className="space-y-3">
          {alerts.map(([title, account, amount, timing, tone], index) => (
            <div key={title} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4" data-testid={`alert-row-${index}`}>
              <span className={`flex size-10 items-center justify-center rounded-xl ${tone === "danger" ? "bg-rose-400/10 text-rose-400" : tone === "warning" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"}`}><CircleAlert size={18} /></span>
              <div className="min-w-[190px] flex-1"><strong className="block text-sm">{title}</strong><span className="text-xs text-muted-foreground">{account} · {timing}</span></div>
              <strong className="font-mono text-sm">{amount}</strong>
              <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/50" data-testid={`button-alert-action-${index}`}>Gestionar</button>
            </div>
          ))}
        </div>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Alertas por origen"><HorizontalBars values={[{ label: "Cobranzas", value: 72, note: "8 alertas" }, { label: "Embudo", value: 54, note: "5 alertas" }, { label: "Cumplimiento", value: 33, note: "3 alertas" }, { label: "Clientes", value: 12, note: "1 alerta" }]} color="bg-amber-400" /></Section>
        <Section title="Tiempo medio de atención"><div className="flex items-end gap-3">{[42, 34, 38, 27, 31, 21, 18].map((value, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="flex h-36 w-full items-end"><div className="w-full rounded-t-md bg-primary/75" style={{ height: `${value * 2.3}px` }} /></div><span className="text-[10px] text-muted-foreground">{["L", "M", "X", "J", "V", "S", "D"][index]}</span></div>)}</div><p className="mt-4 text-xs text-muted-foreground">La respuesta mejoró <strong className="text-emerald-400">24%</strong> frente a la semana anterior.</p></Section>
      </div>
    </div>
  );
}

function FunnelView({ module }: { module: Module }) {
  const funnel = [
    ["Cotizaciones creadas", 412, "$ 2.84M", 100],
    ["Con seguimiento", 286, "$ 2.16M", 69],
    ["En negociación", 164, "$ 1.36M", 40],
    ["Ganadas", 97, "$ 784K", 24],
  ];
  return (
    <div className="space-y-6">
      <PageIntro module={module} eyebrow="Conversión comercial" action="Nueva oportunidad" actionIcon={Plus} />
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Pipeline activo" value="$ 1.36M" detail="+12.4% en el mes" tone="success" /><Metric label="Conversión a venta" value="23.5%" detail="+3.8 pts vs. 2025" tone="success" /><Metric label="Ciclo promedio" value="18 días" detail="−2 días de mejora" tone="success" /></div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Section title="Embudo de oportunidades" description="Volumen y valor en cada etapa">
          <div className="space-y-3">
            {funnel.map(([label, count, amount, width], index) => (
              <div key={label} data-testid={`funnel-stage-${index}`}>
                <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium">{label}</span><span className="font-mono text-muted-foreground">{count} · {amount}</span></div>
                <div className="h-10 rounded-lg bg-background p-1"><div className={`flex h-full items-center rounded-md px-3 text-xs font-semibold ${index === 3 ? "bg-emerald-400/80 text-background" : "bg-primary/80 text-primary-foreground"}`} style={{ width: `${width}%` }}>{width}% del inicio</div></div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Cuellos de botella" description="Dónde se está perdiendo velocidad">
          <div className="space-y-4"><HorizontalBars values={[{ label: "Sin próxima actividad", value: 61, note: "126 oportunidades" }, { label: "Más de 14 días estancadas", value: 38, note: "78 oportunidades" }, { label: "Sin decisor identificado", value: 26, note: "54 oportunidades" }]} color="bg-rose-400" /><button type="button" className="mt-2 flex items-center gap-2 text-xs font-semibold text-primary" data-testid="button-funnel-action">Ver oportunidades críticas <ChevronRight size={14} /></button></div>
        </Section>
      </div>
    </div>
  );
}

function ClientsView({ module }: { module: Module }) {
  const [query, setQuery] = useState("");
  const clients = [
    ["AgroBolivia S.A.", "Equipos", "$ 246K", "18 días", "Expansión"],
    ["Constructora El Alto", "Servicios", "$ 184K", "6 días", "Negociación"],
    ["Transportes Andinos", "Repuestos", "$ 142K", "3 días", "Riesgo"],
    ["Minera San Cristóbal", "Lub / Filtros", "$ 98K", "12 días", "Recompra"],
  ];
  const filtered = clients.filter((client) => client[0].toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="space-y-6">
      <PageIntro module={module} eyebrow="Inteligencia de clientes" action="Exportar cartera" actionIcon={Download} />
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Clientes activos" value="384" detail="+22 este trimestre" tone="success" /><Metric label="Valor promedio" value="$ 12.6K" detail="+6.4% anual" /><Metric label="Recompra probable" value="19" detail="$ 146K potencial" tone="success" /></div>
      <Section title="Cartera priorizada" description="Busca clientes para preparar una próxima conversación">
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente..." className="w-full bg-transparent text-sm outline-none" data-testid="input-client-search" /></label>
          <button type="button" className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold" data-testid="button-client-filters"><SlidersHorizontal size={15} />Filtros</button>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 font-medium">Cliente</th><th className="pb-3 font-medium">Unidad</th><th className="pb-3 font-medium">Valor 12m</th><th className="pb-3 font-medium">Última compra</th><th className="pb-3 font-medium">Señal</th><th /></tr></thead><tbody>{filtered.map((client, index) => <tr key={client[0]} className="border-b border-border/60 last:border-0" data-testid={`client-row-${index}`}><td className="py-4 font-medium">{client[0]}</td><td className="py-4 text-muted-foreground">{client[1]}</td><td className="py-4 font-mono">{client[2]}</td><td className="py-4 text-muted-foreground">{client[3]}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${client[4] === "Riesgo" ? "bg-rose-400/10 text-rose-400" : "bg-emerald-400/10 text-emerald-400"}`}>{client[4]}</span></td><td className="py-4 text-right"><button type="button" className="text-primary" data-testid={`button-client-detail-${index}`}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div>
      </Section>
    </div>
  );
}

function AdvisorsView({ module }: { module: Module }) {
  const advisors = [["María Fernanda Rojas", "Santa Cruz", "118%", "$ 184K", "24"], ["Carlos Méndez", "La Paz", "104%", "$ 162K", "19"], ["Andrea Salvatierra", "Cochabamba", "96%", "$ 148K", "21"], ["Luis Vargas", "Tarija", "82%", "$ 109K", "14"]];
  return (
    <div className="space-y-6"><PageIntro module={module} eyebrow="Fuerza comercial" action="Comparar asesores" actionIcon={UsersRound} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Asesores activos" value="28" detail="26 con actividad esta semana" /><Metric label="Cumplimiento promedio" value="94%" detail="+6 pts vs. mes anterior" tone="success" /><Metric label="Oportunidades por asesor" value="14.7" detail="−1.2 de carga promedio" tone="success" /></div><div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]"><Section title="Ranking de desempeño" description="Resultado contra meta y producción"><div className="space-y-2">{advisors.map((advisor, index) => <div key={advisor[0]} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl border border-border p-3" data-testid={`advisor-row-${index}`}><span className="font-mono text-sm text-muted-foreground">0{index + 1}</span><div><strong className="block text-sm">{advisor[0]}</strong><span className="text-xs text-muted-foreground">{advisor[1]} · {advisor[4]} oportunidades ganadas</span></div><strong className={`font-mono text-sm ${Number(advisor[2].slice(0, -1)) >= 100 ? "text-emerald-400" : "text-amber-400"}`}>{advisor[2]}</strong></div>)}</div></Section><Section title="Actividad comercial" description="Interacciones registradas esta semana"><HorizontalBars values={[{ label: "Seguimientos completados", value: 82, note: "184" }, { label: "Reuniones realizadas", value: 64, note: "72" }, { label: "Próximas actividades", value: 48, note: "128" }, { label: "Cotizaciones enviadas", value: 37, note: "96" }]} /></Section></div></div>
  );
}

function MinutesView({ module }: { module: Module }) {
  const meetings = [["Comité comercial nacional", "Hoy · 16:00", "4 compromisos", "Gerencia"], ["Revisión sucursal Santa Cruz", "Mañana · 09:30", "7 compromisos", "Operaciones"], ["Seguimiento AgroBolivia", "03 sep · 11:00", "2 compromisos", "Equipos"]];
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Ritmo de ejecución" action="Nueva minuta" actionIcon={Plus} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Compromisos abiertos" value="31" detail="9 vencen esta semana" tone="warning" /><Metric label="Cumplimiento" value="78%" detail="+11 pts este mes" tone="success" /><Metric label="Reuniones del mes" value="24" detail="18 con minuta creada" /></div><Section title="Agenda y compromisos" description="La minuta deja claro quién hace qué y cuándo"><div className="space-y-3">{meetings.map((meeting, index) => <div key={meeting[0]} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4" data-testid={`meeting-row-${index}`}><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 size={18} /></span><div className="min-w-[210px] flex-1"><strong className="block text-sm">{meeting[0]}</strong><span className="text-xs text-muted-foreground">{meeting[1]} · {meeting[3]}</span></div><span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-400">{meeting[2]}</span><button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold" data-testid={`button-meeting-open-${index}`}>Abrir minuta</button></div>)}</div></Section></div>;
}

function SimulatorView({ module }: { module: Module }) {
  const [growth, setGrowth] = useState(12);
  const [recovery, setRecovery] = useState(8);
  const projection = 4_820_000 * (1 + growth / 100) + 284_000 * (recovery / 100);
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Planeación comercial" action="Guardar escenario" actionIcon={CheckCircle2} /><div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]"><Section title="Ajusta las palancas" description="Explora qué ocurriría si el equipo cambia el ritmo"><div className="space-y-7"><label className="block"><span className="flex justify-between text-sm font-medium"><span>Crecimiento de ventas</span><strong className="font-mono text-primary">+{growth}%</strong></span><input type="range" min="0" max="30" value={growth} onChange={(event) => setGrowth(Number(event.target.value))} className="mt-4 w-full accent-[var(--primary)]" data-testid="input-simulator-growth" /><span className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Conservador</span><span>Agresivo</span></span></label><label className="block"><span className="flex justify-between text-sm font-medium"><span>Recuperación de cartera</span><strong className="font-mono text-emerald-400">+{recovery}%</strong></span><input type="range" min="0" max="25" value={recovery} onChange={(event) => setRecovery(Number(event.target.value))} className="mt-4 w-full accent-[var(--primary)]" data-testid="input-simulator-recovery" /><span className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Base actual</span><span>Plan intensivo</span></span></label></div></Section><Section title="Resultado proyectado" description="Escenario sobre la base acumulada actual"><div className="rounded-2xl bg-primary/10 p-6"><p className="text-xs uppercase tracking-[0.14em] text-primary">Facturación estimada</p><p className="mt-2 font-mono text-4xl font-semibold">{compactMoney(projection)}</p><p className="mt-2 text-sm text-muted-foreground">Una mejora de <strong className="text-emerald-400">{compactMoney(projection - 4_820_000)}</strong> frente a la base actual.</p></div><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Ventas incrementales" value={compactMoney(4_820_000 * growth / 100)} detail="por crecimiento" tone="success" /><Metric label="Cartera recuperada" value={compactMoney(284_000 * recovery / 100)} detail="por gestión" tone="success" /></div></Section></div></div>;
}

function CollectionsView({ module }: { module: Module }) {
  const aging = [{ label: "Al día", value: 54, note: "$ 612K" }, { label: "1–30 días", value: 21, note: "$ 238K" }, { label: "31–60 días", value: 14, note: "$ 158K" }, { label: "+60 días", value: 11, note: "$ 126K" }];
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Salud financiera" action="Registrar gestión" actionIcon={Plus} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Cartera total" value="$ 1.13M" detail="+2.8% mensual" /><Metric label="Vencida" value="$ 284K" detail="25.1% de cartera" tone="warning" /><Metric label="Recuperado mes" value="$ 176K" detail="+18.4% vs. julio" tone="success" /><Metric label="Promesas vigentes" value="42" detail="$ 84K comprometidos" tone="success" /></div><div className="grid gap-6 lg:grid-cols-2"><Section title="Antigüedad de cartera" description="Distribución del saldo por días"><HorizontalBars values={aging} color="bg-amber-400" /></Section><Section title="Cuentas que requieren llamada" description="Mayor saldo y mayor probabilidad de recuperación"><div className="space-y-3">{[["Transportes Andinos", "$ 42.8K", "Promesa vencida"], ["Hotel Los Tajibos", "$ 31.2K", "Sin contacto 12 días"], ["Industrias Vinto", "$ 24.6K", "Compromiso mañana"]].map((item, index) => <div key={item[0]} className="flex items-center gap-3 rounded-xl border border-border p-3" data-testid={`collection-account-${index}`}><span className="flex size-9 items-center justify-center rounded-lg bg-rose-400/10 text-rose-400"><Flame size={16} /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item[0]}</strong><span className="text-xs text-muted-foreground">{item[2]}</span></div><strong className="font-mono text-sm">{item[1]}</strong></div>)}</div></Section></div></div>;
}

function CommissionsView({ module }: { module: Module }) {
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Incentivos comerciales" action="Descargar liquidación" actionIcon={Download} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Bolsa estimada" value="$ 86.4K" detail="+9.2% vs. julio" tone="success" /><Metric label="Asesores elegibles" value="24 / 28" detail="85.7% de la fuerza" /><Metric label="Cumplimiento promedio" value="94%" detail="+6 pts este mes" tone="success" /></div><Section title="Estado de liquidación" description="Reglas vigentes para agosto 2026"><div className="grid gap-3 md:grid-cols-3">{[["Servicios", "5.0%", "Sobre meta", "bg-emerald-400/10 text-emerald-400"], ["Repuestos", "3.5%", "En revisión", "bg-amber-400/10 text-amber-400"], ["Equipos", "2.8%", "Calculada", "bg-primary/10 text-primary"]].map((item, index) => <div key={item[0]} className="rounded-xl border border-border p-4" data-testid={`commission-rule-${index}`}><div className="flex items-center justify-between"><span className="text-sm font-semibold">{item[0]}</span><MoreHorizontal size={16} className="text-muted-foreground" /></div><p className="mt-4 font-mono text-2xl">{item[1]}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${item[3]}`}>{item[2]}</span></div>)}</div></Section></div>;
}

function ParetoView({ module }: { module: Module }) {
  const clients = [["AgroBolivia S.A.", 246, 18], ["Constructora El Alto", 184, 31], ["Transportes Andinos", 142, 41], ["Minera San Cristóbal", 98, 48], ["Hotel Los Tajibos", 82, 54]];
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Concentración de ingresos" action="Exportar análisis" actionIcon={Download} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Top 10 clientes" value="64%" detail="de la facturación total" /><Metric label="Cliente principal" value="$ 246K" detail="18% de concentración" /><Metric label="Índice de riesgo" value="Medio" detail="2 cuentas bajo alerta" tone="warning" /></div><Section title="Curva de concentración" description="Clientes ordenados de mayor a menor facturación"><div className="space-y-3">{clients.map((client, index) => <div key={client[0]} className="grid grid-cols-[24px_150px_1fr_58px] items-center gap-3" data-testid={`pareto-row-${index}`}><span className="font-mono text-xs text-muted-foreground">{index + 1}</span><span className="truncate text-xs">{client[0]}</span><div className="h-7 rounded-md bg-background"><div className="flex h-full items-center rounded-md bg-primary/75 px-2 text-[10px] font-semibold" style={{ width: `${Math.max(22, 100 - index * 14)}%` }}>{client[2]}% acumulado</div></div><span className="text-right font-mono text-xs">${client[1]}K</span></div>)}</div></Section></div>;
}

function MarketingView({ module }: { module: Module }) {
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Demanda y crecimiento" action="Nueva campaña" actionIcon={Sparkles} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Leads generados" value="684" detail="+21% vs. julio" tone="success" /><Metric label="Conversión MQL" value="18.6%" detail="+2.4 pts" tone="success" /><Metric label="Pipeline influenciado" value="$ 412K" detail="30% del pipeline" /></div><div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"><Section title="Canales de adquisición" description="Qué fuentes están trayendo oportunidades"><HorizontalBars values={[{ label: "Referidos", value: 84, note: "188 leads" }, { label: "Eventos y ferias", value: 62, note: "142 leads" }, { label: "Digital orgánico", value: 49, note: "218 leads" }, { label: "Paid media", value: 31, note: "136 leads" }]} color="bg-emerald-400" /></Section><Section title="Campañas en curso"><div className="space-y-3">{[["Feria Agro 2026", "42 leads", "18.4x ROI"], ["Plan renovación filtros", "86 leads", "9.2x ROI"], ["Demo flota pesada", "24 leads", "6.8x ROI"]].map((campaign, index) => <div key={campaign[0]} className="rounded-xl border border-border p-3" data-testid={`campaign-row-${index}`}><div className="flex items-center justify-between gap-3"><strong className="text-sm">{campaign[0]}</strong><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-400">Activa</span></div><p className="mt-3 flex justify-between text-xs text-muted-foreground"><span>{campaign[1]}</span><strong className="font-mono text-foreground">{campaign[2]}</strong></p></div>)}</div></Section></div></div>;
}

const unitConfig: Record<string, { eyebrow: string; metrics: Array<[string, string, string, "primary" | "success" | "warning"]>; bars: Array<{ label: string; value: number; note: string }>; rows: Array<[string, string, string]> }> = {
  "/servicios": { eyebrow: "Unidad Servicios", metrics: [["Facturación", "$ 1.18M", "+14.2% mensual", "success"], ["Cumplimiento", "94%", "+6.8 pts", "success"], ["OTs cerradas", "384", "+28 este mes", "primary"]], bars: [{ label: "Taller central", value: 96, note: "96%" }, { label: "Santa Cruz", value: 91, note: "91%" }, { label: "La Paz", value: 86, note: "86%" }, { label: "Cochabamba", value: 79, note: "79%" }], rows: [["Mantenimiento preventivo", "$ 426K", "36%"], ["Reparación pesada", "$ 384K", "33%"], ["Garantías", "$ 218K", "18%"]] },
  "/repuestos": { eyebrow: "Unidad Repuestos", metrics: [["Facturación", "$ 940K", "+8.6% mensual", "success"], ["Cumplimiento", "86%", "+3.2 pts", "primary"], ["Rotación inventario", "4.8x", "+0.4x", "success"]], bars: [{ label: "Filtros", value: 92, note: "92%" }, { label: "Desgaste", value: 84, note: "84%" }, { label: "Motor", value: 77, note: "77%" }, { label: "Carrocería", value: 64, note: "64%" }], rows: [["Filtros y lubricantes", "$ 318K", "34%"], ["Componentes de motor", "$ 264K", "28%"], ["Desgaste y frenos", "$ 196K", "21%"]] },
  "/lubfiltros": { eyebrow: "Unidad Lubricantes y Filtros", metrics: [["Facturación", "$ 612K", "+11.1% mensual", "success"], ["Cumplimiento", "89%", "+4.7 pts", "success"], ["Clientes recurrentes", "142", "+16 clientes", "primary"]], bars: [{ label: "Santa Cruz", value: 94, note: "94%" }, { label: "La Paz", value: 88, note: "88%" }, { label: "Oriente", value: 83, note: "83%" }, { label: "Occidente", value: 72, note: "72%" }], rows: [["Aceites premium", "$ 286K", "47%"], ["Filtros de aire", "$ 174K", "28%"], ["Filtros hidráulicos", "$ 98K", "16%"]] },
  "/equipos": { eyebrow: "Unidad Equipos", metrics: [["Facturación", "$ 1.42M", "+18.8% mensual", "success"], ["Cumplimiento", "78%", "+5.4 pts", "primary"], ["Pipeline", "$ 1.36M", "42 oportunidades", "warning"]], bars: [{ label: "Maquinaria pesada", value: 88, note: "88%" }, { label: "Construcción", value: 79, note: "79%" }, { label: "Agroindustria", value: 74, note: "74%" }, { label: "Logística", value: 62, note: "62%" }], rows: [["Excavadoras", "$ 486K", "34%"], ["Cargadores", "$ 392K", "28%"], ["Generadores", "$ 248K", "17%"]] },
  "/alquiler": { eyebrow: "Unidad Alquiler", metrics: [["Facturación", "$ 328K", "+5.4% mensual", "success"], ["Ocupación", "71%", "−4.2 pts", "warning"], ["Flota disponible", "48", "12 en mantenimiento", "primary"]], bars: [{ label: "Equipos compactos", value: 84, note: "84%" }, { label: "Plataformas", value: 76, note: "76%" }, { label: "Torres de iluminación", value: 68, note: "68%" }, { label: "Generadores", value: 55, note: "55%" }], rows: [["Alquiler mensual", "$ 184K", "56%"], ["Alquiler semanal", "$ 92K", "28%"], ["Servicios adicionales", "$ 52K", "16%"]] },
};

function UnitView({ module }: { module: Module }) {
  const config = unitConfig[module.path] ?? unitConfig["/servicios"];
  return <div className="space-y-6"><PageIntro module={module} eyebrow={config.eyebrow} action="Descargar reporte" actionIcon={Download} /><div className="grid gap-4 sm:grid-cols-3">{config.metrics.map((metric, index) => <Metric key={metric[0]} label={metric[0]} value={metric[1]} detail={metric[2]} tone={metric[3]} />)}</div><div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]"><Section title="Desempeño por zona" description="Cumplimiento contra meta mensual"><HorizontalBars values={config.bars} color="bg-primary" /></Section><Section title="Mix de negocio" description="Distribución de la facturación acumulada"><div className="space-y-2">{config.rows.map((row, index) => <div key={row[0]} className="flex items-center gap-3 rounded-xl border border-border p-3" data-testid={`unit-mix-row-${index}`}><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">0{index + 1}</span><span className="flex-1 text-sm">{row[0]}</span><strong className="font-mono text-sm">{row[1]}</strong><span className="w-10 text-right text-xs text-muted-foreground">{row[2]}</span></div>)}</div></Section></div></div>;
}

function LoadView({ module }: { module: Module }) {
  return <div className="space-y-6"><PageIntro module={module} eyebrow="Administración de datos" action="Descargar plantilla" actionIcon={Download} /><div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]"><Section title="Nueva carga comercial" description="Valida el archivo antes de publicar cambios en el dashboard"><div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-6 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileUp size={24} /></span><h4 className="mt-4 font-display text-lg font-semibold">Suelta tu archivo Excel aquí</h4><p className="mt-1 max-w-sm text-xs text-muted-foreground">Usa la plantilla comercial 2026. La carga se valida y se muestra como vista previa antes de reemplazar datos.</p><button type="button" className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground" data-testid="button-load-file">Seleccionar archivo</button></div></Section><Section title="Última carga" description="Estado de las fuentes comerciales"><div className="rounded-xl border border-border p-4"><div className="flex items-center gap-3"><CheckCircle2 className="text-emerald-400" size={19} /><div><strong className="block text-sm">Comercial_Agosto_2026.xlsx</strong><span className="text-xs text-muted-foreground">Actualizada hoy a las 08:42 · 18,642 filas procesadas</span></div></div><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="Filas válidas" value="18,616" detail="99.9% del archivo" tone="success" /><Metric label="Advertencias" value="26" detail="Revisar antes de publicar" tone="warning" /></div></div></Section></div></div>;
}

function AdminView({ module, adjustments = false }: { module: Module; adjustments?: boolean }) {
  const rows = adjustments ? [["Meta Repuestos · agosto", "Gerencia Nacional", "$ 42K", "Aprobado"], ["Corrección venta perdida", "Admin Comercial", "$ 8.4K", "Pendiente"], ["Meta Equipos · agosto", "Gerencia Nacional", "$ 118K", "Aprobado"]] : [["María Fernanda Rojas", "Asesora", "Santa Cruz", "Activo"], ["Carlos Méndez", "Coordinador", "La Paz", "Activo"], ["Andrea Salvatierra", "Gerente comercial", "Nacional", "Activo"], ["Luis Vargas", "Asesor", "Tarija", "Invitado"]];
  return <div className="space-y-6"><PageIntro module={module} eyebrow={adjustments ? "Gobierno de datos" : "Gobierno de acceso"} action={adjustments ? "Nuevo ajuste" : "Invitar usuario"} actionIcon={adjustments ? Plus : UserRound} /><div className="grid gap-4 sm:grid-cols-3"><Metric label={adjustments ? "Ajustes del mes" : "Usuarios activos"} value={adjustments ? "14" : "28"} detail={adjustments ? "3 pendientes de revisión" : "4 roles configurados"} /><Metric label={adjustments ? "Impacto acumulado" : "Cobertura nacional"} value={adjustments ? "$ 186K" : "100%"} detail={adjustments ? "+8.2% vs. mes anterior" : "9 sucursales conectadas"} tone="success" /><Metric label="Última revisión" value="Hoy" detail="08:42 · sin incidentes" tone="success" /></div><Section title={adjustments ? "Historial de ajustes" : "Directorio y permisos"} description={adjustments ? "Trazabilidad de cambios manuales autorizados" : "Personas, rol y alcance operativo"}><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">{(adjustments ? ["Concepto", "Solicitante", "Valor", "Estado"] : ["Usuario", "Rol", "Alcance", "Estado"]).map((heading) => <th key={heading} className="pb-3 font-medium">{heading}</th>)}<th /></tr></thead><tbody>{rows.map((row, index) => <tr key={row[0]} className="border-b border-border/60 last:border-0" data-testid={`admin-row-${index}`}>{row.map((cell, cellIndex) => <td key={cell} className={`py-4 ${cellIndex === 2 ? "font-mono" : cellIndex === 3 ? "text-xs" : ""}`}>{cellIndex === 3 ? <span className={`rounded-full px-2.5 py-1 font-bold ${cell === "Pendiente" || cell === "Invitado" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"}`}>{cell}</span> : cell}</td>)}<td className="py-4 text-right"><button type="button" className="text-primary" data-testid={`button-admin-row-${index}`}><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div></Section></div>;
}

export function ModulePage({ module }: { module: Module }) {
  const views: Record<string, (props: { module: Module }) => ReactElement> = {
    "/dashboard": DashboardView,
    "/alertas": AlertsView,
    "/embudo": FunnelView,
    "/cliente-360": ClientsView,
    "/asesores": AdvisorsView,
    "/minutas": MinutesView,
    "/simulador": SimulatorView,
    "/cobranzas": CollectionsView,
    "/comisiones": CommissionsView,
    "/pareto": ParetoView,
    "/mercadeo": MarketingView,
    "/carga": LoadView,
    "/usuarios": (props) => <AdminView {...props} />,
    "/ajustes-manuales": (props) => <AdminView {...props} adjustments />,
    ...Object.fromEntries(Object.keys(unitConfig).map((path) => [path, UnitView])),
  };
  const View = views[module.path] ?? DashboardView;
  return <View module={module} />;
}