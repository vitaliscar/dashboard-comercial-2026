import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult> };
const COBRANZAS_PAGE_SIZE = 50;
const COBRANZAS_MAX_PAGE = 100_000;

function requestedIds(value: unknown): string[] | null | undefined {
  if (value === undefined) return null;
  const raw = Array.isArray(value) ? value : [value];
  const ids = raw.flatMap((item) => (typeof item === "string" ? item.split(",") : []));
  if (raw.some((item) => typeof item !== "string") || ids.some((id) => !UUID_RE.test(id))) {
    return undefined;
  }
  return [...new Set(ids)];
}

function scopeFor(
  session: SessionPayload,
  unidades: string[] | null,
  sucursales: string[] | null,
) {
  const sucursalScope =
    session.role === "coordinador" || session.role === "asesor"
      ? session.profile.sucursalesIds ?? (session.profile.sucursalId ? [session.profile.sucursalId] : [])
      : null;
  const unidadScope =
    session.role === "gerente_comercial" || session.role === "asesor"
      ? session.profile.unidadesNegocioIds ??
        (session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [])
      : null;

  if (
    (sucursales && sucursalScope && sucursales.some((id) => !sucursalScope.includes(id))) ||
    (unidades && unidadScope && unidades.some((id) => !unidadScope.includes(id)))
  ) {
    return null;
  }
  return { unidades, sucursales, unidadScope, sucursalScope };
}

async function loadCobranzas(
  tx: Queryable,
  scope: NonNullable<ReturnType<typeof scopeFor>>,
  search: string,
  page: number,
) {
  const result = await tx.query(
    `WITH scoped AS MATERIALIZED (
       SELECT c.id, c.cliente, c.factura_numero AS "facturaNumero",
              c.fecha_emision AS "fechaEmision", c.fecha_vencimiento AS "fechaVencimiento",
              c.monto, c.saldo, c.dias_vencidos AS "diasVencidos",
              c.sucursal_id AS "sucursalId", c.unidad_negocio_id AS "unidadNegocioId",
              c.created_at AS "createdAt", COALESCE(s.nombre, 'Sin Sucursal') AS sucursal,
              COALESCE(u.nombre, 'Sin Unidad') AS "unidadNegocio"
       FROM cobranzas c
       LEFT JOIN sucursales s ON c.sucursal_id = s.id
       LEFT JOIN unidades_negocio u ON c.unidad_negocio_id = u.id
       WHERE c.saldo > 0
         AND ($1::uuid[] IS NULL OR c.unidad_negocio_id = ANY($1::uuid[]))
         AND ($2::uuid[] IS NULL OR c.sucursal_id = ANY($2::uuid[]))
         AND ($3::uuid[] IS NULL OR c.unidad_negocio_id = ANY($3::uuid[]))
         AND ($4::uuid[] IS NULL OR c.sucursal_id = ANY($4::uuid[]))
     ), summary AS (
       SELECT COUNT(*)::int AS count,
         COALESCE(SUM(saldo) FILTER (WHERE CURRENT_DATE - "fechaVencimiento" <= 0), 0) AS vigente,
         COALESCE(SUM(saldo) FILTER (WHERE CURRENT_DATE - "fechaVencimiento" BETWEEN 1 AND 30), 0) AS "1-30 días",
         COALESCE(SUM(saldo) FILTER (WHERE CURRENT_DATE - "fechaVencimiento" BETWEEN 31 AND 60), 0) AS "31-60 días",
         COALESCE(SUM(saldo) FILTER (WHERE CURRENT_DATE - "fechaVencimiento" BETWEEN 61 AND 90), 0) AS "61-90 días",
         COALESCE(SUM(saldo) FILTER (WHERE CURRENT_DATE - "fechaVencimiento" > 90), 0) AS "+90 días"
       FROM scoped
     ), by_branch AS (
       SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'total', total) ORDER BY total DESC), '[]'::jsonb) AS items
       FROM (SELECT sucursal AS nombre, SUM(saldo) AS total FROM scoped GROUP BY sucursal) grouped
     ), by_unit AS (
       SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'total', total) ORDER BY total DESC), '[]'::jsonb) AS items
       FROM (SELECT "unidadNegocio" AS nombre, SUM(saldo) AS total FROM scoped GROUP BY "unidadNegocio") grouped
     ), matching AS (
       SELECT * FROM scoped
       WHERE $5::text = '' OR cliente ILIKE '%' || $5 || '%' OR "facturaNumero" ILIKE '%' || $5 || '%'
     ), page AS (
       SELECT * FROM matching ORDER BY "fechaVencimiento" ASC, id ASC
       LIMIT $6 OFFSET $7
     )
     SELECT jsonb_build_object(
       'items', COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY "fechaVencimiento", id) FROM page), '[]'::jsonb),
       'total', (SELECT COUNT(*)::int FROM matching),
       'summary', jsonb_build_object(
         'count', summary.count,
         'totals', jsonb_build_object(
           'Vigente', summary.vigente,
           '1-30 días', summary."1-30 días",
           '31-60 días', summary."31-60 días",
           '61-90 días', summary."61-90 días",
           '+90 días', summary."+90 días"
         ),
         'byBranch', by_branch.items,
         'byUnit', by_unit.items
       )
     ) AS data
     FROM summary CROSS JOIN by_branch CROSS JOIN by_unit`,
    [scope.unidades, scope.sucursales, scope.unidadScope, scope.sucursalScope, search, COBRANZAS_PAGE_SIZE, page * COBRANZAS_PAGE_SIZE],
  );
  return result.rows[0]?.data ?? { items: [], total: 0, summary: { count: 0, totals: {}, byBranch: [], byUnit: [] } };
}

