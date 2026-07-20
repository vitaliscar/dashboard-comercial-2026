import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, pct } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Shield, TrendingUp, Wallet, Users } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { StatusPill } from "@/components/status-pill";
import { useAuth } from "@/hooks/use-auth";
import { scoped } from "@/lib/data-scope";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { computeParetoSummary, type ParetoInputRow, type ParetoRow } from "@/lib/analytics/pareto";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { resolverAsesor } from "@/lib/asesores-catalogo";

export const Route = createFileRoute("/_app/pareto")({
  head: () => ({ meta: [{ title: "Análisis Pareto · CCV" }] }),
  component: Pareto,
});

type Fuente = "cotizado" | "facturado" | "perdido";

const FUENTE_TABLA: Record<Fuente, "cotizaciones" | "facturas" | "ventas_perdidas"> = {
  cotizado: "cotizaciones",
  facturado: "facturas",
  perdido: "ventas_perdidas",
};

const FUENTE_TITULO: Record<Fuente, string> = {
  cotizado: "Cotizado",
  facturado: "Facturado",
  perdido: "Ventas Perdidas",
};

const FUENTE_ASESOR_COL: Record<Fuente, "asesor" | "asesor_codigo"> = {
  cotizado: "asesor_codigo",
  facturado: "asesor",
  perdido: "asesor",
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

interface ParetoRowWithSucursales extends ParetoRow {
  sucursales: number;
}

function Pareto() {
  const { role, profile } = useAuth();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(0);
  const [dim, setDim] = useState<"cliente" | "asesor">("cliente");
  const [fuente, setFuente] = useState<Fuente>("facturado");

  const canView = role === "gerencia" || role === "gerente_comercial";
  const asesorCol = FUENTE_ASESOR_COL[fuente];

  const { data } = useQuery({
    queryKey: ["pareto", fuente, anio, mes],
    enabled: canView,
    queryFn: async () => {
      const tabla = FUENTE_TABLA[fuente];
      const desde = mes === 0 ? `${anio}-01-01` : `${anio}-${String(mes).padStart(2, "0")}-01`;
      const hastaAnio = mes === 0 || mes === 12 ? anio + 1 : anio;
      const hastaMes = mes === 0 || mes === 12 ? 1 : mes + 1;
      const hasta = `${hastaAnio}-${String(hastaMes).padStart(2, "0")}-01`;
      const buildQuery = () => {
        return scoped(
          supabase
            .from(tabla)
            .select(`cliente, ${asesorCol}, monto, sucursal_id`)
            .gte("fecha", desde)
            .lt("fecha", hasta),
          role,
          profile,
          profile?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      };
      const allRows = await fetchAllRows(buildQuery);
      return (allRows ?? []) as unknown as Array<{
        cliente: string | null;
        monto: number;
        sucursal_id: string | null;
        [key: string]: unknown;
      }>;
    },
  });

  // Agrupar por cliente/asesor Y contar sucursales únicas
  const { rows, totalGeneral, top20Count, top20Sum, top20Share, vitales } = useMemo(() => {
    const grouped = new Map<string, { monto: number; sucursales: Set<string> }>();

    (data ?? []).forEach((r) => {
      let key = "";
      if (dim === "cliente") {
        key = (r.cliente ?? "") as string;
      } else {
        const val = (r[asesorCol] ?? "") as string;
        const resolved = resolverAsesor(fuente === "cotizado" ? { codigo: val } : { nombre: val });
        key = resolved.nombre;
      }
      if (!key) return;
      const curr = grouped.get(key) ?? { monto: 0, sucursales: new Set<string>() };
      curr.monto += Number(r.monto);
      if (r.sucursal_id) curr.sucursales.add(r.sucursal_id);
      grouped.set(key, curr);
    });

    const input: ParetoInputRow[] = Array.from(grouped.entries()).map(([key, v]) => ({
      key,
      monto: v.monto,
    }));

    const summary = computeParetoSummary(input);

    // Adjuntar conteo de sucursales a cada fila
    const rowsWithSuc: ParetoRowWithSucursales[] = summary.rows.map((row) => ({
      ...row,
      sucursales: grouped.get(row.nombre)?.sucursales.size ?? 0,
    }));

    return {
      ...summary,
      rows: rowsWithSuc,
    };
  }, [data, dim, asesorCol, fuente]);

  // Solo clientes vitales (clasificación A = acumulado <= 80%)
  const vitalesRows = rows.filter((r) => r.clasificacion === "A");

  // Chart: solo los vitales, ordenados de mayor a menor
  const chartData = vitalesRows.slice(0, 15); // máximo 15 para que el chart sea legible

  const chartConfig: ChartConfig = useMemo(
    () => ({
      monto: { label: FUENTE_TITULO[fuente], color: "var(--color-primary)" },
      acumulado: { label: "% Acumulado", color: "var(--color-destructive)" },
    }),
    [fuente],
  );

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Sólo los perfiles Gerencia Nacional y Gerente Comercial pueden ver Pareto 80/20.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-7 w-7" /> Pareto 80/20 — {FUENTE_TITULO[fuente]}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {vitalesRows.length} {dim === "cliente" ? "clientes" : "asesores"} vitales concentran el
            80% de {FUENTE_TITULO[fuente].toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <Tabs value={fuente} onValueChange={(v) => setFuente(v as Fuente)}>
            <TabsList>
              <TabsTrigger value="cotizado">Cotizado</TabsTrigger>
              <TabsTrigger value="facturado">Facturado</TabsTrigger>
              <TabsTrigger value="perdido">Ventas perdidas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Dimensión</Label>
            <Select value={dim} onValueChange={(v) => setDim(v as "cliente" | "asesor")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cliente">Por cliente</SelectItem>
                <SelectItem value="asesor">Por asesor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todos</SelectItem>
                {MESES.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={`Total ${FUENTE_TITULO[fuente]}`}
          value={money(totalGeneral)}
          icon={Wallet}
          hint={`${rows.length} ${dim === "cliente" ? "clientes" : "asesores"} en total`}
        />
        <KpiCard
          label={`Top ${top20Count} (20%)`}
          value={money(top20Sum)}
          icon={TrendingUp}
          hint={`representa el ${pct(top20Share, 1)}`}
        />
        <KpiCard
          label="Clientes vitales"
          value={String(vitalesRows.length)}
          icon={Shield}
          accent="ochre"
          hint={`concentran el 80% de ${FUENTE_TITULO[fuente].toLowerCase()}`}
        />
      </div>

      {/* Chart horizontal: barras con nombres legibles en eje Y */}
      <div className="card-elevated p-5">
        <h3 className="font-display font-semibold mb-1">
          Clientes vitales — {FUENTE_TITULO[fuente]}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {chartData.length} clientes que generan el 80% · barras = monto · línea = % acumulado
        </p>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              layout="vertical"
              margin={{ left: 10, right: 60, top: 5, bottom: 5 }}
            >
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => money(v)}
              />
              <YAxis
                type="category"
                yAxisId="left"
                dataKey="nombre"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                width={160}
                tick={{ textAnchor: "end" }}
              />
              <YAxis
                type="number"
                yAxisId="right"
                orientation="right"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {name === "acumulado"
                          ? `${Number(value).toFixed(1)}%`
                          : money(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                yAxisId="left"
                dataKey="monto"
                fill="var(--color-monto)"
                radius={[0, 4, 4, 0]}
                barSize={18}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acumulado"
                stroke="var(--color-acumulado)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <ReferenceLine
                yAxisId="right"
                y={80}
                stroke="var(--color-destructive)"
                strokeDasharray="4 4"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      {/* Tabla: solo vitales (80%) */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold">
              {dim === "cliente" ? "Clientes" : "Asesores"} vitales (80%)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vitalesRows.length} {dim === "cliente" ? "clientes" : "asesores"} · agrupados a nivel
              nacional
              {dim === "cliente" && "· incluye todas las sucursales"}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary text-primary-foreground sticky top-0 [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider w-12 text-primary-foreground">
                  #
                </TableHead>
                <TableHead className="text-left px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  {dim === "cliente" ? "Cliente" : "Asesor"}
                </TableHead>
                {dim === "cliente" && (
                  <TableHead className="text-center px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                    <Users className="inline size-3.5 mr-1" />
                    Suc.
                  </TableHead>
                )}
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  Monto
                </TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  % del total
                </TableHead>
                <TableHead className="text-right px-4 py-2.5 font-medium text-xs tracking-wider text-primary-foreground">
                  % Acumulado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vitalesRows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={dim === "cliente" ? 6 : 5} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin datos para el período seleccionado
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                vitalesRows.map((r, i) => (
                  <TableRow key={r.nombre} className="hover:bg-muted/40">
                    <TableCell className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs">
                      {i + 1}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 font-medium text-sm">{r.nombre}</TableCell>
                    {dim === "cliente" && (
                      <TableCell className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                        {r.sucursales > 1 ? (
                          <StatusPill kind="neutral">{r.sucursales}</StatusPill>
                        ) : (
                          <span className="text-muted-foreground/50">1</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {money(r.monto)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums">
                      {pct(r.share, 1)}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {pct(r.acumulado, 1)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
