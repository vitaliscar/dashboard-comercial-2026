import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

function branches(session: SessionPayload) {
  return session.profile.sucursalesIds?.length ? session.profile.sucursalesIds : session.profile.sucursalId ? [session.profile.sucursalId] : [];
}
function units(session: SessionPayload) {
  return session.profile.unidadesNegocioIds?.length ? session.profile.unidadesNegocioIds : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [];
}
function scope(session: SessionPayload, alias: string, parameter = 1) {
  // A number of alert sources (cobranzas and minutas) have no asesor_id. Their
  // advisor-specific alerts are therefore not reconciled from a broad query.
  if (session.role === "asesor") return { sql: "FALSE", values: [] as unknown[] };
  if (session.role === "coordinador") return { sql: `${alias}.sucursal_id = ANY($${parameter}::uuid[])`, values: [branches(session)] };
  if (session.role === "gerente_comercial") return { sql: `${alias}.unidad_negocio_id = ANY($${parameter}::uuid[])`, values: [units(session)] };
  return { sql: "TRUE", values: [] as unknown[] };
}
function alertScope(session: SessionPayload, alias: string, parameter = 1) {
  if (session.role === "asesor") return { sql: `${alias}.asesor_id = $${parameter}::uuid`, values: [session.user.id] };
  return scope(session, alias, parameter);
}
async function authenticated(req: Request, res: Response) {
  const session = await currentSession(req);
  if (!session) res.status(401).json({ message: "Sesión no válida." });
  else if (!session.role) res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
  return session?.role ? session : null;
}

