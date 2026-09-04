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

router.get("/alertas", async (req: Request, res: Response): Promise<void> => {
  const session = await authenticated(req, res); if (!session) return;
  try {
    const rows = await withScopedTransaction(session, async (tx) => {
      await reconcile(tx, session);
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