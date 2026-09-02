import { useQuery } from "@tanstack/react-query";
import { BarChart3, Boxes, Building2, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales } from "@/hooks/use-catalogos";
import { money } from "@/lib/format";
import { diasVencidosDesde, getAllMonthsCap, getHighlightMonthLabels } from "@/lib/date-range";
import { MESES } from "@/lib/format";
import { getMonthlySalesProjection } from "@/lib/business-days";
import { getUnidadData, type UnidadData, type UnidadKey } from "@/lib/unidad-http";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import { ComplianceGauge } from "@/components/gerencia-nacional/ComplianceGauge";
import { GlobalMonthlyCombo } from "@/components/coordinador/GlobalMonthlyCombo";
import { ReceivablesTable } from "@/components/coordinador/ReceivablesTable";
import { SucursalPerformanceChart } from "@/components/servicios/SucursalPerformanceChart";
import { Input } from "@/components/ui/input";

const UNIT_COPY: Record<UnidadKey, { title: string; description: string }> = {
  repuestos: {
    title: "Dashboard Comercial - Repuestos",
    description: "Cumplimiento, ventas netas por marca y cuentas por cobrar de Repuestos.",
  },
  lubfiltros: {
    title: "Dashboard Comercial - Lubricantes y Filtros",
    description: "Ventas por marca, inventario disponible y cumplimiento de Lubricantes/Filtros.",
  },
  servicios: {
    title: "Dashboard Comercial - Servicios",
    description: "Talleres, CSA, servicios internos, estratégicos y cumplimiento de Servicios.",
  },
  equipos: {
    title: "Dashboard Comercial - Equipos",
    description: "Participación por marca, inventario, ventas perdidas y cartera de Equipos.",
  },
  alquiler: {
    title: "Dashboard Comercial - Alquiler",
    description: "Facturación, cumplimiento presupuestario y cuentas por cobrar de Alquiler.",
  },
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const label = (value: unknown) => String(value ?? "Sin clasificar");

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </header>
  );
}