async function loadComparison(tx: Queryable, scope: NonNullable<ReturnType<typeof scopeFor>>) {
  const params = [scope.unidades, scope.sucursales, scope.unidadScope, scope.sucursalScope];
  const result = await tx.query(
    `WITH latest AS (
       SELECT captured_at FROM cobranzas_snapshots ORDER BY captured_at DESC LIMIT 1
     ), actual AS (
       SELECT c.cliente, SUM(c.saldo)::numeric AS saldo
       FROM cobranzas c
       WHERE c.saldo > 0
         AND ($1::uuid[] IS NULL OR c.unidad_negocio_id = ANY($1::uuid[]))
         AND ($2::uuid[] IS NULL OR c.sucursal_id = ANY($2::uuid[]))
         AND ($3::uuid[] IS NULL OR c.unidad_negocio_id = ANY($3::uuid[]))
         AND ($4::uuid[] IS NULL OR c.sucursal_id = ANY($4::uuid[]))
       GROUP BY c.cliente
     ), anterior AS (
       SELECT cs.cliente, SUM(cs.saldo)::numeric AS saldo
       FROM cobranzas_snapshots cs CROSS JOIN latest l
       WHERE cs.captured_at = l.captured_at AND cs.saldo > 0
         AND ($1::uuid[] IS NULL OR cs.unidad_negocio_id = ANY($1::uuid[]))
         AND ($2::uuid[] IS NULL OR cs.sucursal_id = ANY($2::uuid[]))
         AND ($3::uuid[] IS NULL OR cs.unidad_negocio_id = ANY($3::uuid[]))
         AND ($4::uuid[] IS NULL OR cs.sucursal_id = ANY($4::uuid[]))
       GROUP BY cs.cliente
     ), variacion AS (
       SELECT COALESCE(a.cliente, p.cliente) AS cliente,
              COALESCE(a.saldo, 0)::numeric AS "saldoActual",
              COALESCE(p.saldo, 0)::numeric AS "saldoAnterior",
              (COALESCE(a.saldo, 0) - COALESCE(p.saldo, 0))::numeric AS delta
       FROM actual a FULL OUTER JOIN anterior p ON p.cliente = a.cliente
     )
     SELECT (SELECT captured_at FROM latest) AS "capturedAt",
            COALESCE((SELECT SUM(saldo) FROM actual), 0)::numeric AS "totalVencidoActual",
            COALESCE((SELECT SUM(saldo) FROM anterior), 0)::numeric AS "totalVencidoAnterior",
            CASE WHEN (SELECT captured_at FROM latest) IS NULL THEN 0
                 ELSE COALESCE((SELECT SUM(delta) FROM variacion), 0) END::numeric AS "deltaVencido",
            COALESCE((SELECT jsonb_agg(to_jsonb(top_client)) FROM (
              SELECT cliente, "saldoActual", "saldoAnterior", delta
              FROM variacion WHERE delta > 0 AND (SELECT captured_at FROM latest) IS NOT NULL
              ORDER BY delta DESC LIMIT 5
            ) top_client), '[]'::jsonb) AS "clientesEmpeoraron"`,
    params,
  );
  const row = result.rows[0] ?? {};
  const parseAmount = (value: unknown) => (typeof value === "number" ? value : Number(value) || 0);
  const clients = Array.isArray(row.clientesEmpeoraron) ? row.clientesEmpeoraron : [];
  return {
    tieneHistorico: Boolean(row.capturedAt),
    totalVencidoActual: parseAmount(row.totalVencidoActual),
    totalVencidoAnterior: parseAmount(row.totalVencidoAnterior),
    deltaVencido: parseAmount(row.deltaVencido),
    clientesEmpeoraron: clients.map((client) => {
      const item = client as Record<string, unknown>;
      return {
        cliente: String(item.cliente),
        saldoActual: parseAmount(item.saldoActual),
        saldoAnterior: parseAmount(item.saldoAnterior),
        delta: parseAmount(item.delta),
      };
    }),
  };
}

