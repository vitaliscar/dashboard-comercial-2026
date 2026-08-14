"use client";

import { useMemo, useEffect, useCallback, type CSSProperties } from "react";
import { FilterHeader, FilterState } from "@/components/resumen/FilterHeader";
import { PageHeader } from "@/components/page-header";
import { KpiCards } from "@/components/resumen/KpiCards";
import { CotizacionesSection } from "@/components/resumen/CotizacionesSection";
import { FacturadoSection } from "@/components/resumen/FacturadoSection";
import { VentasPerdidasSection } from "@/components/resumen/VentasPerdidasSection";
import { CotizacionesSectionLegacy } from "@/components/resumen/CotizacionesSectionLegacy";
import { FacturadoSectionLegacy } from "@/components/resumen/FacturadoSectionLegacy";
import { VentasPerdidasSectionLegacy } from "@/components/resumen/VentasPerdidasSectionLegacy";
import { ResumenData, UnidadNegocio, TopCliente } from "@/lib/resumen-types";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSharedFilters } from "@/hooks/use-shared-filters";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { canFilterSucursal, getAccessibleSucursales } from "@/lib/permissions";
import { unidadLabelInfo } from "@/lib/unidad-labels";
import { getResumenDataAction } from "@/lib/actions/resumen";
import { AlertCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDateRangesForMonths,
  getPreviousMonthRange,
  getAllMonthsCap,
  getHighlightMonthLabels,
} from "@/lib/date-range";
import { MESES } from "@/lib/format";

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
  // Legacy: la unidad combinada "Equipos/Alquiler" ya no debería existir en datos nuevos.
  if (dbNombre === "Equipos/Alquiler") return "Equipos";
  return "Equipos";
};