function DetailSection({ data, keyName }: { data: UnidadData; keyName: UnidadKey }) {
  const brands = useMemo(() => {
    const rows = data.detallesMarcas ?? [];
    const totals = new Map<string, number>();
    rows.forEach((row) => {
      const amount = num(row.montoTotal ?? row.monto);
      const name = label(row.marca);
      totals.set(name, (totals.get(name) ?? 0) + amount);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data.detallesMarcas]);

  const inventory = useMemo(() => {
    const totals = new Map<string, number>();
    (data.inventario ?? []).forEach((row) => {
      const name = label(row.tipo ?? row.tipoEquipo);
      const amount = num(row.disponible ?? row.monto);
      totals.set(name, (totals.get(name) ?? 0) + amount);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data.inventario]);

  const serviceTotals = useMemo(() => {
    const rows = data.servicios ?? [];
    const talleres = rows.filter((row) => row.taller).reduce((sum, row) => sum + num(row.monto), 0);
    const csa = rows.filter((row) => row.csa).reduce((sum, row) => sum + num(row.monto), 0);
    const interno = (data.serviciosInterno ?? []).reduce((sum, row) => sum + num(row.monto), 0);
    const estrategico = (data.detallesEstrategicos ?? []).reduce(
      (sum, row) => sum + num(row.monto),
      0,
    );
    return { talleres, csa, interno, estrategico };
  }, [data.detallesEstrategicos, data.servicios, data.serviciosInterno]);

  const lostSales = useMemo(
    () =>
      (data.ventasPerdidas ?? [])
        .map((row) => ({ cliente: label(row.cliente), razon: label(row.razon), monto: num(row.monto) }))
        .slice(0, 8),
    [data.ventasPerdidas],
  );

  if (keyName === "alquiler") return null;

  if (keyName === "servicios") {
    return (
      <section className="flex flex-col gap-3 section-enter section-enter-3">
        <SectionTitle
          title="Detalle operativo de Servicios"
          description="La distribución usa las fuentes de talleres, CSA, servicios internos y estratégicos."
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Talleres", serviceTotals.talleres],
            ["CSA", serviceTotals.csa],
            ["Servicios internos", serviceTotals.interno],
            ["Estratégicos", serviceTotals.estrategico],
          ].map(([name, amount]) => (
            <div key={String(name)} className="rounded-xl border bg-card p-4 card-elevated">
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="mt-2 font-mono text-lg font-semibold tabular-nums">{money(num(amount))}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (keyName === "equipos") {
    return (
      <section className="grid gap-4 lg:grid-cols-2 section-enter section-enter-3">
        <div className="rounded-xl border bg-card p-4 card-elevated">
          <SectionTitle title="Inventario por tipo" description="Disponible y tránsito desde el snapshot de inventario." />
          <div className="mt-4 space-y-3">
            {inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay inventario para el alcance seleccionado.</p>
            ) : (
              inventory.map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                  <span>{name}</span>
                  <span className="font-mono tabular-nums">{money(amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 card-elevated">
          <SectionTitle title="Ventas perdidas" description="Clientes y razones con mayor monto perdido en el período." />
          <div className="mt-4 space-y-3">
            {lostSales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay ventas perdidas para el período.</p>
            ) : (
              lostSales.map((row, index) => (
                <div key={`${row.cliente}-${index}`} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.cliente}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.razon}</p>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums">{money(row.monto)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2 section-enter section-enter-3">
      <div className="rounded-xl border bg-card p-4 card-elevated">
        <SectionTitle
          title={keyName === "repuestos" ? "Ventas netas por marca" : "Ventas por marca"}
          description={
            keyName === "repuestos"
              ? "Detalle de ventas de Repuestos con la fuente neteada contra Lubricantes/Filtros."
              : "Detalle mensual de ventas de Lubricantes/Filtros por suplidor y marca."
          }
        />
        <div className="mt-4 space-y-3">
          {brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay detalle de marcas para el año cargado.</p>
          ) : (
            brands.map(([name, amount]) => (
              <div key={name} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                <span>{name}</span>
                <span className="font-mono tabular-nums">{money(amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      {keyName === "lubfiltros" ? (
        <div className="rounded-xl border bg-card p-4 card-elevated">
          <SectionTitle title="Inventario por tipo" description="Snapshot de inventario clasificado en Lubricantes y Filtros." />
          <div className="mt-4 space-y-3">
            {inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay inventario disponible.</p>
            ) : (
              inventory.map(([name, amount]) => (
                <div key={name} className="flex items-center justify-between border-b pb-2 text-sm last:border-0">
                  <span>{name}</span>
                  <span className="font-mono tabular-nums">{money(amount)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function UnidadLivePage({ unitKey }: { unitKey: UnidadKey }) {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses } = filters;
  const { data: sucursales } = useSucursales();
  const [search, setSearch] = useState("");
  const branch = role === "gerencia" ? filters.sucursales[0] : undefined;
  const copy = UNIT_COPY[unitKey];

  const { data, isLoading, error } = useQuery({
    queryKey: ["unidad-http", unitKey, anio, JSON.stringify(meses), branch, role, profile?.id],
    queryFn: () => getUnidadData(unitKey, { anio, meses, sucursalId: branch }),
  });

  const selectedBudgets = data?.presupuestos ?? [];
  const sales = selectedBudgets.reduce(
    (sum, row) => sum + num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas),
    0,
  );
  const target = selectedBudgets.reduce((sum, row) => sum + num(row.monto), 0);
  const compliance = target > 0 ? (sales / target) * 100 : 0;
  const projection = getMonthlySalesProjection(sales, target, anio, meses);
  const monthly = useMemo(() => {
    const rows = Array.from({ length: getAllMonthsCap(anio) }, (_, index) => ({
      mes: MESES[index].slice(0, 3),
      presupuesto: 0,
      venta: 0,
    }));
    (data?.presupuestosYtd ?? []).forEach((row) => {
      const position = row.mes - 1;
      if (!rows[position]) return;
      rows[position].presupuesto += num(row.monto);
      rows[position].venta += num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas);
    });
    return rows;
  }, [anio, data?.presupuestosYtd]);
  const companies = useMemo(() => {
    const totals = [
      ["Consorcio Venequip", selectedBudgets.reduce((sum, row) => sum + num(row.ventasCcv), 0)],
      ["Xibi", selectedBudgets.reduce((sum, row) => sum + num(row.ventasXibi), 0)],
      ["Estratégicas", selectedBudgets.reduce((sum, row) => sum + num(row.ventasEstrategicas), 0)],
    ];
    return totals.filter(([, value]) => num(value) > 0).map(([label, value]) => ({ label, facturado: num(value) }));
  }, [selectedBudgets]);
  const performance = useMemo(() => {
    const map = new Map<string, { nombre: string; monto: number; presupuesto: number }>();
    (sucursales ?? []).forEach((item) => map.set(item.id, { nombre: item.nombre, monto: 0, presupuesto: 0 }));
    selectedBudgets.forEach((row) => {
      if (!row.sucursalId || !map.has(row.sucursalId)) return;
      const item = map.get(row.sucursalId)!;
      item.monto += num(row.ventasCcv) + num(row.ventasXibi) + num(row.ventasEstrategicas);
      item.presupuesto += num(row.monto);
    });
    return [...map.values()]
      .filter((item) => item.monto > 0 || item.presupuesto > 0)
      .map((item) => ({ ...item, pctCumplimiento: item.presupuesto ? (item.monto / item.presupuesto) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }, [selectedBudgets, sucursales]);
  const receivables = useMemo(
    () =>
      (data?.cobranzas ?? [])
        .filter((row) => label(row.cliente).toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => num(b.saldo) - num(a.saldo)),
    [data?.cobranzas, search],
  );

  const handleApplyFilters = (next: FilterState) => {
    setFilters({ anio: next.anio, meses: next.meses, sucursales: next.sucursal ? [next.sucursal] : [] });
  };

  if (isLoading && !data) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando datos reales de {copy.title}…</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : "No se pudo cargar la unidad."}</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Unidad de Negocio" title={copy.title} description={copy.description} />
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={role === "gerencia" ? sucursales?.map((item) => ({ value: item.id, label: item.nombre })) : undefined}
        defaultMes={meses}
        defaultAnio={anio}
        showAllMonths
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ventas consolidadas"
          value={money(sales)}
          accent="ochre"
          icon={TrendingUp}
          projection={projection ? { value: money(projection.projectedSales), tone: projection.tone } : undefined}
          hint="Fuente: presupuesto mensual · CCV + Xibi + Estratégicas"
        />
        <KpiCard
          label="Presupuesto"
          value={money(target)}
          accent="primary"
          icon={BarChart3}
          hint="Meta oficial de la unidad y período seleccionado"
        />
        <KpiCard
          label="Cotizado neto"
          value={money(num(data?.cotizado.montoTotal))}
          accent="success"
          icon={Boxes}
          hint={`${num(data?.cotizado.cantidad)} cotizaciones · fuente HTTP`}
        />
        <KpiCard
          label="Cuentas por cobrar"
          value={money((data?.cobranzas ?? []).reduce((sum, row) => sum + num(row.saldo), 0))}
          accent="warning"
          icon={Building2}
          hint={`${data?.cobranzas.length ?? 0} saldos pendientes`}
        />
      </div>

      <section className="flex flex-col gap-3 section-enter section-enter-1">
        <SectionTitle title="Desempeño por sucursal" description="Cumplimiento general, facturación por compañía y detalle de alcance." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
          <ComplianceGauge title={`Cumplimiento General ${data?.unit.nombre ?? copy.title}`} pct={compliance} facturado={sales} presupuesto={target} />
          <div className="lg:col-span-2">
            <div className="h-full rounded-xl border bg-card p-4 card-elevated">
              <p className="font-display font-semibold">Facturación por compañía</p>
              <div className="mt-4 space-y-3">
                {companies.length === 0 ? <p className="text-sm text-muted-foreground">Sin ventas en el período.</p> : companies.map((item) => (
                  <div key={item.label} className="flex justify-between gap-3 text-sm">
                    <span>{item.label}</span><span className="font-mono tabular-nums">{money(item.facturado)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <SucursalPerformanceChart data={performance} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 section-enter section-enter-2">
        <SectionTitle title="Evolución mensual" description={`Venta real vs. presupuesto, año a la fecha · ${getHighlightMonthLabels(meses).join(", ") || "todos los meses"} en revisión.`} />
        <GlobalMonthlyCombo data={monthly} highlightMonths={getHighlightMonthLabels(meses)} />
      </section>

      <DetailSection data={data!} keyName={unitKey} />

      <section className="flex flex-col gap-3 section-enter section-enter-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle title="Cuentas por cobrar" description={`Saldos pendientes de ${data?.unit.nombre ?? copy.title}.`} />
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente…" className="h-9 pl-8" />
          </div>
        </div>
        <ReceivablesTable
          rows={receivables.map((row) => ({
            id: row.id,
            cliente: row.cliente,
            sucursalVenta: sucursales?.find((item) => item.id === row.sucursalId)?.nombre,
            diasVencidos: diasVencidosDesde(row.fechaVencimiento || new Date().toISOString()),
            total: num(row.saldo),
          }))}
        />
      </section>

      {isLoading ? <div className="text-xs text-muted-foreground">Actualizando datos…</div> : null}
    </div>
  );
}