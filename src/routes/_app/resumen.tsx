import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback, type CSSProperties } from "react";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { PageHeader } from "@/components/page-header";
import { KpiCards } from "@/components/resumen/KpiCards";
import { CotizacionesSection } from "@/components/resumen/CotizacionesSection";
import { FacturadoSection } from "@/components/resumen/FacturadoSection";
import { VentasPerdidasSection } from "@/components/resumen/VentasPerdidasSection";
import { ResumenData, UnidadNegocio, TopCliente } from "@/lib/resumen-types";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { scoped } from "@/lib/data-scope";
import { canFilterSucursal, getAccessibleSucursales } from "@/lib/permissions";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import {
  getDateRangesForMonths,
  applyDateRangesToQuery,
  applyMonthFilterToQuery,
  getAllowedMonths,
} from "@/lib/date-range";

export const Route = createFileRoute("/_app/resumen")({
  component: ResumenPage,
});

function SkeletonBox({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton rounded ${className ?? ""}`} style={style} />;
}

function ResumenSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Filter header */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 items-start sm:items-end">
          {[140, 120, 200].map((w) => (
            <div key={w} className="flex flex-col gap-2">
              <SkeletonBox className="h-3 w-10" />
              <SkeletonBox className="h-9" style={{ width: w } as CSSProperties} />
            </div>
          ))}
          <SkeletonBox className="h-9 w-28 sm:self-end" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-elevated p-5 flex flex-col gap-3">
            <SkeletonBox className="h-3 w-28" />
            <SkeletonBox className="h-8 w-40" />
            <SkeletonBox className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Section skeletons */}
      {[0, 1, 2].map((s) => (
        <div key={s} className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <SkeletonBox className="h-4 w-36" />
            <SkeletonBox className="h-3 w-24" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className="card-elevated p-4 flex flex-col gap-3">
                <div className="flex justify-between">
                  <SkeletonBox className="h-2.5 w-16" />
                  <SkeletonBox className="h-2.5 w-8" />
                </div>
                <SkeletonBox className="h-6 w-28" />
                <SkeletonBox className="h-1 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const mapDbUnidadToUi = (dbNombre: string): UnidadNegocio => {
  if (dbNombre === "Servicios") return "Servicios";
  if (dbNombre === "Repuestos") return "Repuestos";
  if (dbNombre === "Lubricantes/Filtros") return "Lub / Filtros";
  if (dbNombre === "Equipos") return "Equipos";
  if (dbNombre === "Alquiler") return "Alquiler";
  // Legacy: la unidad combinada"Equipos/Alquiler"ya no debería existir en datos nuevos.
  if (dbNombre === "Equipos/Alquiler") return "Equipos";
  return "Equipos";
};

function ResumenPage() {
  const { role, profile, user } = useAuth();
  const hideSucursalFilter = role === "coordinador" || role === "asesor";
  const today = new Date();
  const [filters, setFilters] = useState<FilterState>({
    meses: [today.getMonth() + 1],
    anio: today.getFullYear(),
    sucursal: undefined,
  });

  // Fetch reference data
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();

  const selectedSucursalId = useMemo(() => {
    if (!filters.sucursal || !sucursales) return undefined;
    return sucursales.find((s) => s.nombre === filters.sucursal)?.id;
  }, [filters.sucursal, sucursales]);

  // Restrict sucursales selection based on role permissions
  const sucursalesVisibles = useMemo(() => {
    if (!sucursales || !role) return [];

    const context = {
      role: role,
      sucursal: profile?.sucursal_id || undefined,
      unidad_negocio: profile?.unidad_negocio_id || undefined,
    };

    if (!canFilterSucursal(context)) {
      if (profile?.sucursal_id) {
        const name = sucursales.find((s) => s.id === profile.sucursal_id)?.nombre;
        return name ? [name] : [];
      }
      return [];
    }

    const allowedIds = getAccessibleSucursales(context);
    if (allowedIds.length === 0) {
      return sucursales.map((s) => s.nombre);
    }

    return sucursales.filter((s) => allowedIds.includes(s.id)).map((s) => s.nombre);
  }, [sucursales, role, profile]);

  // Set coordinator's sucursal as default and locked
  useEffect(() => {
    if (role === "coordinador" && profile?.sucursal_id && sucursales) {
      const name = sucursales.find((s) => s.id === profile.sucursal_id)?.nombre;
      if (name) {
        setFilters((f) => ({ ...f, sucursal: name }));
      }
    }
  }, [role, profile, sucursales]);

  const dateRanges = useMemo(() => {
    return getDateRangesForMonths(filters.anio, filters.meses);
  }, [filters.anio, filters.meses]);

  const queryKey = [
    "resumen-data",
    filters.anio,
    JSON.stringify(filters.meses),
    selectedSucursalId,
    role,
    profile?.id,
  ];

  const { data: rawData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const buildCotQuery = () => {
        let q = scoped(supabase.from("cotizaciones").select("*"), role, profile, user?.id, {
          sucursal: "sucursal_id",
          unidad: "unidad_negocio_id",
          asesor: "asesor_id",
        });
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        return q;
      };
      const buildFacQuery = () => {
        let q = scoped(supabase.from("facturas").select("*"), role, profile, user?.id, {
          sucursal: "sucursal_id",
          unidad: "unidad_negocio_id",
          asesor: "asesor_id",
        });
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        return q;
      };
      const buildVpQuery = () => {
        let q = scoped(supabase.from("ventas_perdidas").select("*"), role, profile, user?.id, {
          sucursal: "sucursal_id",
          unidad: "unidad_negocio_id",
          asesor: "asesor_id",
        });
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        return q;
      };

      const buildServiciosQuery = () => {
        let q = scoped(supabase.from("servicios").select("*"), role, profile, user?.id, {
          sucursal: "sucursal_id",
          unidad: "unidad_negocio_id",
        });
        q = applyDateRangesToQuery(q, dateRanges);
        if (selectedSucursalId) q = q.eq("sucursal_id", selectedSucursalId);
        return q;
      };

      // rpc_resumen_mensual ya scopea server-side por can_read_row (reemplaza el
      // fetch+scope client-side de `presupuestos`); se filtra por mes/sucursal
      // en memoria y se remapea a la forma original {monto, ventas_ccv, ...}
      // para no tocar el resto de este archivo, que ya consume esos nombres.
      const allowedMonths = getAllowedMonths(filters.anio, filters.meses);
      const preQuery = supabase
        .rpc("rpc_resumen_mensual", { _anio: filters.anio })
        .then(({ data, error }) => {
          if (error) return { data: null, error };
          const rows = (data ?? [])
            .filter(
              (r) =>
                allowedMonths.includes(r.mes) &&
                (!selectedSucursalId || r.sucursal_id === selectedSucursalId),
            )
            .map((r) => ({
              monto: r.meta,
              ventas_ccv: r.facturado_ccv,
              ventas_xibi: r.facturado_xibi,
              ventas_estrategicas: r.facturado_estrategicas,
              sucursal_id: r.sucursal_id,
              unidad_negocio_id: r.unidad_negocio_id,
            }));
          return { data: rows, error: null };
        });

      let caQuery = scoped(
        supabase
          .from("cumplimiento_asesores")
          .select("mes, presupuesto, venta, unidad_negocio_id")
          .eq("anio", filters.anio),
        role,
        profile,
        user?.id,
        { sucursal: "sucursal_id", unidad: "unidad_negocio_id", asesor: "asesor_id" },
      );
      caQuery = applyMonthFilterToQuery(caQuery, filters.meses, filters.anio);

      // cotizaciones/facturas/ventas_perdidas/servicios pueden superar las 1000 filas que
      // PostgREST devuelve por página — se paginan explícitamente para no truncar totales.
      const [cotizaciones, facturas, ventasPerdidas, servicios, preRes, caRes] = await Promise.all([
        fetchAllRows(buildCotQuery),
        fetchAllRows(buildFacQuery),
        fetchAllRows(buildVpQuery),
        fetchAllRows(buildServiciosQuery),
        preQuery,
        role === "asesor" ? caQuery : Promise.resolve({ data: [], error: null }),
      ]);

      if (preRes.error) throw preRes.error;
      if (caRes.error) throw caRes.error;

      return {
        cotizaciones,
        facturas,
        ventasPerdidas,
        servicios,
        presupuestos: preRes.data || [],
        cumplimientoAsesor: caRes.data || [],
      };
    },
    enabled: !!unidades && !!sucursales,
  });

  const resumenData = useMemo<ResumenData | null>(() => {
    if (!rawData || !unidades || !sucursales) return null;

    const unitMap = new Map<string, string>();
    unidades.forEach((u) => unitMap.set(u.id, u.nombre));

    const sucMap = new Map<string, string>();
    sucursales.forEach((s) => sucMap.set(s.id, s.nombre));

    const maturinId = sucursales.find((s) => s.nombre === "Maturín")?.id;
    const categories: UnidadNegocio[] = [
      "Servicios",
      "Repuestos",
      "Lub / Filtros",
      "Alquiler",
      "Equipos",
    ];

    // 1. KPIs
    let totalCotizado = 0;
    let totalMetaMes = 0;
    let totalFacturado = 0;
    let totalPerdido = 0;

    rawData.cotizaciones.forEach((c) => {
      totalCotizado += c.monto;
    });
    // Facturado = Ventas_CCV + Ventas_Xibi + Ventas_Estrategicas de CumplimientoBase (presupuestos),
    // no la suma transaccional de facturas — esa hoja no es la fuente de verdad para este KPI.
    // Excepción: para un asesor individual, `presupuestos` no tiene desglose por asesor (solo por
    // sucursal+U/N), así que la meta y el facturado salen de cumplimiento_asesores en su lugar.
    if (role === "asesor") {
      rawData.cumplimientoAsesor.forEach((c) => {
        totalMetaMes += Number(c.presupuesto || 0);
        totalFacturado += Number(c.venta || 0);
      });
    } else {
      rawData.presupuestos.forEach((p) => {
        totalMetaMes += Number(p.monto || 0);
        totalFacturado +=
          Number(p.ventas_ccv || 0) +
          Number(p.ventas_xibi || 0) +
          Number(p.ventas_estrategicas || 0);
      });
    }
    rawData.ventasPerdidas.forEach((vp) => {
      totalPerdido += vp.monto;
    });

    const facturadoVsCotizadoPorcentaje =
      totalCotizado > 0 ? (totalFacturado / totalCotizado) * 100 : 0;
    const cumplimientoMetaPorcentaje = totalMetaMes > 0 ? (totalFacturado / totalMetaMes) * 100 : 0;
    const lostPercentage = totalCotizado > 0 ? (totalPerdido / totalCotizado) * 100 : 0;

    // 2. Cotizaciones by category
    const cotizacionesMetricas = categories.map((cat) => {
      const filtered = rawData.cotizaciones.filter((c) => {
        const dbName = c.unidad_negocio_id ? unitMap.get(c.unidad_negocio_id) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const monto = filtered.reduce((sum, c) => sum + c.monto, 0);

      const clientMap = new Map<string, TopCliente>();
      filtered.forEach((c) => {
        const key = `${c.cliente}|${c.sucursal_id}`;
        const existing = clientMap.get(key);
        if (existing) {
          existing.monto += c.monto;
        } else {
          clientMap.set(key, {
            cliente: c.cliente,
            sucursal: c.sucursal_id ? sucMap.get(c.sucursal_id) || "" : "",
            monto: c.monto,
          });
        }
      });
      const topClientes = Array.from(clientMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      return {
        unidad: cat,
        monto,
        porcentaje: 0,
        topClientes,
      };
    });

    const sumCotizaciones = cotizacionesMetricas.reduce((sum, m) => sum + m.monto, 0);
    cotizacionesMetricas.forEach((m) => {
      m.porcentaje = sumCotizaciones > 0 ? (m.monto / sumCotizaciones) * 100 : 0;
      m.topClientes.forEach((tc) => {
        tc.porcentaje = m.monto > 0 ? (tc.monto / m.monto) * 100 : 0;
      });
    });

    // 3. Facturado by category — fuente de verdad es CumplimientoBase (presupuestos):
    // Ventas_CCV + Ventas_Xibi + Ventas_Estrategicas por U/N y mes. `facturas` (transaccional)
    // solo se usa para el detalle de top clientes, que no tiene esa segmentación en origen.
    // Para Servicios: usa tabla `servicios` directamente, sin agrupar por cliente.
    // Margen estimado = monto facturado × porcentaje comercial de la unidad
    const margenPorcentajePorUnidad: Record<string, number> = {
      Repuestos: 28,
      "Lub / Filtros": 22,
      Servicios: 40,
      Equipos: 30,
      Alquiler: 45,
    };
    const facturadoMetricas = categories.map((cat) => {
      let topClientes: TopCliente[] = [];
      let monto = 0;
      let presupuesto = 0;
      let ventasCCV = 0;
      let ventasXibi = 0;
      let ventasEstrategicas = 0;

      if (cat === "Servicios") {
        // Para Servicios: extrae de tabla `servicios`, TOP 5 por facturación agrupada por cliente+sucursal
        const filteredServ = (rawData.servicios || []).filter((s) => {
          const dbName = s.unidad_negocio_id ? unitMap.get(s.unidad_negocio_id) : "";
          return dbName && mapDbUnidadToUi(dbName) === cat;
        });

        const clientMap = new Map<string, TopCliente>();
        filteredServ.forEach((s) => {
          const key = `${s.cliente}|${s.sucursal_id}`;
          const existing = clientMap.get(key);
          if (existing) {
            existing.monto += s.monto || 0;
          } else {
            clientMap.set(key, {
              cliente: s.cliente || "Cliente S/N",
              sucursal: s.sucursal_id ? sucMap.get(s.sucursal_id) || "" : "",
              monto: s.monto || 0,
            });
          }
        });
        topClientes = Array.from(clientMap.values())
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5);
      } else {
        // Para otras categorías: usa facturas, agrupa por cliente+sucursal
        const filteredFac = rawData.facturas.filter((f) => {
          const dbName = f.unidad_negocio_id ? unitMap.get(f.unidad_negocio_id) : "";
          return dbName && mapDbUnidadToUi(dbName) === cat;
        });

        const clientMap = new Map<string, TopCliente>();
        filteredFac.forEach((f) => {
          const key = `${f.cliente}|${f.sucursal_id}`;
          const existing = clientMap.get(key);
          if (existing) {
            existing.monto += f.monto;
          } else {
            clientMap.set(key, {
              cliente: f.cliente,
              sucursal: f.sucursal_id ? sucMap.get(f.sucursal_id) || "" : "",
              monto: f.monto,
            });
          }
        });
        topClientes = Array.from(clientMap.values())
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5);
      }

      if (role === "asesor") {
        // cumplimiento_asesores no distingue Ventas_CCV/Xibi/Estratégicas — solo presupuesto y
        // venta totales por U/N para este asesor.
        const filteredCa = rawData.cumplimientoAsesor.filter((c) => {
          const dbName = c.unidad_negocio_id ? unitMap.get(c.unidad_negocio_id) : "";
          return dbName && mapDbUnidadToUi(dbName) === cat;
        });
        presupuesto = filteredCa.reduce((sum, c) => sum + Number(c.presupuesto || 0), 0);
        monto = filteredCa.reduce((sum, c) => sum + Number(c.venta || 0), 0);
      } else {
        const filteredPre = rawData.presupuestos.filter((p) => {
          const dbName = p.unidad_negocio_id ? unitMap.get(p.unidad_negocio_id) : "";
          const isMaturin = maturinId && p.sucursal_id === maturinId;
          return dbName && mapDbUnidadToUi(dbName) === cat && !isMaturin;
        });
        presupuesto = filteredPre.reduce((sum, p) => sum + p.monto, 0);

        ventasCCV = filteredPre.reduce((sum, p) => sum + Number(p.ventas_ccv || 0), 0);
        ventasXibi = filteredPre.reduce((sum, p) => sum + Number(p.ventas_xibi || 0), 0);
        ventasEstrategicas = filteredPre.reduce(
          (sum, p) => sum + Number(p.ventas_estrategicas || 0),
          0,
        );
        monto = ventasCCV + ventasXibi + ventasEstrategicas;
      }

      const cumplimiento = presupuesto > 0 ? (monto / presupuesto) * 100 : 0;
      const margenPorcentaje = margenPorcentajePorUnidad[cat] || 0;
      const margenMonto = (monto * margenPorcentaje) / 100;

      return {
        unidad: cat,
        monto,
        porcentaje: 0,
        topClientes,
        cumplimiento,
        margenEstimado: margenPorcentaje,
        margenMonto,
        tiposCliente: ["TODAS", "CCV", "XIB", "EST"] as ("TODAS" | "CCV" | "XIB" | "EST")[],
        presupuestoTotal: presupuesto,
        ventasCCV,
        ventasXibi,
        ventasEstrategicas,
      };
    });

    const sumFacturado = facturadoMetricas.reduce((sum, m) => sum + m.monto, 0);
    facturadoMetricas.forEach((m) => {
      m.porcentaje = sumFacturado > 0 ? (m.monto / sumFacturado) * 100 : 0;
      m.topClientes.forEach((tc) => {
        tc.porcentaje = m.monto > 0 ? (tc.monto / m.monto) * 100 : 0;
      });
    });

    const margenTotal = facturadoMetricas.reduce((sum, m) => sum + (m.margenMonto || 0), 0);
    const margenPorcentaje = totalFacturado > 0 ? (margenTotal / totalFacturado) * 100 : 0;

    // 4. Ventas Perdidas by category
    const ventasPerdidasMetricas = categories.map((cat) => {
      const filtered = rawData.ventasPerdidas.filter((vp) => {
        const dbName = vp.unidad_negocio_id ? unitMap.get(vp.unidad_negocio_id) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const monto = filtered.reduce((sum, vp) => sum + vp.monto, 0);

      const clientMap = new Map<string, TopCliente>();
      filtered.forEach((vp) => {
        const key = `${vp.cliente}|${vp.sucursal_id}`;
        const existing = clientMap.get(key);
        if (existing) {
          existing.monto += vp.monto;
        } else {
          clientMap.set(key, {
            cliente: vp.cliente,
            sucursal: vp.sucursal_id ? sucMap.get(vp.sucursal_id) || "" : "",
            monto: vp.monto,
          });
        }
      });
      const topClientes = Array.from(clientMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      const razonMap = new Map<string, { razon: string; monto: number; cantidad: number }>();
      filtered.forEach((vp) => {
        const existing = razonMap.get(vp.razon);
        if (existing) {
          existing.monto += vp.monto;
          existing.cantidad += 1;
        } else {
          razonMap.set(vp.razon, {
            razon: vp.razon,
            monto: vp.monto,
            cantidad: 1,
          });
        }
      });
      const topRazones = Array.from(razonMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      return {
        unidad: cat,
        monto,
        porcentaje: 0,
        topClientes,
        topRazones,
      };
    });

    const sumPerdidas = ventasPerdidasMetricas.reduce((sum, m) => sum + m.monto, 0);
    ventasPerdidasMetricas.forEach((m) => {
      m.porcentaje = sumPerdidas > 0 ? (m.monto / sumPerdidas) * 100 : 0;
      m.topClientes.forEach((tc) => {
        tc.porcentaje = m.monto > 0 ? (tc.monto / m.monto) * 100 : 0;
      });
    });

    return {
      periodo: {
        mes: filters.meses,
        anio: filters.anio,
        sucursal: filters.sucursal,
      },
      kpis: {
        cotizado: totalCotizado,
        metaMes: totalMetaMes,
        facturado: totalFacturado,
        facturadoVsCotizadoPorcentaje,
        cumplimientoMetaPorcentaje,
        margenTotal,
        margenPorcentaje,
        ventasPerdidas: totalPerdido,
        ventasPerdidasPorcentaje: lostPercentage,
      },
      cotizaciones: cotizacionesMetricas,
      facturado: facturadoMetricas,
      ventasPerdidas: ventasPerdidasMetricas,
    };
  }, [rawData, unidades, sucursales, filters, role]);

  const handleApplyFilters = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focus is on form inputs
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "SELECT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFilters((prev) => {
          if (prev.meses === "all") {
            return { ...prev, meses: [12] };
          }
          const currentMes = prev.meses[0] ?? today.getMonth() + 1;
          if (currentMes > 1) {
            return { ...prev, meses: [currentMes - 1] };
          } else {
            return { ...prev, meses: [12], anio: prev.anio - 1 };
          }
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFilters((prev) => {
          if (prev.meses === "all") {
            return { ...prev, meses: [1] };
          }
          const currentMes = prev.meses[0] ?? today.getMonth() + 1;
          if (currentMes < 12) {
            return { ...prev, meses: [currentMes + 1] };
          } else {
            return { ...prev, meses: [1], anio: prev.anio + 1 };
          }
        });
      } else if (e.key === "Escape") {
        e.preventDefault();
        setFilters((prev) => ({ ...prev, sucursal: undefined }));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || !resumenData) {
    return <ResumenSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Analytics / Comercial"
        title="Resumen comercial"
        description="Cotizaciones, facturación y ventas perdidas — consolidado por unidad de negocio."
        className="border-b border-border pb-4"
        action={
          <div className="flex gap-4 text-[10px] font-mono text-muted-foreground">
            <span>
              Última sincronización:{" "}
              {new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-primary">Moneda: USD</span>
          </div>
        }
      />

      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursales={hideSucursalFilter ? undefined : sucursalesVisibles}
        defaultMes={filters.meses}
        defaultAnio={filters.anio}
        defaultSucursal={filters.sucursal}
      />

      {/* Keyboard Shortcuts Info Bar */}
      <div
        role="region"
        aria-label="Atajos de teclado rápidos del panel"
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-muted-foreground/80 font-mono bg-card rounded-lg border border-border/40 select-none no-print"
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="bg-foreground/5 text-foreground font-semibold px-1.5 py-0.5 rounded text-[10px] tracking-wider">
            SHORTCUTS
          </span>
          <span className="flex items-center gap-1.5" aria-keyshortcuts="ArrowLeft ArrowRight">
            Navegar Meses:{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              ←
            </kbd>{" "}
            /{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              →
            </kbd>
          </span>
          <span className="text-muted-foreground/20 hidden md:inline">|</span>
          <span className="flex items-center gap-1.5" aria-keyshortcuts="Escape">
            Limpiar Sucursal:{" "}
            <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
              Esc
            </kbd>
          </span>
        </div>
        <div className="hidden sm:inline-flex items-center gap-1.5" aria-keyshortcuts="Control+P">
          Imprimir / PDF:{" "}
          <kbd className="bg-muted px-1 py-0.5 rounded border border-border font-sans font-bold shadow-sm">
            Ctrl + P
          </kbd>
        </div>
      </div>

      <KpiCards
        cotizado={resumenData.kpis.cotizado}
        metaMes={resumenData.kpis.metaMes}
        facturado={resumenData.kpis.facturado}
        facturadoVsCotizadoPorcentaje={resumenData.kpis.facturadoVsCotizadoPorcentaje}
        cumplimientoMetaPorcentaje={resumenData.kpis.cumplimientoMetaPorcentaje}
        margenTotal={resumenData.kpis.margenTotal}
        margenPorcentaje={resumenData.kpis.margenPorcentaje}
        ventasPerdidas={resumenData.kpis.ventasPerdidas}
        ventasPerdidasPorcentaje={resumenData.kpis.ventasPerdidasPorcentaje}
      />

      {/* Fila superior: Cotizaciones, Facturación y Ventas Perdidas lado a lado (cada unidad
          como fila compacta) — el detalle de top clientes/razones baja junto, debajo del bloque. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CotizacionesSection
          datos={resumenData.cotizaciones}
          hideSucursalColumn={role === "coordinador" || role === "asesor"}
          part="summary"
        />
        <FacturadoSection
          datos={resumenData.facturado}
          hideSucursalColumn={role === "coordinador" || role === "asesor"}
          part="summary"
        />
        <VentasPerdidasSection
          datos={resumenData.ventasPerdidas}
          hideSucursalColumn={role === "coordinador" || role === "asesor"}
          part="summary"
        />
      </div>

      <CotizacionesSection
        datos={resumenData.cotizaciones}
        hideSucursalColumn={role === "coordinador" || role === "asesor"}
        part="detail"
      />

      <FacturadoSection
        datos={resumenData.facturado}
        hideSucursalColumn={role === "coordinador" || role === "asesor"}
        part="detail"
      />

      <VentasPerdidasSection
        datos={resumenData.ventasPerdidas}
        hideSucursalColumn={role === "coordinador" || role === "asesor"}
        part="detail"
      />
    </div>
  );
}
