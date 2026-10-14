import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { getCarteraIntegral, getCarteraVentas, getCliente360, type CarteraIntegralCliente, type CarteraVentasCliente, type Cliente360Fuente } from "@/lib/cliente-360-http";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { PageHeader } from "@/components/page-header";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { money } from "@/lib/format";

const PAGE_SIZE = 25;
const CONTEXT_SOURCES: Cliente360Fuente[] = ["cotizado", "perdido"];
type RelationFilter = "todos" | "asignado" | "esporadico" | "mixto";
type Assignment = CarteraIntegralCliente["asignaciones"][number];
type ClientBranch = {
  id: string;
  name: string;
  amount: number;
  assignedAmount: number;
  sporadicAmount: number;
  assignedSale: boolean;
  hasSporadicSale: boolean;
  assignments: Assignment[];
  advisors: Array<{ codigoAsesor: string | null; asesor: string | null }>;
  units: Array<{ unidad: string; monto: string | number }>;
  latestSale?: string | null;
};
type ClientRow = {
  code: string;
  name: string;
  current: number;
  quoted: number;
  lost: number;
  branches: Map<string, ClientBranch>;
};

const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
const contextKey = (branchId: string | null, name: string) => `${branchId ?? ""}\0${normalize(name)}`;
const percent = (value: number) => `${value.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;
type AdvisorNameSource = { codigoAsesor?: string | null; asesor?: string | null };
const CANONICAL_ADVISOR_BY_CODE: Record<string, string> = {
  "57995": "Felix Conde",
  "44711": "Onesimo Rodriguez",
  "46128": "Carlos Boom",
  "46125": "Cesar Ramirez",
  "80068": "Abel Briceño",
  "45499": "Jose Martinez",
  "81459": "Melvin Ramirez",
  "45497": "Henrry Urdaneta",
  "49935": "John Hernandez",
  "78297": "Jesus Chavez",
  "81300": "Anjjel Telleria",
  "45511": "Omer Galban",
  "60493": "Jose Urdaneta",
  "93031": "Elsio Romero",
  "45501": "Leonel Avila",
};
const CANONICAL_ADVISOR_BY_NAME: Record<string, string> = {
  "felix conde": "Felix Conde",
  "conde cedeno felix ernesto": "Felix Conde",
  "conde felix": "Felix Conde",
  "leonel avila": "Leonel Avila",
  "avila leonel": "Leonel Avila",
  "briceno abel": "Abel Briceño",
  "brice o r": "Abel Briceño",
  "briceno r": "Abel Briceño",
  "briceno": "Abel Briceño",
  "abel d": "Abel Briceño",
  "anjjel telleria": "Anjjel Telleria",
  "telleria anjjel": "Anjjel Telleria",
  "jose urdaneta": "Jose Urdaneta",
  "urdaneta jose": "Jose Urdaneta",
  "cesar ramirez": "Cesar Ramirez",
  "ramirez cesar": "Cesar Ramirez",
  "jesus chavez": "Jesus Chavez",
  "chavez jesus": "Jesus Chavez",
  "chavez s": "Jesus Chavez",
  "jesus j": "Jesus Chavez",
  "otaiza juan": "Juan Otaiza",
  "otaiza r": "Juan Otaiza",
  "juan m": "Juan Otaiza",
  "harnandez castillo robert dani": "Robert Hernandez",
  "hernandez robert": "Robert Hernandez",
  "betancourt marcano alfredo ale": "Alfredo Betancourt",
  "betancourt alfredo": "Alfredo Betancourt",
  "mendoza croes cesar augusto": "Cesar Mendoza",
  "mendoza cesar": "Cesar Mendoza",
  "barillas samael": "Samael Barillas",
  "barrillas villamizar samael": "Samael Barillas",
  "rangel ruza diana c": "Diana Rangel",
  "gomez c": "Javier Gomez",
  "javier amilkar": "Javier Gomez",
  "gomez javier": "Javier Gomez",
};

function normalizeAdvisorName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function displayAdvisorName({ codigoAsesor, asesor }: AdvisorNameSource): string | null {
  const code = codigoAsesor?.trim();
  const name = asesor?.trim().replace(/\s+/g, " ");
  if (code && CANONICAL_ADVISOR_BY_CODE[code]) return CANONICAL_ADVISOR_BY_CODE[code];
  if (!name) return null;
  const key = normalizeAdvisorName(name);
  if (CANONICAL_ADVISOR_BY_NAME[key]) return CANONICAL_ADVISOR_BY_NAME[key];
  if (key.includes("abel") || key.startsWith("brice") || key.startsWith("briceno")) return "Abel Briceño";
  const words = name
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!words.length) return null;
  return words.join(" ").toLocaleLowerCase("es").replace(/(^|[\s'-])(\p{L})/gu, (_, boundary: string, letter: string) => boundary + letter.toLocaleUpperCase("es"));
}

function advisorNamesFor(assignments: readonly AdvisorNameSource[], advisors: readonly AdvisorNameSource[]): string[] {
  const byAdvisorCode = new Map<string, string>();
  const namesWithoutCode = new Set<string>();
  for (const advisor of [...assignments, ...advisors]) {
    const name = displayAdvisorName(advisor);
    if (!name) continue;
    const code = advisor.codigoAsesor?.trim();
    if (code) byAdvisorCode.set(code, name);
    else namesWithoutCode.add(name);
  }
  return [...new Set([...byAdvisorCode.values(), ...namesWithoutCode])];
}

function classify(row: ClientRow): Exclude<RelationFilter, "todos"> {
  const assigned = [...row.branches.values()].some((branch) => branch.assignments.length > 0 || branch.assignedSale);
  const sporadic = [...row.branches.values()].some((branch) => branch.hasSporadicSale);
  return assigned && sporadic ? "mixto" : assigned ? "asignado" : "esporadico";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("es-VE") : "—";
}

function ClientMetric({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "positive" | "warning" }) {
  const toneClass = tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : tone === "warning" ? "text-amber-700 dark:text-amber-300" : "text-foreground";
  return <article className="rounded-lg border border-border bg-card p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <strong className={`mt-2 block text-xl tabular-nums ${toneClass}`}>{value}</strong>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>;
}

export default function Cliente360Page() {
  const { session } = useAuth();
  const { filters } = useSharedFilters();
  const [search, setSearch] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("cliente") ?? "");
  const [relation, setRelation] = useState<RelationFilter>("todos");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const months = Array.isArray(filters.meses) ? filters.meses.map(Number) : [];
  const request = { anio: Number(filters.anio), meses: months, unidades: filters.unidades, sucursales: filters.sucursales };
  const queryKey = [request.anio, request.meses, request.unidades, request.sucursales];

  const currentQuery = useQuery({
    queryKey: ["cliente-360", "facturado", ...queryKey],
    enabled: Boolean(session),
    queryFn: () => getCarteraVentas(request),
  });
  const portfolioQuery = useQuery({
    queryKey: ["cliente-360", "cartera-integral", filters.sucursales],
    enabled: Boolean(session),
    queryFn: () => getCarteraIntegral({ sucursales: filters.sucursales }),
  });
  const quoteQuery = useQuery({
    queryKey: ["cliente-360", "contexto-cotizado", ...queryKey],
    enabled: Boolean(session),
    queryFn: () => getCliente360({ ...request, fuente: "cotizado" }),
  });
  const lostQuery = useQuery({
    queryKey: ["cliente-360", "contexto-perdido", ...queryKey],
    enabled: Boolean(session),
    queryFn: () => getCliente360({ ...request, fuente: "perdido" }),
  });

  const rows = useMemo(() => {
    const byCode = new Map<string, ClientRow>();
    const getOrCreate = (code: string, name: string) => {
      let row = byCode.get(code);
      if (!row) {
        row = { code, name: name.trim() || code, current: 0, quoted: 0, lost: 0, branches: new Map() };
        byCode.set(code, row);
      } else if ((!row.name || row.name === row.code) && name.trim()) row.name = name.trim();
      return row;
    };
    const getBranch = (row: ClientRow, id: string, name: string) => {
      let branch = row.branches.get(id);
      if (!branch) {
        branch = { id, name, amount: 0, assignedAmount: 0, sporadicAmount: 0, assignedSale: false, hasSporadicSale: false, assignments: [], advisors: [], units: [] };
        row.branches.set(id, branch);
      }
      return branch;
    };

    for (const client of portfolioQuery.data?.clientes ?? []) {
      const row = getOrCreate(client.codigoCliente, client.cliente);
      for (const assignment of client.asignaciones) {
        const branch = getBranch(row, assignment.sucursalId, assignment.sucursal);
        if (!branch.assignments.some((item) => item.codigoAsesor === assignment.codigoAsesor && item.sucursalId === assignment.sucursalId)) branch.assignments.push(assignment);
      }
    }

    const addSales = (sales: CarteraVentasCliente[]) => {
      for (const sale of sales) {
        if (!sale.codigoCliente || !sale.sucursalId) continue;
        const row = getOrCreate(sale.codigoCliente, sale.cliente);
        const branch = getBranch(row, sale.sucursalId, sale.sucursal);
        const amount = Number(sale.monto) || 0;
        row.current += amount;
        branch.amount += amount;
        const assignedAmount = Number(sale.montoCartera ?? (sale.esCartera ? amount : 0)) || 0;
        const sporadicAmount = Number(sale.montoEsporadico ?? (sale.esCartera ? 0 : amount)) || 0;
        branch.assignedAmount += assignedAmount;
        branch.sporadicAmount += sporadicAmount;
        branch.assignedSale ||= assignedAmount > 0;
        branch.hasSporadicSale ||= sporadicAmount > 0;
        branch.latestSale = sale.ultimaVenta ?? branch.latestSale;
        for (const advisor of sale.asesores ?? []) {
          const exists = branch.advisors.some((item) => item.codigoAsesor === advisor.codigoAsesor && item.asesor === advisor.asesor);
          if (!exists) branch.advisors.push(advisor);
        }
        const unitAmounts = new Map(branch.units.map((unit) => [unit.unidad, Number(unit.monto) || 0]));
        for (const unit of sale.desgloseUnidad ?? []) unitAmounts.set(unit.unidad, (unitAmounts.get(unit.unidad) ?? 0) + (Number(unit.monto) || 0));
        branch.units = [...unitAmounts].map(([unidad, monto]) => ({ unidad, monto }));
      }
    };
    addSales(currentQuery.data?.clientes ?? []);

    const nameToCodes = new Map<string, Set<string>>();
    for (const row of byCode.values()) for (const branch of row.branches.values()) {
      const key = contextKey(branch.id, row.name);
      const codes = nameToCodes.get(key) ?? new Set<string>();
      codes.add(row.code);
      nameToCodes.set(key, codes);
    }
    const attachContext = (context: Array<{ cliente: string; monto: string | number; sucursalId: string | null }> | undefined, field: "quoted" | "lost") => {
      for (const item of context ?? []) {
        const codes = nameToCodes.get(contextKey(item.sucursalId, item.cliente));
        if (!codes || codes.size !== 1) continue;
        const row = byCode.get([...codes][0]);
        if (row) row[field] += Number(item.monto) || 0;
      }
    };
    attachContext(quoteQuery.data?.pareto, "quoted");
    attachContext(lostQuery.data?.pareto, "lost");

    return [...byCode.values()].sort((a, b) => b.current - a.current || a.name.localeCompare(b.name, "es"));
  }, [currentQuery.data?.clientes, lostQuery.data?.pareto, portfolioQuery.data?.clientes, quoteQuery.data?.pareto]);

  const searched = useMemo(() => {
    const term = normalize(search);
    return rows.filter((row) => {
      if (relation !== "todos" && classify(row) !== relation) return false;
      if (!term) return true;
      return [row.code, row.name, ...[...row.branches.values()].flatMap((branch) => [branch.name, ...branch.assignments.map((item) => item.asesor)])].some((value) => normalize(value).includes(term));
    });
  }, [rows, search, relation]);

  const activeAssigned = rows.filter((row) => [...row.branches.values()].some((branch) => branch.assignedAmount > 0)).length;
  const assignedCount = rows.filter((row) => [...row.branches.values()].some((branch) => branch.assignments.length > 0)).length;
  const noPurchase = rows.filter((row) => [...row.branches.values()].some((branch) => branch.assignments.length > 0) && ![...row.branches.values()].some((branch) => branch.assignedAmount > 0)).length;
  const currentTotal = (currentQuery.data?.resumen ?? []).reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
  const assignedSales = Number(currentQuery.data?.resumen.find((item) => item.tipo === "cartera")?.monto ?? 0);
  const sporadicSales = Number(currentQuery.data?.resumen.find((item) => item.tipo === "esporadico")?.monto ?? 0);
  const classifiedSales = assignedSales + sporadicSales;
  const leading = rows.filter((row) => row.current > 0).slice(0, 5);
  const topFiveShare = classifiedSales > 0 ? leading.reduce((sum, row) => sum + row.current, 0) / classifiedSales * 100 : 0;
  const pageCount = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleRows = searched.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE);
  const loading = currentQuery.isLoading || portfolioQuery.isLoading || quoteQuery.isLoading || lostQuery.isLoading;
  const error = currentQuery.error ?? portfolioQuery.error ?? quoteQuery.error ?? lostQuery.error;

  return <div className="ccv-client-list-page flex flex-col gap-5">
    <PageHeader eyebrow="Gestión comercial" title="Facturación por cliente" description="Una fila por código de cliente; expande cada cliente para ver sucursales, asesores y unidades." />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de facturación por cliente">
      <ClientMetric label="Facturado en el período" value={money(currentTotal)} detail={`${rows.filter((row) => row.current > 0).length} clientes con compra`} />
      <ClientMetric label="Venta a clientes cartera" value={money(assignedSales)} detail={`${classifiedSales > 0 ? percent(assignedSales / classifiedSales * 100) : "0%"} de la venta identificada`} tone="positive" />
      <ClientMetric label="Cartera activa" value={`${activeAssigned} / ${assignedCount}`} detail="Clientes cartera con compra / total en cartera" />
      <ClientMetric label="Clientes cartera sin compra" value={String(noPurchase)} detail="Alerta de actividad en el período" tone={noPurchase ? "warning" : "default"} />
    </section>
    <section className="rounded-lg border border-border bg-card p-4" aria-label="Participación de ventas por tipo de cliente">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Clientes cartera y esporádicos</h2><p className="text-xs text-muted-foreground">Cartera comercial; separada de las cuentas por cobrar.</p></div>
        <div className="flex flex-wrap gap-4 text-sm"><span>Cartera <strong className="tabular-nums">{classifiedSales > 0 ? percent(assignedSales / classifiedSales * 100) : "0%"}</strong></span><span>Esporádicos <strong className="tabular-nums">{classifiedSales > 0 ? percent(sporadicSales / classifiedSales * 100) : "0%"}</strong></span><span>Top 5 <strong className="tabular-nums">{percent(topFiveShare)}</strong></span></div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`Cartera ${percent(classifiedSales > 0 ? assignedSales / classifiedSales * 100 : 0)}, esporádicos ${percent(classifiedSales > 0 ? sporadicSales / classifiedSales * 100 : 0)}`}>
        <span className="bg-primary" style={{ width: `${classifiedSales > 0 ? Math.max(0, assignedSales / classifiedSales * 100) : 0}%` }} />
        <span className="bg-amber-500" style={{ width: `${classifiedSales > 0 ? Math.max(0, sporadicSales / classifiedSales * 100) : 0}%` }} />
      </div>
    </section>
    <div className="ccv-client-toolbar flex flex-wrap items-center gap-2" role="search">
      <label htmlFor="cliente-search" className="sr-only">Buscar código, cliente, sucursal o asesor</label>
      <input id="cliente-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar cliente, código, sucursal o asesor" className="h-10 w-full max-w-sm rounded-lg border border-border bg-background px-3 text-sm" />
      <label htmlFor="cliente-relation" className="sr-only">Filtrar por relación comercial</label>
      <select id="cliente-relation" value={relation} onChange={(event) => { setRelation(event.target.value as RelationFilter); setPage(0); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
        <option value="todos">Todos los clientes</option><option value="asignado">Clientes cartera</option><option value="esporadico">Esporádicos</option><option value="mixto">Mixtos</option>
      </select>
      <span className="ml-auto text-sm text-muted-foreground">{searched.length} clientes · Top 5 aporta {percent(topFiveShare)} de la venta identificada</span>
    </div>

    {loading ? <p className="text-sm text-muted-foreground">Cargando facturación por cliente…</p> : error ? <QueryErrorNotice error={error} onRetry={() => { void Promise.all([currentQuery.refetch(), portfolioQuery.refetch(), quoteQuery.refetch(), lostQuery.refetch()]); }} fallback="No se pudo cargar el análisis de clientes." /> : <>
      {(Number(currentQuery.data?.calidad.ventasSinCodigoCliente ?? 0) > 0) && <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">{money(Number(currentQuery.data?.calidad.ventasSinCodigoCliente ?? 0))} de venta no tiene código de cliente y queda fuera de la tabla por cliente.</p>}
      <div className="ccv-client-table overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full min-w-[1050px] text-sm">
          <caption className="sr-only">Facturación por cliente, identificado por código. Expande una fila para el detalle de sucursales y asesores.</caption>
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 text-left text-muted-foreground backdrop-blur"><tr><th scope="col" className="w-10 p-3"><span className="sr-only">Detalle</span></th><th scope="col" className="p-3">Código · cliente</th><th scope="col" className="p-3">Relación</th><th scope="col" className="p-3 text-right">Facturado</th><th scope="col" className="p-3 text-right">Cotizado*</th><th scope="col" className="p-3 text-right">Perdido*</th><th scope="col" className="p-3">Asesor</th></tr></thead>
          <tbody>{visibleRows.map((row) => {
            const kind = classify(row);
            const open = expanded === row.code;
            const advisorNames = [...new Set([...row.branches.values()].flatMap((branch) => advisorNamesFor(branch.assignments, branch.advisors)))];
            return <Fragment key={row.code}>
              <tr key={row.code} className="border-b border-border/60">
                <td className="p-2"><button type="button" aria-expanded={open} aria-label={`${open ? "Ocultar" : "Ver"} detalle de ${row.name}`} onClick={() => setExpanded(open ? null : row.code)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted">{open ? "−" : "+"}</button></td>
                <th scope="row" className="p-3 text-left"><span className="block font-mono text-xs text-muted-foreground">{row.code}</span><span className="mt-0.5 block font-medium text-foreground">{row.name}</span></th>
                <td className="p-3"><RelationBadge relation={kind} /></td>
                <td className="p-3 text-right font-semibold tabular-nums">{money(row.current)}</td>
                <td className="p-3 text-right tabular-nums">{row.quoted ? money(row.quoted) : "—"}</td>
                <td className="p-3 text-right tabular-nums">{row.lost ? money(row.lost) : "—"}</td>
                <td className="p-3 text-sm" title={advisorNames.join(", ") || "Casa"}>{advisorNames.length ? advisorNames.join(", ") : <span className="text-muted-foreground">Casa</span>}</td>
              </tr>
              {open && <tr key={`${row.code}:detail`} className="border-b border-border bg-muted/20"><td colSpan={7} className="p-3 sm:p-4">
                <div className="grid gap-3">{[...row.branches.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "es")).map((branch) => {
                  const branchType: Exclude<RelationFilter, "todos"> = branch.assignedSale && branch.hasSporadicSale ? "mixto" : branch.assignedSale ? "asignado" : branch.hasSporadicSale ? "esporadico" : branch.assignments.length ? "asignado" : "esporadico";
                  const advisors = advisorNamesFor(branch.assignments, branch.advisors);
                  return <article key={`${row.code}:${branch.id}`} className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[1.2fr_1fr_auto_auto] md:items-center">
                    <div><strong>{branch.name}</strong><p className="text-xs text-muted-foreground">{advisors.length ? advisors.join(" · ") : "Casa"}</p></div>
                    <div className="flex flex-wrap gap-1.5">{branch.units.map((unit) => <span key={unit.unidad} className="rounded-md bg-muted px-2 py-1 text-xs">{unit.unidad}: <strong className="tabular-nums">{money(Number(unit.monto))}</strong></span>)}</div>
                    <RelationBadge relation={branchType} />
                    <div className="text-right"><strong className="tabular-nums">{money(branch.amount)}</strong><p className="text-xs text-muted-foreground">Asignado {money(branch.assignedAmount)} · Esporádico {money(branch.sporadicAmount)}</p><p className="text-xs text-muted-foreground">Última venta en el período: {formatDate(branch.latestSale)}</p></div>
                  </article>;
                })}</div>
                <p className="mt-2 text-xs text-muted-foreground">Cotizado y perdido se muestran solo cuando el nombre y la sucursal coinciden exactamente con un único código de cliente.</p>
              </td></tr>}
            </Fragment>;
          })}
          {visibleRows.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={7}>{search ? "No hay coincidencias para esa búsqueda." : "No hay clientes para estos filtros."}</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{searched.length === 0 ? "0 clientes" : `${visiblePage * PAGE_SIZE + 1}–${Math.min((visiblePage + 1) * PAGE_SIZE, searched.length)} de ${searched.length} clientes`}</span><div className="flex gap-2"><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}>Anterior</button><button type="button" className="rounded-md border border-border px-3 py-2 disabled:opacity-50" disabled={visiblePage >= pageCount - 1} onClick={() => setPage(visiblePage + 1)}>Siguiente</button></div></div>
      <p className="text-xs text-muted-foreground">* Contexto cotizado/perdido asociado por nombre exacto y sucursal; si la coincidencia es ambigua, el monto no se atribuye. Saldo por cobrar queda fuera de este análisis de cartera comercial.</p>
    </>}
  </div>;
}

function RelationBadge({ relation }: { relation: Exclude<RelationFilter, "todos"> }) {
  const classes = relation === "asignado" ? "border-primary/30 bg-primary/10 text-primary" : relation === "mixto" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border bg-muted text-muted-foreground";
  const label = relation === "asignado" ? "Cartera" : relation === "mixto" ? "Mixto" : "Esporádico";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}
