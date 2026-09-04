"use server";

import { and, eq, gt, gte, lt, ne, notInArray, inArray, sql } from "drizzle-orm";
import {
  cobranzas,
  ventasPerdidas,
  minutas,
  cumplimientoAsesores,
  cotizaciones,
  facturas,
  alertas,
  profiles,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { getAllMonthsCap } from "@/lib/date-range";
import { resolverAsesor, VENTAS_CASA, normalizarNombre } from "@/lib/asesores-catalogo";

type Severidad = "alta" | "media" | "baja";
type AlertaTipo =
  | "cobranzas"
  | "ventas_perdidas"
  | "minutas"
  | "cumplimiento"
  | "dependencia"
  | "cotizacion_factura"
  | "cotizaciones_viejas";

type Candidata = {
  claveNatural: string;
  tipo: AlertaTipo;
  severidad: Severidad;
  titulo: string;
  // cliente explícito (no derivarlo del título por regex) -- pedido del
  // usuario 2026-09-04: al crear una minuta desde una alerta, cliente y
  // unidad deben auto-llenarse y bloquearse. null en los tipos que no son
  // sobre un cliente puntual (cumplimiento de asesor, cotizaciones viejas, etc).
  contexto: { detalle: string; monto?: number; accion?: string; cliente?: string | null };
  sucursalId: string | null;
  unidadNegocioId: string | null;
  asesorId: string | null;
};

/**
 * Recalcula las condiciones de alerta contra los datos que el rol actual
 * puede ver (RLS ya scopea las queries de origen por sucursal/unidad/asesor,
 * así que cada visitante reconcilia solo su propio alcance) y sincroniza la
 * tabla `alertas`: abre las nuevas, reabre las que vuelven a cumplirse, y
 * cierra automáticamente las que ya no aplican.
 */
export async function reconcileAlertasAction() {
  return withAuth(async ({ tx, role, userId }) => {
    const anio = new Date().getFullYear();
    const monthCap = getAllMonthsCap(anio);
    const mesesActuales = Array.from({ length: monthCap }, (_, i) => i + 1);
    const today = new Date().toISOString().slice(0, 10);
    const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const from60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const anioInicio = `${anio}-01-01`;
    const anioFin = `${anio + 1}-01-01`;

    const [cobranzasRows, perdidasRows, minutasRows, asesoresRows, cotizacionesRows, facturasRows] =
      await Promise.all([
        tx.select().from(cobranzas).where(gt(cobranzas.saldo, "0")),
        tx.select().from(ventasPerdidas).where(gte(ventasPerdidas.fecha, from60)),
        tx
          .select({
            id: minutas.id,
            cliente: minutas.cliente,
            descripcion: minutas.descripcion,
            fechaLimite: minutas.fechaLimite,
            estado: minutas.estado,
            sucursalId: minutas.sucursalId,
            unidadNegocioId: minutas.unidadNegocioId,
            destinatarioId: minutas.destinatarioId,
            destinatarioNombre: profiles.nombreCompleto,
          })
          .from(minutas)
          .leftJoin(profiles, eq(profiles.id, minutas.destinatarioId))
          .where(ne(minutas.estado, "cumplido")),
        tx
          .select()
          .from(cumplimientoAsesores)
          .where(
            and(
              eq(cumplimientoAsesores.anio, anio),
              inArray(cumplimientoAsesores.mes, mesesActuales),
            ),
          ),
        tx
          .select()
          .from(cotizaciones)
          .where(and(gte(cotizaciones.fecha, anioInicio), lt(cotizaciones.fecha, anioFin))),
        tx
          .select()
          .from(facturas)
          .where(and(gte(facturas.fecha, anioInicio), lt(facturas.fecha, anioFin))),
      ]);

    const expectedRunRate =
      (new Date().getDate() / new Date(anio, new Date().getMonth() + 1, 0).getDate()) * 100;

    const candidatas: Candidata[] = [];

    // 1. Cobranzas — cartera vencida por cliente + facturas por vencer en 7 días
    const carteraPorCliente = new Map<
      string,
      { saldo: number; facturas: number; sucursalId: string | null; unidadNegocioId: string | null }
    >();
    cobranzasRows
      .filter((r) => r.fechaVencimiento < today)
      .forEach((r) => {
        const key = (r.cliente ?? "").trim();
        if (!key) return;
        const curr = carteraPorCliente.get(key) ?? {
          saldo: 0,
          facturas: 0,
          sucursalId: r.sucursalId,
          unidadNegocioId: r.unidadNegocioId,
        };
        curr.saldo += Number(r.saldo ?? 0);
        curr.facturas += 1;
        carteraPorCliente.set(key, curr);
      });

    carteraPorCliente.forEach((v, cliente) => {
      if (v.saldo < 50000) return;
      candidatas.push({
        claveNatural: `cobranzas:${v.sucursalId ?? "s"}:${cliente}`,
        tipo: "cobranzas",
        severidad: "alta",
        titulo: `${cliente} tiene facturas vencidas`,
        contexto: {
          detalle: `${v.facturas} facturas vencidas, debe ${v.saldo.toFixed(2)}`,
          monto: v.saldo,
          cliente,
          accion: "Llamar a cobrar",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: null,
      });
    });

    // Facturas por vencer, agrupadas por cliente (antes: una alerta por
    // factura — un cliente con 6 facturas por vencer generaba 6 alertas
    // casi idénticas).
    const porVencerPorCliente = new Map<
      string,
      {
        saldo: number;
        facturas: number;
        proximaFecha: string;
        sucursalId: string | null;
        unidadNegocioId: string | null;
      }
    >();
    cobranzasRows
      .filter((r) => r.fechaVencimiento >= today && r.fechaVencimiento <= next7)
      .forEach((r) => {
        const key = (r.cliente ?? "").trim();
        if (!key) return;
        const curr = porVencerPorCliente.get(key) ?? {
          saldo: 0,
          facturas: 0,
          proximaFecha: r.fechaVencimiento,
          sucursalId: r.sucursalId,
          unidadNegocioId: r.unidadNegocioId,
        };
        curr.saldo += Number(r.saldo ?? 0);
        curr.facturas += 1;
        if (r.fechaVencimiento < curr.proximaFecha) curr.proximaFecha = r.fechaVencimiento;
        porVencerPorCliente.set(key, curr);
      });

    porVencerPorCliente.forEach((v, cliente) => {
      candidatas.push({
        claveNatural: `cobranzas-prox:${v.sucursalId ?? "s"}:${cliente}`,
        tipo: "cobranzas",
        severidad: "media",
        titulo: `${cliente}: ${v.facturas} factura(s) por vencer`,
        contexto: {
          detalle: `Debe ${v.saldo.toFixed(2)}, la próxima vence el ${v.proximaFecha}`,
          monto: v.saldo,
          cliente,
          accion: "Recordar pago",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: null,
      });
    });

    const asesorAliases = new Map<string, string>();
    asesoresRows.forEach((r) => {
      const normName = normalizarNombre(r.asesor ?? "");
      const code = String(r.codigoAsesor ?? "").trim();
      if (normName && code) asesorAliases.set(normName, code);
    });

    // 2. Ventas perdidas por asesor
    const perdidasPorAsesor = new Map<
      string,
      {
        count: number;
        monto: number;
        sucursalId: string | null;
        unidadNegocioId: string | null;
        asesorId: string | null;
      }
    >();
    perdidasRows.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.asesor }, asesorAliases);
      if (resolved.codigo === VENTAS_CASA.codigo) return;
      const curr = perdidasPorAsesor.get(resolved.nombre) ?? {
        count: 0,
        monto: 0,
        sucursalId: r.sucursalId,
        unidadNegocioId: r.unidadNegocioId,
        asesorId: r.asesorId,
      };
      curr.count += 1;
      curr.monto += Number(r.monto ?? 0);
      perdidasPorAsesor.set(resolved.nombre, curr);
    });

    const facturasPorAsesor = new Map<string, number>();
    facturasRows.forEach((r) => {
      const resolved = resolverAsesor({ nombre: r.asesor }, asesorAliases);
      if (resolved.codigo === VENTAS_CASA.codigo) return;
      facturasPorAsesor.set(
        resolved.nombre,
        (facturasPorAsesor.get(resolved.nombre) ?? 0) + Number(r.monto ?? 0),
      );
    });

    perdidasPorAsesor.forEach((v, asesor) => {
      const facturado = facturasPorAsesor.get(asesor) ?? 0;
      const total = v.monto + facturado;
      const tasaPerdida = total > 0 ? (v.monto / total) * 100 : 0;
      if (tasaPerdida < 40) return;
      candidatas.push({
        claveNatural: `ventas_perdidas:${v.sucursalId ?? "s"}:${asesor}`,
        tipo: "ventas_perdidas",
        severidad: tasaPerdida >= 60 ? "alta" : "media",
        titulo: `${asesor} pierde muchas ventas`,
        contexto: {
          detalle: `Pierde ${tasaPerdida.toFixed(0)}% (${v.count} ventas perdidas, ${v.monto.toFixed(2)})`,
          monto: v.monto,
          accion: "Ayudar al asesor",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: v.asesorId,
      });
    });

    // 2b. Ventas perdidas por CLIENTE (no por asesor agregado) -- pedido del
    // usuario 2026-09-04: las alertas deben ser reales y cerrables con una
    // acción puntual ("llamar a este cliente"), no un promedio de tendencia
    // ("el asesor pierde muchas ventas" no dice a quién llamar). Reusa el
    // tipo "ventas_perdidas" del enum (clave distinta para no chocar con el
    // bloque agregado de arriba) -- agregar un tipo nuevo al enum de
    // Postgres necesitaría una migración, y esto es solo una granularidad
    // distinta de la misma categoría.
    const perdidasPorCliente = new Map<
      string,
      { monto: number; razon: string; sucursalId: string | null; unidadNegocioId: string | null; asesorId: string | null }
    >();
    perdidasRows.forEach((r) => {
      const cliente = (r.cliente ?? "").trim();
      if (!cliente) return;
      const key = `${r.asesorId ?? "s"}|${cliente}`;
      const curr = perdidasPorCliente.get(key) ?? {
        monto: 0,
        razon: r.razon ?? "",
        sucursalId: r.sucursalId,
        unidadNegocioId: r.unidadNegocioId,
        asesorId: r.asesorId,
      };
      curr.monto += Number(r.monto ?? 0);
      perdidasPorCliente.set(key, curr);
    });
    perdidasPorCliente.forEach((v, key) => {
      if (v.monto < 5000) return; // filtra ruido de montos irrelevantes
      const cliente = key.split("|")[1];
      candidatas.push({
        claveNatural: `venta_perdida_cliente:${v.sucursalId ?? "s"}:${key}`,
        tipo: "ventas_perdidas",
        severidad: v.monto >= 50000 ? "alta" : "media",
        titulo: `Venta perdida: ${cliente}`,
        contexto: {
          detalle: `${v.razon || "Venta perdida"}, $${v.monto.toFixed(2)}`,
          monto: v.monto,
          cliente,
          accion: "Contactar de nuevo y ofrecer alternativa",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: v.asesorId,
      });
    });

    // 3. Minutas — compromisos vencidos sin cerrar (destinatario no atendió)
    minutasRows.forEach((r) => {
      if (!r.fechaLimite || r.fechaLimite >= today) return;
      candidatas.push({
        claveNatural: `minutas:${r.id}`,
        tipo: "minutas",
        severidad: "media",
        titulo: `Minuta vencida: ${r.destinatarioNombre ?? "destinatario"}`,
        contexto: {
          detalle: `${(r.descripcion ?? "").slice(0, 80)}${r.cliente ? ` — Cliente: ${r.cliente}` : ""}`,
          cliente: r.cliente ?? null,
          accion: "Dar seguimiento",
        },
        sucursalId: r.sucursalId,
        unidadNegocioId: r.unidadNegocioId,
        asesorId: r.destinatarioId,
      });
    });

    // 4. Cumplimiento — asesores atrasados en su meta. Solo el mes en curso:
    // asesoresRows trae una fila por asesor POR MES transcurrido del año
    // (para armar el alias map de arriba), pero solo el mes actual refleja
    // si el asesor está atrasado *ahora* — usar todos los meses generaba una
    // alerta "atrasado" casi idéntica por cada mes ya cerrado del año.
    asesoresRows
      .filter((r) => r.mes === monthCap)
      .forEach((r) => {
        const resolved = resolverAsesor(
          { codigo: r.codigoAsesor, nombre: r.asesor },
          asesorAliases,
        );
        if (resolved.codigo === VENTAS_CASA.codigo) return;
        const cumplimiento = Number(r.pctCumplimiento ?? 0);
        const gap = expectedRunRate - cumplimiento;
        if (gap < 20) return;
        candidatas.push({
          claveNatural: `cumplimiento:${resolved.codigo}`,
          tipo: "cumplimiento",
          severidad: gap >= 35 ? "alta" : "media",
          titulo: `${resolved.nombre} va atrasado en su meta`,
          contexto: {
            detalle: `Lleva ${cumplimiento.toFixed(1)}% y debería llevar ${expectedRunRate.toFixed(1)}% a esta fecha`,
            monto: Number(r.venta ?? 0),
            accion: "Hablar con el asesor",
          },
          sucursalId: r.sucursalId,
          unidadNegocioId: r.unidadNegocioId,
          asesorId: r.asesorId,
        });
      });

    // 5. Dependencia — clientes que concentran mucho de la cartera vencida
    const totalCartera = Array.from(carteraPorCliente.values()).reduce(
      (sum, v) => sum + v.saldo,
      0,
    );
    carteraPorCliente.forEach((v, cliente) => {
      const concentracion = totalCartera > 0 ? (v.saldo / totalCartera) * 100 : 0;
      if (concentracion < 30) return;
      candidatas.push({
        claveNatural: `dependencia:${v.sucursalId ?? "s"}:${cliente}`,
        tipo: "dependencia",
        severidad: "alta",
        titulo: `Muy dependiente de ${cliente}`,
        contexto: {
          detalle: `${concentracion.toFixed(0)}% de toda la cartera vencida es de este cliente (${v.saldo.toFixed(2)})`,
          monto: v.saldo,
          cliente,
          accion: "Buscar más clientes",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: null,
      });
    });

    // 6 y 7: cotización→factura y cotizaciones viejas, agrupadas por unidad de
    // negocio (son métricas agregadas, no por cliente/asesor).
    const cotizacionesPorUnidad = new Map<string, typeof cotizacionesRows>();
    cotizacionesRows.forEach((c) => {
      const key = c.unidadNegocioId ?? "s";
      const list = cotizacionesPorUnidad.get(key) ?? [];
      list.push(c);
      cotizacionesPorUnidad.set(key, list);
    });
    const facturadoPorUnidad = new Map<string, number>();
    facturasRows.forEach((f) => {
      const key = f.unidadNegocioId ?? "s";
      facturadoPorUnidad.set(key, (facturadoPorUnidad.get(key) ?? 0) + Number(f.monto ?? 0));
    });

    cotizacionesPorUnidad.forEach((list, unidadKey) => {
      const unidadNegocioId = unidadKey === "s" ? null : unidadKey;
      const totalCotizado = list.reduce((sum, c) => sum + Number(c.monto ?? 0), 0);
      const totalFacturado = facturadoPorUnidad.get(unidadKey) ?? 0;
      const tasaConversion = totalCotizado > 0 ? (totalFacturado / totalCotizado) * 100 : 0;
      if (tasaConversion < 50 && totalCotizado > 0) {
        candidatas.push({
          claveNatural: `cotizacion_factura:${unidadKey}`,
          tipo: "cotizacion_factura",
          severidad: "media",
          titulo: "Poco de lo cotizado se factura",
          contexto: {
            detalle: `Solo ${tasaConversion.toFixed(1)}% se factura (cotizado ${totalCotizado.toFixed(2)}, facturado ${totalFacturado.toFixed(2)})`,
            monto: totalFacturado,
            accion: "Revisar cotizaciones",
          },
          sucursalId: null,
          unidadNegocioId,
          asesorId: null,
        });
      }

      const now = Date.now();
      const envejecidas = list.filter((c) => {
        if (c.etapa === "propuesta_negociacion" || c.etapa === "venta_perdida") return false;
        const ageDays = Math.floor((now - new Date(c.fecha).getTime()) / 86400000);
        return ageDays >= 30;
      });
      if (envejecidas.length > 0) {
        const montoTotal = envejecidas.reduce((sum, c) => sum + Number(c.monto ?? 0), 0);
        candidatas.push({
          claveNatural: `cotizaciones_viejas:${unidadKey}`,
          tipo: "cotizaciones_viejas",
          severidad: envejecidas.length >= 10 ? "alta" : "media",
          titulo: `${envejecidas.length} cotizaciones sin respuesta (+30 días)`,
          contexto: { detalle: `Monto total: ${montoTotal.toFixed(2)}`, monto: montoTotal },
          sucursalId: null,
          unidadNegocioId,
          asesorId: null,
        });
      }
    });

    // 8. Cotizaciones ABIERTAS sin facturar, por CLIENTE -- pedido del usuario
    // 2026-09-04: "cotizaciones_viejas" de arriba es un agregado por unidad
    // (no dice qué cliente, no es una acción concreta). Esta es la versión
    // real: cada cotización abierta (no perdida, no facturada aún) de un
    // cliente puntual, cerrable con un compromiso con fecha de cierre.
    // Umbral de 10 días (no 30) porque una cotización de 30+ días ya
    // difícilmente se cierra -- se busca la ventana donde todavía es
    // accionable, no el rezago histórico.
    const asesorIdPorCodigo = new Map<string, string>();
    asesoresRows.forEach((r) => {
      const code = String(r.codigoAsesor ?? "").trim();
      if (code && r.asesorId) asesorIdPorCodigo.set(code, r.asesorId);
    });
    const nowMs = Date.now();
    const cotizacionesAbiertasPorCliente = new Map<
      string,
      { monto: number; ageDays: number; sucursalId: string | null; unidadNegocioId: string | null; asesorId: string | null }
    >();
    cotizacionesRows.forEach((c) => {
      if (c.etapa === "venta_perdida") return;
      if (Number(c.montoFacturado ?? 0) > 0) return; // ya facturada, no es una alerta
      const ageDays = Math.floor((nowMs - new Date(c.fecha).getTime()) / 86400000);
      if (ageDays < 10) return; // muy reciente, dale tiempo antes de alertar
      const cliente = (c.cliente ?? "").trim();
      if (!cliente) return;
      const asesorId = c.asesorId ?? (c.asesorCodigo ? asesorIdPorCodigo.get(c.asesorCodigo.trim()) ?? null : null);
      const key = `${asesorId ?? "s"}|${cliente}`;
      const curr = cotizacionesAbiertasPorCliente.get(key) ?? {
        monto: 0,
        ageDays,
        sucursalId: c.sucursalId,
        unidadNegocioId: c.unidadNegocioId,
        asesorId,
      };
      curr.monto += Number(c.monto ?? 0);
      curr.ageDays = Math.max(curr.ageDays, ageDays);
      cotizacionesAbiertasPorCliente.set(key, curr);
    });
    cotizacionesAbiertasPorCliente.forEach((v, key) => {
      if (v.monto < 3000) return; // filtra ruido de cotizaciones menores
      const cliente = key.split("|")[1];
      candidatas.push({
        claveNatural: `cotizacion_abierta:${v.sucursalId ?? "s"}:${key}`,
        tipo: "cotizacion_factura",
        severidad: v.ageDays >= 30 ? "alta" : "media",
        titulo: `Cotización abierta: ${cliente}`,
        contexto: {
          detalle: `$${v.monto.toFixed(2)} cotizado hace ${v.ageDays} días, sin facturar`,
          monto: v.monto,
          cliente,
          accion: "Dar seguimiento y cerrar la cotización",
        },
        sucursalId: v.sucursalId,
        unidadNegocioId: v.unidadNegocioId,
        asesorId: v.asesorId,
      });
    });

    // Un asesor solo puede escribir (INSERT/UPDATE) alertas propias, y un
    // coordinador solo alertas con sucursal_id — la RLS de `alertas` exige
    // asesor_id = current_user_id() para asesor, y sucursal_id IN sus
    // sucursales para coordinador (can_read_row, ver 0009_profile_sucursales).
    // Los tipos agregados por unidad (cotizacion_factura, cotizaciones_viejas)
    // no tienen sucursal_id ni asesor_id: nunca pasarían ninguna de esas dos
    // policies. Si se intentaran igual, la policy los rechaza y aborta TODA
    // la transacción (rollback de las demás candidatas válidas). Se
    // descartan acá antes de tocar la base de datos.
    const candidatasEscribibles = candidatas.filter((c) => {
      if (role === "asesor") return c.asesorId === userId;
      if (role === "coordinador") return c.sucursalId !== null;
      return true;
    });

    // ── Sincronizar contra lo que ya existe (dentro del scope visible) ──────
    const existentes = await tx.select().from(alertas);
    const clavesVigentes = new Set(candidatasEscribibles.map((c) => c.claveNatural));

    // Dedup por clave_natural (puede repetirse dentro de una misma corrida —
    // ej. un asesor con filas de cumplimiento en más de una unidad de
    // negocio genera dos candidatas "cumplimiento:<codigo>"). Postgres
    // rechaza un ON CONFLICT DO UPDATE que intente tocar la misma fila dos
    // veces en un solo INSERT — se queda con la última candidata por clave.
    const candidatasUnicas = Array.from(
      new Map(candidatasEscribibles.map((c) => [c.claveNatural, c])).values(),
    );

    // Upsert en un solo statement (multi-row INSERT ... ON CONFLICT) en vez
    // de un UPDATE/INSERT secuencial por candidata — evita decenas de
    // round-trips por visita y, con el UNIQUE en clave_natural, resuelve
    // atómicamente la carrera entre visitas concurrentes.
    if (candidatasUnicas.length > 0) {
      await tx
        .insert(alertas)
        .values(
          candidatasUnicas.map((c) => ({
            claveNatural: c.claveNatural,
            tipo: c.tipo,
            severidad: c.severidad,
            titulo: c.titulo,
            contexto: JSON.stringify(c.contexto),
            sucursalId: c.sucursalId,
            unidadNegocioId: c.unidadNegocioId,
            asesorId: c.asesorId,
            estado: "abierta" as const,
          })),
        )
        .onConflictDoUpdate({
          target: alertas.claveNatural,
          set: {
            severidad: sql`excluded.severidad`,
            titulo: sql`excluded.titulo`,
            contexto: sql`excluded.contexto`,
            sucursalId: sql`excluded.sucursal_id`,
            unidadNegocioId: sql`excluded.unidad_negocio_id`,
            asesorId: sql`excluded.asesor_id`,
            estado: "abierta",
            updatedAt: new Date(),
          },
        });
    }

    const aCerrar = existentes.filter(
      (e) => e.estado === "abierta" && !clavesVigentes.has(e.claveNatural),
    );
    const clavesVigentesArr = Array.from(clavesVigentes);
    if (aCerrar.length > 0) {
      await tx
        .update(alertas)
        .set({ estado: "resuelta", updatedAt: new Date() })
        .where(
          clavesVigentesArr.length > 0
            ? and(
                eq(alertas.estado, "abierta"),
                notInArray(alertas.claveNatural, clavesVigentesArr),
              )
            : eq(alertas.estado, "abierta"),
        );
    }
  });
}

export async function getAlertasAction() {
  await reconcileAlertasAction();
  return withAuth(async ({ tx }) => {
    const rows = await tx.select().from(alertas).where(eq(alertas.estado, "abierta"));
    return rows
      .map((r) => ({
        ...r,
        contexto: r.contexto
          ? (JSON.parse(r.contexto) as {
              detalle: string;
              monto?: number;
              accion?: string;
              cliente?: string | null;
            })
          : null,
      }))
      .sort((a, b) => {
        const weight: Record<Severidad, number> = { alta: 3, media: 2, baja: 1 };
        return weight[b.severidad] - weight[a.severidad];
      });
  });
}