/** Reconciles only the rows visible to the current RLS-scoped transaction. */
async function reconcile(tx: Queryable, session: SessionPayload) {
  const s = scope(session, "source", 5);
  const currentAlerts = alertScope(session, "a", 5 + s.values.length);
  const year = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const candidates = await tx.query(
    `WITH candidates AS (
      SELECT 'cobranzas:' || COALESCE(source.sucursal_id::text, 'none') || ':' || source.cliente AS clave_natural,
             'cobranzas'::alerta_tipo AS tipo, 'alta'::alerta_severidad AS severidad,
             source.cliente || ' tiene facturas vencidas' AS titulo,
              json_build_object('detalle', COUNT(*)::text || ' facturas vencidas, debe ' || ROUND(SUM(source.saldo)::numeric, 2)::text,
               'monto', SUM(source.saldo), 'accion', 'Llamar a cobrar', 'cliente', source.cliente)::text AS contexto,
              MIN(source.sucursal_id::text)::uuid AS sucursal_id, MIN(source.unidad_negocio_id::text)::uuid AS unidad_negocio_id, NULL::uuid AS asesor_id
      FROM cobranzas source
      WHERE source.saldo > 0 AND source.fecha_vencimiento < $1::date AND ${s.sql}
      GROUP BY source.cliente, source.sucursal_id HAVING SUM(source.saldo) >= 50000
      UNION ALL
      SELECT 'cobranzas-prox:' || COALESCE(source.sucursal_id::text, 'none') || ':' || source.cliente, 'cobranzas'::alerta_tipo, 'media'::alerta_severidad,
             source.cliente || ': ' || COUNT(*)::text || ' factura(s) por vencer',
              json_build_object('detalle', 'Debe ' || ROUND(SUM(source.saldo)::numeric, 2)::text || ', la próxima vence el ' || MIN(source.fecha_vencimiento)::text,
               'monto', SUM(source.saldo), 'accion', 'Recordar pago', 'cliente', source.cliente)::text,
              MIN(source.sucursal_id::text)::uuid, MIN(source.unidad_negocio_id::text)::uuid, NULL::uuid
      FROM cobranzas source WHERE source.saldo > 0 AND source.fecha_vencimiento BETWEEN $1::date AND $2::date AND ${s.sql}
      GROUP BY source.cliente, source.sucursal_id
      UNION ALL
      SELECT 'minutas:' || source.id::text, 'minutas'::alerta_tipo, 'media'::alerta_severidad,
             'Minuta vencida: ' || COALESCE(p.nombre_completo, 'destinatario'),
             json_build_object('detalle', LEFT(source.descripcion, 80), 'accion', 'Dar seguimiento')::text,
             source.sucursal_id, source.unidad_negocio_id, source.destinatario_id
      FROM minutas source LEFT JOIN profiles p ON p.id = source.destinatario_id
      WHERE source.estado <> 'cumplido' AND source.fecha_limite < $1::date AND ${s.sql}
      UNION ALL
      SELECT 'cumplimiento:' || source.codigo_asesor, 'cumplimiento'::alerta_tipo,
             CASE WHEN ($4::numeric - source.pct_cumplimiento) >= 35 THEN 'alta'::alerta_severidad ELSE 'media'::alerta_severidad END,
             source.asesor || ' va atrasado en su meta',
              json_build_object('detalle', 'Lleva ' || ROUND(source.pct_cumplimiento::numeric, 1)::text || '% y debería llevar ' || ROUND($4::numeric, 1)::text || '% a esta fecha',
               'monto', source.venta, 'accion', 'Hablar con el asesor')::text,
             source.sucursal_id, source.unidad_negocio_id, source.asesor_id
      FROM cumplimiento_asesores source
      WHERE source.anio = $3::int AND source.mes = EXTRACT(month FROM CURRENT_DATE)::int
        AND ($4::numeric - source.pct_cumplimiento) >= 20 AND ${s.sql}
    ), upserted AS (
      INSERT INTO alertas (clave_natural, tipo, severidad, titulo, contexto, sucursal_id, unidad_negocio_id, asesor_id, estado)
      SELECT DISTINCT ON (clave_natural) clave_natural, tipo, severidad, titulo, contexto, sucursal_id, unidad_negocio_id, asesor_id, 'abierta'::alerta_estado
      FROM candidates ORDER BY clave_natural
      ON CONFLICT (clave_natural) DO UPDATE SET severidad = EXCLUDED.severidad, titulo = EXCLUDED.titulo, contexto = EXCLUDED.contexto,
        sucursal_id = EXCLUDED.sucursal_id, unidad_negocio_id = EXCLUDED.unidad_negocio_id, asesor_id = EXCLUDED.asesor_id,
        estado = 'abierta', updated_at = now()
      RETURNING clave_natural
    )
    UPDATE alertas a SET estado = 'resuelta', updated_at = now()
    WHERE a.estado = 'abierta' AND ${currentAlerts.sql}
      AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.clave_natural = a.clave_natural)`,
    [today, next7, year, (new Date().getUTCDate() / new Date(year, new Date().getUTCMonth() + 1, 0).getUTCDate()) * 100, ...s.values, ...currentAlerts.values],
  );
  return candidates;
}

/**
 * Alertas reales y cerrables por CLIENTE (ventas perdidas, cotizaciones
 * abiertas sin facturar) -- port de ccv-main (Next.js) 2026-09-04. Pedido
 * del usuario: las alertas no deben ser solo cobranza; deben ser accionables
 * con una fecha de cierre concreta, no promedios de tendencia. Aparte de
 * `reconcile()` (que arma un solo CTE SQL grande) para no arriesgar romper
 * las 4 categorías que ya funcionan -- mismo patrón de upsert, agregación en
 * JS en vez de SQL crudo con GROUP BY anidado.
 */