async function authorizedScope(req: Request, res: Response) {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ message: "Sesión no válida." });
    return null;
  }
  if (!session.role) {
    res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
    return null;
  }
  if (session.role === "asesor") {
    res.status(403).json({ message: "El módulo de cobranzas no está disponible para asesores." });
    return null;
  }
  const unidades = requestedIds(req.query.unidades);
  const sucursales = requestedIds(req.query.sucursales);
  if (unidades === undefined || sucursales === undefined) {
    res.status(400).json({ message: "Las unidades y sucursales deben ser UUIDs válidos." });
    return null;
  }
  const scope = scopeFor(session, unidades, sucursales);
  if (!scope) {
    res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." });
    return null;
  }
  return { session, scope };
}

router.get("/cobranzas", async (req: Request, res: Response) => {
  const authorized = await authorizedScope(req, res);
  if (!authorized) return;
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const requestedPage = typeof req.query.page === "string" ? Number(req.query.page) : 0;
  const page = Number.isInteger(requestedPage) ? Math.max(0, Math.min(requestedPage, COBRANZAS_MAX_PAGE)) : 0;
  try {
    res.json(await withScopedTransaction(authorized.session, (tx) => loadCobranzas(tx, authorized.scope, search, page)));
  } catch (error) {
    req.log?.error?.({ error }, "cobranzas query failed");
    res.status(500).json({ message: "No se pudieron cargar las cobranzas." });
  }
});

router.get("/cobranzas/comparison", async (req: Request, res: Response) => {
  const authorized = await authorizedScope(req, res);
  if (!authorized) return;
  try {
    res.json(await withScopedTransaction(authorized.session, (tx) => loadComparison(tx, authorized.scope)));
  } catch (error) {
    req.log?.error?.({ error }, "cobranzas comparison query failed");
    res.status(500).json({ message: "No se pudo cargar la comparación de cobranzas." });
  }
});

export default router;