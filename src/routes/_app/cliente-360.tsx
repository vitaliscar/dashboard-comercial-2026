import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { scoped } from "@/lib/data-scope";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { money, diasEntre } from "@/lib/format";
import { canAccessModule } from "@/lib/permissions";
import { computeHealthScore, healthBand, type HealthBand } from "@/lib/analytics/health-score";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/status-pill";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export const Route = createFileRoute("/_app/cliente-360")({
  head: () => ({ meta: [{ title: "Cliente 360° · CCV" }] }),
  component: Cliente360,
});

const BAND_KIND: Record<HealthBand, "success" | "warning" | "danger"> = {
  sano: "success",
  atencion: "warning",
  riesgo: "danger",
};
const BAND_LABEL: Record<HealthBand, string> = {
  sano: "Sano",
  atencion: "Atención",
  riesgo: "Riesgo",
};

interface ClienteRow {
  cliente: string;
  ltv: number;
  saldoVencido: number;
  diasVencidoMax: number;
  recenciaDias: number | null;
  montoPerdidoReciente: number;
  health: number;
  band: HealthBand;
  prioridad: number;
}

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function Cliente360() {
  const { role, profile, user } = useAuth();
  const canView = canAccessModule(role, "cliente_360");
  const [search, setSearch] = useState("");
  const hoy = useMemo(() => new Date(), []);
  const hace90d = useMemo(() => {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, [hoy]);

  const { data, isLoading } = useQuery({
    queryKey: ["cliente-360", role, profile?.id],
    enabled: canView,
    queryFn: async () => {
      const buildFacQuery = () =>
        scoped(supabase.from("facturas").select("cliente, fecha, monto"), role, profile, user?.id, {
          sucursal: "sucursal_id",
          unidad: "unidad_negocio_id",
          asesor: "asesor_id",
        });
      const buildVpQuery = () =>
        scoped(
          supabase.from("ventas_perdidas").select("cliente, fecha, monto").gte("fecha", hace90d),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
        );
      const buildCobQuery = () =>
        scoped(
          supabase.from("cobranzas").select("cliente, saldo, fecha_vencimiento").gt("saldo", 0),
          role,
          profile,
          user?.id,
          { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
        );

      const [facturas, ventasPerdidas, cobranzas] = await Promise.all([
        fetchAllRows(buildFacQuery),
        fetchAllRows(buildVpQuery),
        fetchAllRows(buildCobQuery),
      ]);

      return { facturas, ventasPerdidas, cobranzas };
    },
  });

  const rows: ClienteRow[] = useMemo(() => {
    if (!data) return [];
    const porCliente = new Map<
      string,
      {
        nombre: string;
        ltv: number;
        ultimaFecha: Date | null;
        saldoVencido: number;
        diasVencidoMax: number;
        montoPerdidoReciente: number;
      }
    >();

    const upsert = (nombre: string) => {
      const key = normalize(nombre);
      if (!key) return null;
      let e = porCliente.get(key);
      if (!e) {
        e = {
          nombre,
          ltv: 0,
          ultimaFecha: null,
          saldoVencido: 0,
          diasVencidoMax: 0,
          montoPerdidoReciente: 0,
        };
        porCliente.set(key, e);
      }
      return e;
    };

    data.facturas.forEach((f) => {
      const e = upsert(f.cliente);
      if (!e) return;
      e.ltv += Number(f.monto) || 0;
      const fecha = new Date(f.fecha);
      if (!isNaN(fecha.getTime()) && (!e.ultimaFecha || fecha > e.ultimaFecha))
        e.ultimaFecha = fecha;
    });

    data.ventasPerdidas.forEach((v) => {
      const e = upsert(v.cliente);
      if (!e) return;
      e.montoPerdidoReciente += Number(v.monto) || 0;
    });

    data.cobranzas.forEach((c) => {
      const e = upsert(c.cliente);
      if (!e) return;
      e.saldoVencido += Number(c.saldo) || 0;
      const dias = diasEntre(c.fecha_vencimiento, hoy);
      if (dias > e.diasVencidoMax) e.diasVencidoMax = dias;
    });

    return Array.from(porCliente.values())
      .map((e) => {
        const recenciaDias = e.ultimaFecha ? diasEntre(e.ultimaFecha, hoy) : null;
        const health = computeHealthScore({
          diasVencidoMax: Math.max(0, e.diasVencidoMax),
          saldoVencido: e.saldoVencido,
          recenciaDias: recenciaDias ?? 365,
          montoPerdidoReciente: e.montoPerdidoReciente,
          ltv: e.ltv,
        });
        const band = healthBand(health);
        return {
          cliente: e.nombre,
          ltv: Math.round(e.ltv * 100) / 100,
          saldoVencido: Math.round(e.saldoVencido * 100) / 100,
          diasVencidoMax: Math.max(0, e.diasVencidoMax),
          recenciaDias,
          montoPerdidoReciente: Math.round(e.montoPerdidoReciente * 100) / 100,
          health,
          band,
          prioridad: e.saldoVencido * (1 - health / 100),
        };
      })
      .sort((a, b) => b.prioridad - a.prioridad);
  }, [data, hoy]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = normalize(search);
    return rows.filter((r) => normalize(r.cliente).includes(q));
  }, [rows, search]);

  const kpis = useMemo(() => {
    const enRiesgo = rows.filter((r) => r.band === "riesgo").length;
    const saldoTotalVencido = rows.reduce((a, r) => a + r.saldoVencido, 0);
    const ltvTotal = rows.reduce((a, r) => a + r.ltv, 0);
    return { total: rows.length, enRiesgo, saldoTotalVencido, ltvTotal };
  }, [rows]);

  if (!canView) {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <PageHeader eyebrow="Analytics / Clientes" title="Cliente 360° · Salud y Riesgo" />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <KpiCard label="Clientes" value={String(kpis.total)} accent="primary" icon={Users} />
        <KpiCard
          label="En riesgo"
          value={String(kpis.enRiesgo)}
          accent={kpis.enRiesgo > 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Saldo vencido total"
          value={money(kpis.saldoTotalVencido)}
          accent="warning"
        />
        <KpiCard label="LTV histórico total" value={money(kpis.ltvTotal)} accent="success" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8"
        />
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader className="bg-primary [&_tr]:border-b-0">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-primary-foreground text-left px-3 py-2 text-xs tracking-wider">
                  Cliente
                </TableHead>
                <TableHead className="text-primary-foreground text-center px-3 py-2 text-xs tracking-wider">
                  Salud
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  LTV histórico
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Saldo vencido
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Días vencido (máx)
                </TableHead>
                <TableHead className="text-primary-foreground text-right px-3 py-2 text-xs tracking-wider">
                  Recencia
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle className="text-sm font-normal text-muted-foreground">
                          Sin clientes para mostrar
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.slice(0, 100).map((r) => (
                  <TableRow key={r.cliente} className="hover:bg-muted/20">
                    <TableCell className="px-3 py-2 font-medium">{r.cliente}</TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <StatusPill kind={BAND_KIND[r.band]}>
                        {BAND_LABEL[r.band]} · {r.health.toFixed(0)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {money(r.ltv)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {r.saldoVencido > 0 ? money(r.saldoVencido) : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {r.diasVencidoMax > 0 ? r.diasVencidoMax : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {r.recenciaDias !== null ? `${r.recenciaDias}d` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filteredRows.length > 100 && (
          <div className="p-2 text-center text-xs text-muted-foreground border-t border-border">
            Mostrando 100 de {filteredRows.length} clientes — refina la búsqueda
          </div>
        )}
      </div>
    </div>
  );
}