async function reconcileClientAlerts(tx: Queryable, session: SessionPayload) {
  const s = scope(session, "source", 1);
  if (session.role === "asesor") return; // ventas_perdidas/cotizaciones no tienen asesor_id confiable para RLS de asesor aquí
  const from60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const anioInicio = `${new Date().getUTCFullYear()}-01-01`;

  const perdidas = await tx.query(
    `SELECT cliente, asesor_id AS "asesorId", monto, razon, sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId"
     FROM ventas_perdidas source WHERE fecha >= $${s.values.length + 1}::date AND ${s.sql}`,
    [...s.values, from60],
  );
  const perdidasPorCliente = new Map<string, { monto: number; razon: string; sucursalId: string | null; unidadNegocioId: string | null; asesorId: string | null }>();
  for (const r of perdidas.rows) {
    const cliente = String(r.cliente ?? "").trim();
    if (!cliente) continue;
    const key = `${r.asesorId ?? "s"}|${cliente}`;
    const curr = perdidasPorCliente.get(key) ?? { monto: 0, razon: String(r.razon ?? ""), sucursalId: r.sucursalId as string | null, unidadNegocioId: r.unidadNegocioId as string | null, asesorId: r.asesorId as string | null };
    curr.monto += Number(r.monto ?? 0);
    perdidasPorCliente.set(key, curr);
  }

  const cotizaciones = await tx.query(
    `SELECT cliente, asesor_id AS "asesorId", asesor_codigo AS "asesorCodigo", monto, monto_facturado AS "montoFacturado",
      etapa, fecha, sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId"
     FROM cotizaciones source WHERE fecha >= $${s.values.length + 1}::date AND ${s.sql}`,
    [...s.values, anioInicio],
  );
  const codigoToAsesorId = new Map<string, string>();
  const roster = await tx.query(`SELECT codigo_asesor AS codigo, asesor_id AS "asesorId" FROM cumplimiento_asesores WHERE asesor_id IS NOT NULL`);
  for (const r of roster.rows) if (r.codigo && r.asesorId) codigoToAsesorId.set(String(r.codigo).trim(), String(r.asesorId));

  const nowMs = Date.now();
  const cotizacionesAbiertas = new Map<string, { monto: number; ageDays: number; sucursalId: string | null; unidadNegocioId: string | null; asesorId: string | null }>();
  for (const c of cotizaciones.rows) {
    if (c.etapa === "venta_perdida") continue;
    if (Number(c.montoFacturado ?? 0) > 0) continue;
    const ageDays = Math.floor((nowMs - new Date(String(c.fecha)).getTime()) / 86400000);
    if (ageDays < 10) continue;
    const cliente = String(c.cliente ?? "").trim();
    if (!cliente) continue;
    const asesorId = (c.asesorId as string | null) ?? (c.asesorCodigo ? codigoToAsesorId.get(String(c.asesorCodigo).trim()) ?? null : null);
    const key = `${asesorId ?? "s"}|${cliente}`;
    const curr = cotizacionesAbiertas.get(key) ?? { monto: 0, ageDays, sucursalId: c.sucursalId as string | null, unidadNegocioId: c.unidadNegocioId as string | null, asesorId };
    curr.monto += Number(c.monto ?? 0);
    curr.ageDays = Math.max(curr.ageDays, ageDays);
    cotizacionesAbiertas.set(key, curr);
  }

  const upserts: Array<{ clave: string; tipo: string; severidad: string; titulo: string; contexto: object; sucursalId: string | null; unidadNegocioId: string | null; asesorId: string | null }> = [];
  perdidasPorCliente.forEach((v, key) => {
    if (v.monto < 5000) return;
    const cliente = key.split("|")[1];
    upserts.push({
      clave: `venta_perdida_cliente:${v.sucursalId ?? "s"}:${key}`, tipo: "ventas_perdidas",
      severidad: v.monto >= 50000 ? "alta" : "media", titulo: `Venta perdida: ${cliente}`,
      contexto: { detalle: `${v.razon || "Venta perdida"}, $${v.monto.toFixed(2)}`, monto: v.monto, cliente, accion: "Contactar de nuevo y ofrecer alternativa" },
      sucursalId: v.sucursalId, unidadNegocioId: v.unidadNegocioId, asesorId: v.asesorId,
    });
  });
  cotizacionesAbiertas.forEach((v, key) => {
    if (v.monto < 3000) return;
    const cliente = key.split("|")[1];
    upserts.push({
      clave: `cotizacion_abierta:${v.sucursalId ?? "s"}:${key}`, tipo: "cotizacion_factura",
      severidad: v.ageDays >= 30 ? "alta" : "media", titulo: `Cotización abierta: ${cliente}`,
      contexto: { detalle: `$${v.monto.toFixed(2)} cotizado hace ${v.ageDays} días, sin facturar`, monto: v.monto, cliente, accion: "Dar seguimiento y cerrar la cotización" },
      sucursalId: v.sucursalId, unidadNegocioId: v.unidadNegocioId, asesorId: v.asesorId,
    });
  });

  for (const u of upserts) {
    await tx.query(
      `INSERT INTO alertas (clave_natural, tipo, severidad, titulo, contexto, sucursal_id, unidad_negocio_id, asesor_id, estado)
       VALUES ($1, $2::alerta_tipo, $3::alerta_severidad, $4, $5, $6::uuid, $7::uuid, $8::uuid, 'abierta'::alerta_estado)
       ON CONFLICT (clave_natural) DO UPDATE SET severidad = EXCLUDED.severidad, titulo = EXCLUDED.titulo, contexto = EXCLUDED.contexto,
         sucursal_id = EXCLUDED.sucursal_id, unidad_negocio_id = EXCLUDED.unidad_negocio_id, asesor_id = EXCLUDED.asesor_id,
         estado = 'abierta', updated_at = now()`,
      [u.clave, u.tipo, u.severidad, u.titulo, JSON.stringify(u.contexto), u.sucursalId, u.unidadNegocioId, u.asesorId],
    );
  }
  // Cierra las que ya no aplican (mismo prefijo de clave_natural, ya no está en upserts)
  const clavesVigentes = upserts.map((u) => u.clave);
  await tx.query(
    `UPDATE alertas SET estado = 'resuelta', updated_at = now()
     WHERE estado = 'abierta' AND (clave_natural LIKE 'venta_perdida_cliente:%' OR clave_natural LIKE 'cotizacion_abierta:%')
       AND NOT (clave_natural = ANY($1::text[]))`,
    [clavesVigentes],
  );
}

