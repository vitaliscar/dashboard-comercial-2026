"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import {
  getServiciosAction,
  getCobranzasServiciosAction,
  getServiciosTrendAction,
} from "@/lib/actions/servicios";
import { KpiCard } from "@/components/kpi-card";
import { money, MESES } from "@/lib/format";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { getDateRangesForMonths, getAllMonthsCap } from "@/lib/date-range";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
} from "recharts";
import { Zap, Wrench, User, TrendingUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function ServiciosPage() {
  const { role, profile } = useAuth();
  const { filters, setFilters } = useSharedFilters();
  const { anio, meses, unidades: selectedUnidades } = filters;
  const sucursalSel = filters.sucursales[0] ?? "all";
  const [searchQ, setSearchQ] = useState("");

  const isGC = role === "gerente_comercial";
  const isCoordinador = role === "coordinador";
  const isGerencia = role === "gerencia";

  const unidadesSeleccionadas =
    isGC && profile?.unidad_negocio_id ? [profile.unidad_negocio_id] : selectedUnidades;
  const sucursal = isCoordinador && profile?.sucursal_id ? profile.sucursal_id : sucursalSel;

  const canFilterSucursal = isGerencia;
  const canFilterUnidad = isGerencia;

  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const dateRanges = useMemo(() => getDateRangesForMonths(anio, meses), [anio, meses]);

  const queryFilters = { anio, meses, sucursal, unidadesSeleccionadas };
  const filterKey = JSON.stringify(queryFilters);

  const handleApplyFilters = (f: FilterState) => {
    setFilters({
      anio: f.anio,
      meses: f.meses,
      sucursales: f.sucursal ? [f.sucursal] : [],
      unidades: f.unidades ?? (f.unidad ? [f.unidad] : []),
    });
  };

  const { data: servicios, isLoading } = useQuery({
    queryKey: ["servicios", filterKey, role, profile?.id],
    queryFn: () =>
      getServiciosAction({ ranges: dateRanges, sucursal, unidades: unidadesSeleccionadas }),
  });

  const { data: cobranzasData } = useQuery({
    queryKey: ["cobranzas-servicios", filterKey, role, profile?.id],
    queryFn: () => getCobranzasServiciosAction({ sucursal }),
  });

  const totales = useMemo(() => {
    if (!servicios) return { ventas_internas: 0, ventas_talleres: 0, ventas_csa: 0, total: 0 };

    let ventas_internas = 0;
    let ventas_talleres = 0;
    let ventas_csa = 0;

    servicios.forEach((s) => {
      const cat = (s.categoriaVenta ?? "").toLowerCase();
      if (cat.includes("interna") || cat.includes("internal")) {
        ventas_internas += Number(s.monto);
      } else if (cat.includes("taller") || cat.includes("workshop")) {
        ventas_talleres += Number(s.monto);
      } else if (cat.includes("csa") || cat.includes("customer")) {
        ventas_csa += Number(s.monto);
      }
    });

    return {
      ventas_internas,
      ventas_talleres,
      ventas_csa,
      total: ventas_internas + ventas_talleres + ventas_csa,
    };
  }, [servicios]);

  const { data: trend } = useQuery({
    queryKey: [
      "servicios-trend",
      anio,
      sucursal,
      unidadesSeleccionadas,
      JSON.stringify(meses),
      role,
      profile?.id,
    ],
    queryFn: async () => {
      const data = await getServiciosTrendAction({
        anio,
        meses,
        sucursal,
        unidades: unidadesSeleccionadas,
      });
      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        mes: MESES[i].slice(0, 3),
        facturado: 0,
      }));
      data.forEach((r) => {
        const m = new Date(r.fecha).getMonth();
        byMonth[m].facturado += Number(r.monto);
      });

      if (meses !== "all") {
        const allowedShortNames = meses.map((m) => MESES[m - 1].slice(0, 3));
        return byMonth.filter((item) => allowedShortNames.includes(item.mes));
      } else {
        const cap = getAllMonthsCap(anio);
        return byMonth.slice(0, cap);
      }
    },
  });

  const porCompania = useMemo(() => {
    const map = new Map<string, number>();
    (servicios ?? []).forEach((s) => {
      const comp = s.compania || "Sin compañía";
      map.set(comp, (map.get(comp) ?? 0) + Number(s.monto));
    });
    return Array.from(map.entries())
      .map(([compania, monto]) => ({ compania, monto }))
      .sort((a, b) => b.monto - a.monto);
  }, [servicios]);

  const porSucursal = useMemo(() => {
    if (!servicios || !sucursales) return [];
    const map = new Map<string, { nombre: string; monto: number }>();
    sucursales.forEach((s) => map.set(s.id, { nombre: s.nombre, monto: 0 }));
    servicios.forEach((r) => {
      if (r.sucursalId && map.has(r.sucursalId)) {
        map.get(r.sucursalId)!.monto += Number(r.monto);
      }
    });
    return Array.from(map.values())
      .filter((r) => r.monto > 0)
      .sort((a, b) => b.monto - a.monto);
  }, [servicios, sucursales]);

  const participacionVentas = useMemo(() => {
    return [
      { name: "Ventas Internas", value: totales.ventas_internas },
      { name: "Ventas Talleres", value: totales.ventas_talleres },
      { name: "Ventas CSA", value: totales.ventas_csa },
    ].filter((r) => r.value > 0);
  }, [totales]);

  const cumplimientoSucursal = useMemo(() => {
    if (!servicios || !sucursales) return [];
    const map = new Map<string, { nombre: string; count: number; monto: number }>();
    sucursales.forEach((s) => map.set(s.id, { nombre: s.nombre, count: 0, monto: 0 }));
    servicios.forEach((r) => {
      if (r.sucursalId && map.has(r.sucursalId)) {
        const entry = map.get(r.sucursalId)!;
        entry.count += 1;
        entry.monto += Number(r.monto);
      }
    });
    return Array.from(map.values())
      .filter((r) => r.count > 0)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 6);
  }, [servicios, sucursales]);

  const porTipoServicio = useMemo(() => {
    const map = new Map<string, number>();
    (servicios ?? []).forEach((s) => {
      const tipo = s.tipoServicio || "Otro";
      map.set(tipo, (map.get(tipo) ?? 0) + Number(s.monto));
    });
    return Array.from(map.entries())
      .map(([tipo, monto]) => ({ tipo, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 8);
  }, [servicios]);

  const filteredCobranzas = useMemo(() => {
    if (!cobranzasData) return [];
    const s = searchQ.toLowerCase();
    return cobranzasData.filter(
      (r) =>
        r.cliente.toLowerCase().includes(s) || (r.facturaNumero ?? "").toLowerCase().includes(s),
    );
  }, [cobranzasData, searchQ]);

  const PIE_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-chart-calm-2)",
  ];

  return (
    <div className="flex flex-col gap-6 max-w-400">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard comercial</h1>
      </div>
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursalOptions={
          canFilterSucursal
            ? sucursales
                ?.filter((s) => s.nombre !== "Machine Shop")
                .map((s) => ({ value: s.id, label: s.nombre }))
            : undefined
        }
        unitOptions={
          canFilterUnidad
            ? unidades?.map((u) => ({ value: u.id, label: u.nombre.toUpperCase() }))
            : undefined
        }
        defaultMes={meses}
        defaultAnio={anio}
        defaultUnits={unidadesSeleccionadas}
        showAllMonths
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Ventas Internas"
          value={money(totales.ventas_internas)}
          accent="primary"
          icon={Zap}
        />
        <KpiCard
          label="Ventas Talleres"
          value={money(totales.ventas_talleres)}
          accent="success"
          icon={Wrench}
        />
        <KpiCard
          label="Ventas CSA"
          value={money(totales.ventas_csa)}
          accent="warning"
          icon={User}
        />
        <KpiCard
          label="Total Facturado"
          value={money(totales.total)}
          accent="ochre"
          icon={TrendingUp}
          hint={`${servicios?.length ?? 0} servicios`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-elevated p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Ventas Mensuales Servicios</h3>
              <p className="text-xs text-muted-foreground">{anio}</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend ?? []}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="facturado"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.6}
                />
                <Line
                  type="monotone"
                  dataKey="facturado"
                  stroke="var(--color-primary)"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Facturación por Compañía</h3>
          <p className="text-xs text-muted-foreground mb-4">Top compañías</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={porCompania}
                  dataKey="monto"
                  nameKey="compania"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {porCompania.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-elevated p-5">
        <div className="mb-4">
          <h3 className="font-display font-semibold">Facturación por Sucursal Servicios</h3>
          <p className="text-xs text-muted-foreground">Monto total por sucursal</p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porSucursal}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="nombre" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <Tooltip
                formatter={((v: unknown) => money(Number(v))) as never}
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 0,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="monto" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Participación Ventas {anio}</h3>
          <p className="text-xs text-muted-foreground mb-4">Por categoría</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={participacionVentas}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={35}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {participacionVentas.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Servicios por Sucursal</h3>
          <p className="text-xs text-muted-foreground mb-4">Cantidad de servicios</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cumplimientoSucursal} layout="vertical">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  dataKey="nombre"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  width={100}
                />
                <Tooltip
                  formatter={(v: unknown) => String(Number(v))}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-5">
          <h3 className="font-display font-semibold">Monto por Tipo Servicio</h3>
          <p className="text-xs text-muted-foreground mb-4">Top tipos</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porTipoServicio} layout="vertical">
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => money(v)}
                />
                <YAxis
                  dataKey="tipo"
                  type="category"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  width={120}
                />
                <Tooltip
                  formatter={((v: unknown) => money(Number(v))) as never}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 0,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="monto" fill="var(--color-success)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold">Clientes Cuentas x Cobrar</h3>
            <p className="text-xs text-muted-foreground">Detalles de pendientes</p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar cliente o factura…"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Cliente
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Factura
                </TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Monto
                </TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Saldo
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Vencimiento
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Cargando…
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : filteredCobranzas.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          No hay cuentas por cobrar
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCobranzas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="px-4 py-3 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">
                      {r.facturaNumero ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums">
                      {money(Number(r.monto))}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right tabular-nums font-medium">
                      {money(Number(r.saldo))}
                    </TableCell>
                    <TableCell className="px-4 py-3 tabular-nums text-muted-foreground">
                      {r.fechaVencimiento}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Cargando datos…</div>}
    </div>
  );
}