export default function ResumenPage() {
  const { role, profile } = useAuth();
  const { filters: sharedFilters, setFilters: setSharedFilters } = useSharedFilters();
  const hideSucursalFilter = role === "coordinador" || role === "asesor";
  const today = new Date();

  // Fetch reference data
  const {
    data: sucursales,
    isLoading: isSucLoading,
    isError: isSucError,
    error: sucError,
  } = useSucursales();
  const {
    data: unidades,
    isLoading: isUnLoading,
    isError: isUnError,
    error: unError,
  } = useUnidades();

  // Selector de unidad de negocio, vía el mismo chip row de FilterHeader que
  // usa /gerencia-nacional (fila "Filtrar por unidad") — "Todas" mantiene el
  // layout anterior por tipo de métrica; una unidad específica cambia a la
  // vista por unidad que ya usa gerente_comercial (que además siempre llega
  // acá scopeado a 1 sola unidad vía RLS, sin depender de esta selección).
  const selectedUnidadId = sharedFilters.unidades[0] ?? null;
  const selectedUnidadUi = useMemo<UnidadNegocio | null>(() => {
    if (!selectedUnidadId || !unidades) return null;
    const u = unidades.find((x) => x.id === selectedUnidadId);
    return u ? (unidadLabelInfo(u.nombre).label as UnidadNegocio) : null;
  }, [selectedUnidadId, unidades]);
  const isSingleUnitView = role === "gerente_comercial" || !!selectedUnidadUi;

  const filters: FilterState = useMemo(() => {
    let sucursalName: string | undefined = undefined;
    if (sharedFilters.sucursales.length > 0 && sucursales) {
      sucursalName = sucursales.find((s) => s.id === sharedFilters.sucursales[0])?.nombre;
    }
    return {
      anio: sharedFilters.anio,
      meses: sharedFilters.meses,
      sucursal: sucursalName,
      unidades: sharedFilters.unidades,
    };
  }, [sharedFilters, sucursales]);

  const selectedSucursalId = useMemo(() => {
    if (sharedFilters.sucursales.length > 0) return sharedFilters.sucursales[0];
    if (!filters.sucursal || !sucursales) return undefined;
    return sucursales.find((s) => s.nombre === filters.sucursal)?.id;
  }, [sharedFilters.sucursales, filters.sucursal, sucursales]);

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
    if (
      role === "coordinador" &&
      profile?.sucursal_id &&
      sucursales &&
      sharedFilters.sucursales[0] !== profile.sucursal_id
    ) {
      setSharedFilters({ sucursales: [profile.sucursal_id] });
    }
  }, [role, profile, sucursales, sharedFilters.sucursales, setSharedFilters]);

  const dateRanges = useMemo(() => {
    return getDateRangesForMonths(filters.anio, filters.meses);
  }, [filters.anio, filters.meses]);

  const prevMonthRanges = useMemo(() => {
    return getPreviousMonthRange(filters.anio, filters.meses);
  }, [filters.anio, filters.meses]);

  const queryKey = [
    "resumen-data",
    filters.anio,
    JSON.stringify(filters.meses),
    selectedSucursalId,
  ];

  const {
    data: rawData,
    isLoading: isDataLoading,
    isError: isDataError,
    error: dataError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () =>
      getResumenDataAction({
        anio: filters.anio,
        meses: filters.meses,
        ranges: dateRanges,
        sucursalId: selectedSucursalId,
        prevMonthRanges,
      }),
    enabled: !!unidades && !!sucursales,
  });

  const resumenData = useMemo<ResumenData | null>(() => {
    if (!rawData || !unidades || !sucursales) return null;

    const unitMap = new Map<string, string>();
    unidades.forEach((u) => unitMap.set(u.id, u.nombre));

    const sucMap = new Map<string, string>();
    sucursales.forEach((s) => sucMap.set(s.id, s.nombre));

    const allCategories: UnidadNegocio[] = [
      "Repuestos",
      "Lub / Filtros",
      "Servicios",
      "Equipos",
      "Alquiler",
    ];
    // Gerencia con una unidad seleccionada → mismo alcance de datos que ve un
    // gerente_comercial de esa unidad (allí llega ya scopeado, vía RLS).
    const categories: UnidadNegocio[] = selectedUnidadUi ? [selectedUnidadUi] : allCategories;

    const matchesSelectedUnit = (unidadNegocioId: string | null | undefined): boolean => {
      if (!selectedUnidadUi) return true;
      const dbName = unidadNegocioId ? unitMap.get(unidadNegocioId) : "";
      return !!dbName && mapDbUnidadToUi(dbName) === selectedUnidadUi;
    };

    // 1. KPIs
    let totalCotizado = 0;
    let totalMetaMes = 0;
    let totalFacturado = 0;
    let totalPerdido = 0;

    rawData.cotizaciones.forEach((c) => {
      if (!matchesSelectedUnit(c.unidadNegocioId)) return;
      totalCotizado += Number(c.montoTotal || 0);
    });
    // Facturado = Ventas_CCV + Ventas_Xibi + Ventas_Estrategicas de CumplimientoBase (presupuestos),
    // no la suma transaccional de facturas — esa hoja no es la fuente de verdad para este KPI.
    // Excepción: para un asesor individual, `presupuestos` no tiene desglose por asesor (solo por
    // sucursal+U/N), así que la meta y el facturado salen de cumplimiento_asesores en su lugar.
    if (role === "asesor") {
      rawData.cumplimientoAsesor.forEach((c) => {
        if (!matchesSelectedUnit(c.unidadNegocioId)) return;
        totalMetaMes += Number(c.presupuesto || 0);
        totalFacturado += Number(c.venta || 0);
      });
    } else {
      rawData.presupuestos.forEach((p) => {
        if (!matchesSelectedUnit(p.unidadNegocioId)) return;
        totalMetaMes += Number(p.monto || 0);
        totalFacturado +=
          Number(p.ventasCcv || 0) + Number(p.ventasXibi || 0) + Number(p.ventasEstrategicas || 0);
      });
    }
    rawData.ventasPerdidas.forEach((vp) => {
      if (!matchesSelectedUnit(vp.unidadNegocioId)) return;
      totalPerdido += Number(vp.montoTotal || 0);
    });

    const facturadoVsCotizadoPorcentaje =
      totalCotizado > 0 ? (totalFacturado / totalCotizado) * 100 : 0;
    const cumplimientoMetaPorcentaje = totalMetaMes > 0 ? (totalFacturado / totalMetaMes) * 100 : 0;
    const lostPercentage = totalCotizado > 0 ? (totalPerdido / totalCotizado) * 100 : 0;

    // 2. Cotizaciones by category
    const cotizacionesMetricas = categories.map((cat) => {
      const filtered = rawData.cotizaciones.filter((c) => {
        const dbName = c.unidadNegocioId ? unitMap.get(c.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const monto = filtered.reduce((sum, c) => sum + Number(c.montoTotal || 0), 0);

      const filteredClientes = (rawData.cotizacionesClientes || []).filter((c) => {
        const dbName = c.unidadNegocioId ? unitMap.get(c.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const clientMap = new Map<string, TopCliente>();
      filteredClientes.forEach((c) => {
        const key = `${c.cliente}|${c.sucursalId || ""}`;
        const existing = clientMap.get(key);
        const m = Number(c.montoTotal || 0);
        if (existing) {
          existing.monto += m;
        } else {
          clientMap.set(key, {
            cliente: c.cliente,
            sucursal: c.sucursalId ? sucMap.get(c.sucursalId) || "" : "",
            monto: m,
          });
        }
      });
      const topClientes = Array.from(clientMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      // Variación vs. mes anterior — solo cuando el filtro es un único mes
      // (con "all" o varios meses seleccionados no hay un "mes anterior" claro).
      let variacionMesAnterior: number | null | undefined = undefined;
      let montoMesAnterior: number | undefined = undefined;
      if (prevMonthRanges.length > 0) {
        montoMesAnterior = (rawData.cotizacionesPrevMonth || [])
          .filter((c) => {
            const dbName = c.unidadNegocioId ? unitMap.get(c.unidadNegocioId) : "";
            return dbName && mapDbUnidadToUi(dbName) === cat;
          })
          .reduce((sum, c) => sum + Number(c.montoTotal || 0), 0);
        variacionMesAnterior =
          montoMesAnterior > 0 ? ((monto - montoMesAnterior) / montoMesAnterior) * 100 : null;
      }

      // Serie mensual (ene..mes actual) para la línea de tiempo de la tarjeta.
      const monthCap = getAllMonthsCap(filters.anio);
      const filteredMensual = (rawData.cotizacionesMensual || []).filter((c) => {
        const dbName = c.unidadNegocioId ? unitMap.get(c.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const montosMensuales = Array.from({ length: monthCap }, (_, i) => {
        const mesNum = i + 1;
        const montoMes = filteredMensual
          .filter((c) => Number(c.mes) === mesNum)
          .reduce((sum, c) => sum + Number(c.montoTotal || 0), 0);
        return { mes: MESES[i].slice(0, 3), monto: montoMes };
      });

      return {
        unidad: cat,
        monto,
        porcentaje: 0,
        topClientes,
        variacionMesAnterior,
        montoMesAnterior,
        montosMensuales,
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
      const filteredFacClientes = (rawData.facturasClientes || []).filter((f) => {
        const dbName = f.unidadNegocioId ? unitMap.get(f.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const facClientMap = new Map<string, TopCliente>();
      filteredFacClientes.forEach((f) => {
        const key = `${f.cliente}|${f.sucursalId || ""}`;
        const existing = facClientMap.get(key);
        const m = Number(f.montoTotal || 0);
        if (existing) {
          existing.monto += m;
        } else {
          facClientMap.set(key, {
            cliente: f.cliente,
            sucursal: f.sucursalId ? sucMap.get(f.sucursalId) || "" : "",
            monto: m,
          });
        }
      });
      const topClientes = Array.from(facClientMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);
      let monto = 0;
      let presupuesto = 0;
      let ventasCCV = 0;
      let ventasXibi = 0;
      let ventasEstrategicas = 0;

      if (role === "asesor") {
        // cumplimiento_asesores no distingue Ventas_CCV/Xibi/Estratégicas — solo presupuesto y
        // venta totales por U/N para este asesor.
        const filteredCa = rawData.cumplimientoAsesor.filter((c) => {
          const dbName = c.unidadNegocioId ? unitMap.get(c.unidadNegocioId) : "";
          return dbName && mapDbUnidadToUi(dbName) === cat;
        });
        presupuesto = filteredCa.reduce((sum, c) => sum + Number(c.presupuesto || 0), 0);
        monto = filteredCa.reduce((sum, c) => sum + Number(c.venta || 0), 0);
      } else {
        // Maturín/Machine Shop se cargan sólo en meses con movimiento real (ver
        // excel-parser.ts debeExcluirCumplimiento) — cualquier fila que llega aquí
        // ya es válida, así que no se filtran por sucursal.
        const filteredPre = rawData.presupuestos.filter((p) => {
          const dbName = p.unidadNegocioId ? unitMap.get(p.unidadNegocioId) : "";
          return dbName && mapDbUnidadToUi(dbName) === cat;
        });
        presupuesto = filteredPre.reduce((sum, p) => sum + Number(p.monto), 0);

        ventasCCV = filteredPre.reduce((sum, p) => sum + Number(p.ventasCcv || 0), 0);
        ventasXibi = filteredPre.reduce((sum, p) => sum + Number(p.ventasXibi || 0), 0);
        ventasEstrategicas = filteredPre.reduce(
          (sum, p) => sum + Number(p.ventasEstrategicas || 0),
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
        const dbName = vp.unidadNegocioId ? unitMap.get(vp.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const monto = filtered.reduce((sum, vp) => sum + Number(vp.montoTotal || 0), 0);

      const filteredClientes = (rawData.ventasPerdidasClientes || []).filter((vp) => {
        const dbName = vp.unidadNegocioId ? unitMap.get(vp.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const vpClientMap = new Map<string, TopCliente>();
      filteredClientes.forEach((vp) => {
        const key = `${vp.cliente}|${vp.sucursalId || ""}`;
        const existing = vpClientMap.get(key);
        const m = Number(vp.montoTotal || 0);
        if (existing) {
          existing.monto += m;
        } else {
          vpClientMap.set(key, {
            cliente: vp.cliente,
            sucursal: vp.sucursalId ? sucMap.get(vp.sucursalId) || "" : "",
            monto: m,
          });
        }
      });
      const topClientes = Array.from(vpClientMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      const filteredRazones = (rawData.ventasPerdidasRazones || []).filter((vp) => {
        const dbName = vp.unidadNegocioId ? unitMap.get(vp.unidadNegocioId) : "";
        return dbName && mapDbUnidadToUi(dbName) === cat;
      });
      const razonMap = new Map<string, { razon: string; monto: number; cantidad: number }>();
      filteredRazones.forEach((vp) => {
        const existing = razonMap.get(vp.razon);
        const m = Number(vp.montoTotal || 0);
        const cant = Number(vp.cantidad || 0);
        if (existing) {
          existing.monto += m;
          existing.cantidad += cant;
        } else {
          razonMap.set(vp.razon, {
            razon: vp.razon,
            monto: m,
            cantidad: cant,
          });
        }
      });
      const topRazones = Array.from(razonMap.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);

      // Variación vs. mes anterior — mismo criterio que en Cotizaciones (solo
      // aplica cuando el filtro es un único mes).
      let variacionMesAnterior: number | null | undefined = undefined;
      let montoMesAnterior: number | undefined = undefined;
      if (prevMonthRanges.length > 0) {
        montoMesAnterior = (rawData.ventasPerdidasPrevMonth || [])
          .filter((vp) => {
            const dbName = vp.unidadNegocioId ? unitMap.get(vp.unidadNegocioId) : "";
            return dbName && mapDbUnidadToUi(dbName) === cat;
          })
          .reduce((sum, vp) => sum + Number(vp.montoTotal || 0), 0);
        variacionMesAnterior =
          montoMesAnterior > 0 ? ((monto - montoMesAnterior) / montoMesAnterior) * 100 : null;
      }

      return {
        unidad: cat,
        monto,
        porcentaje: 0,
        topClientes,
        topRazones,
        variacionMesAnterior,
        montoMesAnterior,
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
  }, [rawData, unidades, sucursales, filters, role, prevMonthRanges, selectedUnidadUi]);

  const handleApplyFilters = useCallback(
    (newFilters: FilterState) => {
      let sucursalId: string | undefined = undefined;
      if (newFilters.sucursal && sucursales) {
        sucursalId = sucursales.find((s) => s.nombre === newFilters.sucursal)?.id;
      }
      setSharedFilters({
        anio: newFilters.anio,
        meses: newFilters.meses,
        sucursales: sucursalId ? [sucursalId] : [],
        unidades: newFilters.unidades ?? (newFilters.unidad ? [newFilters.unidad] : []),
      });
    },
    [sucursales, setSharedFilters],
  );

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
        if (sharedFilters.meses === "all") {
          setSharedFilters({ meses: [12] });
        } else {
          const currentMes = sharedFilters.meses[0] ?? today.getMonth() + 1;
          if (currentMes > 1) {
            setSharedFilters({ meses: [currentMes - 1] });
          } else {
            setSharedFilters({ meses: [12], anio: sharedFilters.anio - 1 });
          }
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (sharedFilters.meses === "all") {
          setSharedFilters({ meses: [1] });
        } else {
          const currentMes = sharedFilters.meses[0] ?? today.getMonth() + 1;
          if (currentMes < 12) {
            setSharedFilters({ meses: [currentMes + 1] });
          } else {
            setSharedFilters({ meses: [1], anio: sharedFilters.anio + 1 });
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSharedFilters({ sucursales: [] });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sharedFilters, setSharedFilters, today]);

  const isDataLoadingCombined =
    isSucLoading || isUnLoading || (isDataLoading && !!unidades && !!sucursales);
  const hasError = isSucError || isUnError || isDataError;
  const firstError = sucError || unError || dataError;

  if (!role) {
    return (
      <div className="card-elevated p-8 max-w-xl mx-auto my-12 text-center flex flex-col items-center gap-4">
        <Shield className="size-10 text-muted-foreground" />
        <h2 className="font-display text-xl font-bold">Usuario sin rol asignado</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tu cuenta de usuario está activa pero no tiene un rol asignado en la base de datos
          (Gerencia, Gerente Comercial, Coordinador o Asesor).
        </p>
        <p className="text-xs text-muted-foreground">
          Por favor, contacta al administrador del sistema para asignar tu perfil.
        </p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="card-elevated p-8 max-w-xl mx-auto my-12 text-center flex flex-col items-center gap-4">
        <AlertCircle className="size-10 text-destructive" />
        <h2 className="font-display text-xl font-bold">Error al cargar datos</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {firstError instanceof Error
            ? firstError.message
            : "No se pudieron obtener los datos comerciales desde la base de datos."}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (isDataLoadingCombined || !resumenData) {
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

      {/* Mismo FilterHeader (con fila de chips "Filtrar por unidad") que usa
          /gerencia-nacional, para coherencia de diseño. "Todas" mantiene la
          vista consolidada por secciones; una unidad específica cambia a la
          vista que ya usa cada gerente comercial para su unidad. */}
      <FilterHeader
        onApplyFilters={handleApplyFilters}
        sucursales={hideSucursalFilter ? undefined : sucursalesVisibles}
        unitOptions={unidades?.map((u) => ({
          value: u.id,
          label: unidadLabelInfo(u.nombre).label,
        }))}
        defaultMes={filters.meses}
        defaultAnio={filters.anio}
        defaultSucursal={filters.sucursal}
        defaultUnits={sharedFilters.unidades}
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

      {isSingleUnitView ? (
        <>
          {/* Vista por unidad (gerente_comercial, o gerencia con una unidad
              elegida arriba): Cotizaciones y Facturado lado a lado, con
              variación vs. mes anterior y línea de tiempo. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 mb-8">
            <CotizacionesSection
              part="summary"
              datos={resumenData.cotizaciones}
              hideSucursalColumn={role === "coordinador" || role === "asesor"}
              showVariacionMesAnterior
              highlightMonths={getHighlightMonthLabels(filters.meses)}
            />

            <FacturadoSection
              part="summary"
              datos={resumenData.facturado}
              hideSucursalColumn={role === "coordinador" || role === "asesor"}
            />

            <CotizacionesSection
              part="detail"
              datos={resumenData.cotizaciones}
              hideSucursalColumn={role === "coordinador" || role === "asesor"}
            />

            <FacturadoSection
              part="detail"
              datos={resumenData.facturado}
              hideSucursalColumn={role === "coordinador" || role === "asesor"}
            />
          </div>

          <VentasPerdidasSection
            datos={resumenData.ventasPerdidas}
            hideSucursalColumn={role === "coordinador" || role === "asesor"}
            showVariacionMesAnterior
          />
        </>
      ) : (
        <>
          {/* Vista consolidada por tipo de métrica (Gerencia Nacional con
              "Todas las unidades", y coordinador/asesor). */}
          <CotizacionesSectionLegacy
            datos={resumenData.cotizaciones}
            hideSucursalColumn={role === "coordinador" || role === "asesor"}
          />

          <FacturadoSectionLegacy
            datos={resumenData.facturado}
            hideSucursalColumn={role === "coordinador" || role === "asesor"}
          />

          <VentasPerdidasSectionLegacy
            datos={resumenData.ventasPerdidas}
            hideSucursalColumn={role === "coordinador" || role === "asesor"}
          />
        </>
      )}
    </div>
  );
}