router.get("/alertas", async (req: Request, res: Response): Promise<void> => {
  const session = await authenticated(req, res); if (!session) return;
  try {
    const rows = await withScopedTransaction(session, async (tx) => {
      await reconcile(tx, session);
      await reconcileClientAlerts(tx, session);
      const visible = alertScope(session, "a");
      return (await tx.query(`SELECT a.id, a.tipo, a.severidad, a.titulo, a.contexto, a.sucursal_id AS "sucursalId",
        a.unidad_negocio_id AS "unidadNegocioId", a.asesor_id AS "asesorId", a.estado, a.created_at AS "createdAt"
        FROM alertas a WHERE a.estado = 'abierta' AND ${visible.sql}
        ORDER BY CASE a.severidad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, a.created_at DESC`, visible.values)).rows;
    });
    res.json(rows.map((row) => ({ ...row, contexto: typeof row.contexto === "string" ? JSON.parse(row.contexto) : row.contexto })));
  } catch (error) { req.log?.error?.({ error }, "alertas query failed"); res.status(500).json({ message: "No se pudieron reconciliar las alertas." }); }
});

router.post("/alertas/:id/resolver", async (req: Request, res: Response): Promise<void> => {
  const session = await authenticated(req, res); if (!session) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (typeof rawId !== "string" || !UUID_RE.test(rawId)) { res.status(400).json({ message: "La alerta no es válida." }); return; }
  if (session.role === "asesor") { res.status(403).json({ message: "Solo coordinador o un rol superior puede resolver alertas." }); return; }
  try {
    const row = await withScopedTransaction(session, async (tx) => {
      const visible = alertScope(session, "a", 2);
      const found = await tx.query(`SELECT id FROM alertas a WHERE a.id = $1::uuid AND ${visible.sql} LIMIT 1`, [rawId, ...visible.values]);
      if (!found.rows[0]) return null;
      return (await tx.query(`UPDATE alertas SET estado = 'resuelta', resuelta_manualmente = true, resuelta_por = $1::uuid,
        resuelta_en = now(), updated_at = now() WHERE id = $2::uuid RETURNING id, estado`, [session.user.id, rawId])).rows[0] ?? null;
    });
    if (!row) { res.status(403).json({ message: "La alerta está fuera de tu alcance." }); return; }
    res.json(row);
  } catch (error) { req.log?.error?.({ error }, "alerta resolution failed"); res.status(500).json({ message: "No se pudo resolver la alerta." }); }
});

export default router;