import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  AlertTriangle,
  ClockAlert,
  TrendingDown,
  Users,
  FileText,
  DollarSign,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { money, pct } from "@/lib/format";
import {
  getDateRangesForMonths,
  applyDateRangesToQuery,
  applyMonthFilterToQuery,
} from "@/lib/date-range";
import { FilterHeader, type FilterState } from "@/components/resumen/FilterHeader";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { StatusPill } from "@/components/status-pill";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { resolverAsesor, VENTAS_CASA, normalizarNombre } from "@/lib/asesores-catalogo";

type Severity = "alta" | "media" | "baja";
type AlertType =
  | "cobranzas"
  | "ventas_perdidas"
  | "minutas"
  | "cumplimiento"
  | "dependencia"
  | "cotizacion_factura"
  | "cotizaciones_viejas";

type AlertRow = {
  id: string;
  tipo: AlertType;
  severidad: Severity;
  titulo: string;
  detalle: string;
  monto?: number;
  accion?: string;
};

export const Route = createFileRoute("/_app/alertas")({
  head: () => ({ meta: [{ title: "Torre de Control · Alertas · CCV" }] }),
  component: AlertasPage,
});

function AlertasPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: unidades } = useUnidades();

  const { data: sources, isLoading } = useQuery({
    queryKey: ["alertas-sources", anio, JSON.stringify(meses), selectedUnidades, profile?.id],
    queryFn: async () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const next7 = new Date();
      next7.setDate(now.getDate() + 7);
      const from60 = new Date();
      from60.setDate(now.getDate() - 60);
      const from30 = new Date();
      from30.setDate(now.getDate() - 30);

      // Expected run rate based on day of month
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const expectedRunRate = (now.getDate() / daysInMonth) * 100;

      // Cobranzas vencidas y por vencer
      let cq = scoped(
        supabase
          .from("cobranzas")
          .select("id, cliente, factura_numero, fecha_vencimiento, saldo, unidad_negocio_id"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
      ).gt("saldo", 0);

      // Ventas perdidas (últimos 60 días)
      let vq = scoped(
        supabase
          .from("ventas_perdidas")
          .select("id, cliente, fecha, monto, asesor, unidad_negocio_id")
          .gte("fecha", from60.toISOString().slice(0, 10)),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );

      // Minutas vencidas
      let mq = scoped(
        supabase
          .from("minutas")
          .select("id, cliente, descripcion, fecha_limite, estado, responsable, unidad_negocio_id"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "responsable_id" },
      );

      // Cumplimiento de asesores
      let aq = scoped(
        supabase
          .from("cumplimiento_asesores")
          .select(
            "id, asesor, codigo_asesor, pct_cumplimiento, venta, presupuesto, unidad_negocio_id",
          )
          .eq("anio", anio),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      aq = applyMonthFilterToQuery(aq, meses, anio);

      // Cotizaciones (para tasa de conversión y envejecidas)
      let cotq = scoped(
        supabase
          .from("cotizaciones")
          .select("id, cliente, asesor_codigo, etapa, monto, fecha, unidad_negocio_id"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      cotq = applyDateRangesToQuery(cotq, dateRanges);

      // Facturas (para tasa de conversión)
      let facq = scoped(
        supabase.from("facturas").select("id, cliente, asesor, monto, unidad_negocio_id"),
        role,
        profile,
        profile?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      facq = applyDateRangesToQuery(facq, dateRanges);

      if (selectedUnidades.length > 0) {
        cq = cq.in("unidad_negocio_id", selectedUnidades);
        vq = vq.in("unidad_negocio_id", selectedUnidades);
        mq = mq.in("unidad_negocio_id", selectedUnidades);
        aq = aq.in("unidad_negocio_id", selectedUnidades);
        cotq = cotq.in("unidad_negocio_id", selectedUnidades);
        facq = facq.in("unidad_negocio_id", selectedUnidades);
      }

      const [c, v, m, a, cot, fac] = await Promise.all([cq, vq, mq, aq, cotq, facq]);

      return {
        expectedRunRate,
        today,
        next7: next7.toISOString().slice(0, 10),
        cobranzas: c.data ?? [],
        perdidas: v.data ?? [],
        minutas: m.data ?? [],
        asesores: a.data ?? [],
        cotizaciones: cot.data ?? [],
        facturas: fac.data ?? [],
      };
    },
  });

  const alertas = useMemo<AlertRow[]>(() => {
    if (!sources) return [];
    const rows: AlertRow[] = [];

    // 1. COBRANZAS: Clientes con facturas vencidas
    const cobranzasVencidas = sources.cobranzas.filter((r) => r.fecha_vencimiento < sources.today);
    const cobranzasPorVencer = sources.cobranzas.filter(
      (r) => r.fecha_vencimiento >= sources.today && r.fecha_vencimiento <= sources.next7,
    );

    // Agrupar cobranzas vencidas por cliente
    const carteraPorCliente = new Map<string, { saldo: number; facturas: number }>();
    cobranzasVencidas.forEach((r) => {
      const key = (r.cliente ?? "").trim();
      const curr = carteraPorCliente.get(key) ?? { saldo: 0, facturas: 0 };
      curr.saldo += Number(r.saldo ?? 0);
      curr.facturas += 1;
      carteraPorCliente.set(key, curr);
    });

    // Alerta: Cliente con mucho dinero vencido
    carteraPorCliente.forEach((v, cliente) => {
      if (v.saldo >= 50000) {
        rows.push({
          id: `cx-alta-${cliente}`,
          tipo: "cobranzas",
          severidad: "alta",
          titulo: `${cliente} tiene facturas vencidas`,
          detalle: `${v.facturas} facturas vencidas, debe ${money(v.saldo)}`,
          monto: v.saldo,
          accion: "Llamar a cobrar",
        });
      }
    });

    // Alerta: Facturas por vencer (próximos 7 días)
    cobranzasPorVencer.forEach((r) => {
      rows.push({
        id: `cx-prox-${r.id}`,
        tipo: "cobranzas",
        severidad: "media",
        titulo: `Factura por vencer: ${r.factura_numero ?? "s/n"}`,
        detalle: `${r.cliente} vence el ${r.fecha_vencimiento}`,
        monto: Number(r.saldo ?? 0),
        accion: "Recordar pago",
      });
    });

    // Alias code<->name map from cumplimiento_asesores, used to resolve raw asesor names
    // (facturas/ventas_perdidas only store a free-text name) against the official 32-advisor
    // catalog. Anything that isn't a real commercial advisor (admin staff, typos, unmatched
    // names) resolves to "Ventas Casa" and is excluded from per-advisor alerts below —
    // there's no individual to "hablar con"/"ayudar" for that bucket.
    const asesorAliases = new Map<string, string>();
    sources.asesores.forEach((r) => {
      const normName = normalizarNombre(r.asesor ?? "");
      const code = String(r.codigo_asesor ?? "").trim();
      if (normName && code) asesorAliases.set(normName, code);
    });

    // 2. VENTAS PERDIDAS: Asesores que pierden muchas ventas
    const perdidasPorAsesor = new Map<string, { count: number; monto: number }>();
    sources.perdidas.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.asesor }, asesorAliases);
      if (resolved.codigo === VENTAS_CASA.codigo) return;
      const key = resolved.nombre;
      const curr = perdidasPorAsesor.get(key) ?? { count: 0, monto: 0 };
      curr.count += 1;
      curr.monto += Number(r.monto ?? 0);
      perdidasPorAsesor.set(key, curr);
    });

    // Calcular cuánto pierde cada asesor vs lo que factura
    const facturasPorAsesor = new Map<string, number>();
    sources.facturas.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.asesor }, asesorAliases);
      if (resolved.codigo === VENTAS_CASA.codigo) return;
      const key = resolved.nombre;
      facturasPorAsesor.set(key, (facturasPorAsesor.get(key) ?? 0) + Number(r.monto ?? 0));
    });

    perdidasPorAsesor.forEach((v, asesor) => {
      const facturado = facturasPorAsesor.get(asesor) ?? 0;
      const total = v.monto + facturado;
      const tasaPerdida = total > 0 ? (v.monto / total) * 100 : 0;

      if (tasaPerdida >= 40) {
        rows.push({
          id: `vp-asesor-${asesor}`,
          tipo: "ventas_perdidas",
          severidad: tasaPerdida >= 60 ? "alta" : "media",
          titulo: `${asesor} pierde muchas ventas`,
          detalle: `Pierde ${tasaPerdida.toFixed(0)}% (${v.count} ventas perdidas, ${money(v.monto)})`,
          monto: v.monto,
          accion: "Ayudar al asesor",
        });
      }
    });

    // 3. MINUTAS: Compromisos vencidos sin cerrar
    sources.minutas.forEach((r) => {
      if (!r.fecha_limite || r.estado === "cumplido") return;
      if (r.fecha_limite < sources.today) {
        rows.push({
          id: `min-${r.id}`,
          tipo: "minutas",
          severidad: "media",
          titulo: `Compromiso vencido: ${r.cliente}`,
          detalle: `${r.descripcion?.slice(0, 50)}... — Responsable: ${r.responsable}`,
          accion: "Dar seguimiento",
        });
      }
    });

    // 4. CUMPLIMIENTO: Asesores que van atrasados en su meta
    sources.asesores.forEach((r) => {
      const resolved = resolverAsesor({ codigo: r.codigo_asesor, nombre: r.asesor }, asesorAliases);
      if (resolved.codigo === VENTAS_CASA.codigo) return;
      const cumplimiento = Number(r.pct_cumplimiento ?? 0);
      const gap = sources.expectedRunRate - cumplimiento;
      if (gap >= 20) {
        rows.push({
          id: `rr-${r.id}`,
          tipo: "cumplimiento",
          severidad: gap >= 35 ? "alta" : "media",
          titulo: `${resolved.nombre} va atrasado en su meta`,
          detalle: `Lleva ${cumplimiento.toFixed(1)}% y debería llevar ${sources.expectedRunRate.toFixed(1)}% a esta fecha`,
          monto: Number(r.venta ?? 0),
          accion: "Hablar con el asesor",
        });
      }
    });

    // 5. DEPENDENCIA: Clientes que representan mucho de la cartera
    const totalCartera = Array.from(carteraPorCliente.values()).reduce(
      (sum, v) => sum + v.saldo,
      0,
    );
    carteraPorCliente.forEach((v, cliente) => {
      const concentracion = totalCartera > 0 ? (v.saldo / totalCartera) * 100 : 0;
      if (concentracion >= 30) {
        rows.push({
          id: `conc-${cliente}`,
          tipo: "dependencia",
          severidad: "alta",
          titulo: `Muy dependiente de ${cliente}`,
          detalle: `${concentracion.toFixed(0)}% de toda la cartera vencida es de este cliente (${money(v.saldo)})`,
          monto: v.saldo,
          accion: "Buscar más clientes",
        });
      }
    });

    // 6. COTIZACIÓN A FACTURA: Poco de lo cotizado se factura
    const totalCotizado = sources.cotizaciones.reduce((sum, c) => sum + Number(c.monto ?? 0), 0);
    const totalFacturado = sources.facturas.reduce((sum, f) => sum + Number(f.monto ?? 0), 0);
    const tasaConversion = totalCotizado > 0 ? (totalFacturado / totalCotizado) * 100 : 0;

    if (tasaConversion < 50 && totalCotizado > 0) {
      rows.push({
        id: "conv-baja",
        tipo: "cotizacion_factura",
        severidad: "media",
        titulo: "Poco de lo cotizado se factura",
        detalle: `Solo ${tasaConversion.toFixed(1)}% se factura (cotizado ${money(totalCotizado)}, facturado ${money(totalFacturado)})`,
        monto: totalFacturado,
        accion: "Revisar cotizaciones",
      });
    }

    // 7. COTIZACIONES VIEJAS: Mucho tiempo sin respuesta
    const now = Date.now();
    const envejecidas = sources.cotizaciones.filter((c) => {
      if (c.etapa === "propuesta_negociacion" || c.etapa === "venta_perdida") return false;
      const ageDays = Math.floor((now - new Date(c.fecha).getTime()) / 86400000);
      return ageDays >= 30;
    });

    if (envejecidas.length > 0) {
      const montoTotal = envejecidas.reduce((sum, c) => sum + Number(c.monto ?? 0), 0);
      rows.push({
        id: "envejecidas",
        tipo: "cotizaciones_viejas",
        severidad: envejecidas.length >= 10 ? "alta" : "media",
        titulo: `${envejecidas.length} cotizaciones sin respuesta (+30 días)`,
        detalle: `Monto total: ${money(montoTotal)}`,
        monto: montoTotal,
        accion: "Seguimiento a clientes",
      });
    }

    // Ordenar por severidad
    return rows.sort((a, b) => {
      const weight = { alta: 3, media: 2, baja: 1 };
      return weight[b.severidad] - weight[a.severidad];
    });
  }, [sources]);

  const totals = useMemo(() => {
    const alta = alertas.filter((a) => a.severidad === "alta").length;
    const media = alertas.filter((a) => a.severidad === "media").length;
    const baja = alertas.filter((a) => a.severidad === "baja").length;
    const montoTotal = alertas.reduce((sum, a) => sum + (a.monto ?? 0), 0);
    return { alta, media, baja, total: alertas.length, montoTotal };
  }, [alertas]);

  const severityKind = (s: Severity) => {
    if (s === "alta") return "danger" as const;
    if (s === "media") return "warning" as const;
    return "neutral" as const;
  };

  const tipoIcon = (t: AlertType) => {
    switch (t) {
      case "cobranzas":
        return DollarSign;
      case "ventas_perdidas":
        return TrendingDown;
      case "minutas":
        return ClockAlert;
      case "cumplimiento":
        return Target;
      case "dependencia":
        return AlertTriangle;
      case "cotizacion_factura":
        return Users;
      case "cotizaciones_viejas":
        return FileText;
    }
  };

  const tipoLabel = (t: AlertType) => {
    switch (t) {
      case "cobranzas":
        return "Cobranzas";
      case "ventas_perdidas":
        return "Ventas perdidas";
      case "minutas":
        return "Minutas";
      case "cumplimiento":
        return "Cumplimiento";
      case "dependencia":
        return "Dependencia";
      case "cotizacion_factura":
        return "Cotización → Factura";
      case "cotizaciones_viejas":
        return "Cotizaciones viejas";
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <PageHeader
        eyebrow="Torre de control"
        title="Alertas"
        description="Avisos importantes sobre cobranzas, cumplimiento y riesgos comerciales"
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        unitOptions={unidades?.map((u) => ({ value: u.id, label: u.nombre }))}
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={selectedUnidades}
        showAllMonths
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Urgentes"
          value={String(totals.alta)}
          icon={AlertTriangle}
          accent="danger"
          hint="hay que actuar ya"
        />
        <KpiCard
          label="En revisión"
          value={String(totals.media)}
          icon={ClockAlert}
          accent="warning"
          hint="dar seguimiento"
        />
        <KpiCard
          label="Total avisos"
          value={String(totals.total)}
          icon={BellRing}
          hint={`${totals.alta + totals.media} activos`}
        />
        <KpiCard
          label="Dinero en riesgo"
          value={money(totals.montoTotal)}
          icon={DollarSign}
          accent="ochre"
          hint="monto total en alertas"
        />
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <BellRing className="size-5" />
          <h3 className="font-display font-semibold">Avisos ordenados por importancia</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {alertas.length} avisos activos
          </span>
        </div>
        <div className="overflow-x-auto max-h-140">
          <Table className="text-sm">
            <TableHeader className="bg-primary sticky top-0 [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Importancia
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Área
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Qué pasa
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Detalle
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-4 py-2.5 text-xs tracking-wider">
                  Monto
                </TableHead>
                <TableHead className="text-primary-foreground text-left px-4 py-2.5 text-xs tracking-wider">
                  Qué hacer
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-8 text-center text-muted-foreground">
                    Revisando datos…
                  </TableCell>
                </TableRow>
              ) : alertas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Todo en orden. No hay avisos pendientes.
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                alertas.map((a) => {
                  const Icon = tipoIcon(a.tipo);
                  return (
                    <TableRow
                      key={a.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                    >
                      <TableCell className="px-4 py-3">
                        <StatusPill kind={severityKind(a.severidad)}>
                          {a.severidad === "alta"
                            ? "Urgente"
                            : a.severidad === "media"
                              ? "Importante"
                              : "Baja"}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Icon className="inline size-4 mr-1.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{tipoLabel(a.tipo)}</span>
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-sm">{a.titulo}</TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                        {a.detalle}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right tabular-nums font-medium">
                        {a.monto ? money(a.monto) : "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {a.accion && (
                          <span className="text-xs font-medium text-primary">{a.accion}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
