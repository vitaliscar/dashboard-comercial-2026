import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult> };
type CobranzaInput = {
  cliente: string;
  facturaNumero?: string | null;
  saldo: number | string;
  sucursalId?: string | null;
};

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

function compararSnapshots(actual: CobranzaInput[], anterior: CobranzaInput[] | null) {
  const parseVal = (value: number | string) => (typeof value === "number" ? value : parseFloat(value) || 0);
  const totalActual = actual.reduce((acc, row) => acc + parseVal(row.saldo), 0);

  if (anterior === null) {
    return {
      tieneHistorico: false,
      totalVencidoActual: totalActual,
      totalVencidoAnterior: 0,
      deltaVencido: 0,
      clientesEmpeoraron: [],
    };
  }

  const totalAnterior = anterior.reduce((acc, row) => acc + parseVal(row.saldo), 0);
  const actualPorCliente = new Map<string, number>();
  for (const row of actual) {
    actualPorCliente.set(row.cliente, (actualPorCliente.get(row.cliente) || 0) + parseVal(row.saldo));
  }
  const anteriorPorCliente = new Map<string, number>();
  for (const row of anterior) {
    anteriorPorCliente.set(row.cliente, (anteriorPorCliente.get(row.cliente) || 0) + parseVal(row.saldo));
  }

  const deltas = [...new Set([...actualPorCliente.keys(), ...anteriorPorCliente.keys()])]
    .map((cliente) => {
      const saldoActual = actualPorCliente.get(cliente) || 0;
      const saldoAnterior = anteriorPorCliente.get(cliente) || 0;
      return { cliente, saldoActual, saldoAnterior, delta: saldoActual - saldoAnterior };
    })
    .filter((row) => row.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  return {
    tieneHistorico: true,
    totalVencidoActual: totalActual,
    totalVencidoAnterior: totalAnterior,
    deltaVencido: totalActual - totalAnterior,
    clientesEmpeoraron: deltas,
  };
}

function comparisonInput(rows: Record<string, unknown>[]): CobranzaInput[] {
  return rows.map((row) => ({
    cliente: String(row.cliente),
    facturaNumero: typeof row.facturaNumero === "string" ? row.facturaNumero : null,
    saldo: typeof row.saldo === "number" || typeof row.saldo === "string" ? row.saldo : 0,
    sucursalId: typeof row.sucursalId === "string" ? row.sucursalId : null,
  }));
}

async function loadCobranzas(tx: Queryable, scope: NonNullable<ReturnType<typeof scopeFor>>) {
  return (
    await tx.query(
      `SELECT c.id, c.cliente, c.factura_numero AS "facturaNumero",
              c.fecha_emision AS "fechaEmision", c.fecha_vencimiento AS "fechaVencimiento",
              c.monto, c.saldo, c.dias_vencidos AS "diasVencidos",
              c.sucursal_id AS "sucursalId", c.unidad_negocio_id AS "unidadNegocioId",
              c.created_at AS "createdAt", s.nombre AS sucursal, u.nombre AS "unidadNegocio"
       FROM cobranzas c
       LEFT JOIN sucursales s ON c.sucursal_id = s.id
       LEFT JOIN unidades_negocio u ON c.unidad_negocio_id = u.id
       WHERE c.saldo > 0
         AND ($1::uuid[] IS NULL OR c.unidad_negocio_id = ANY($1::uuid[]))
         AND ($2::uuid[] IS NULL OR c.sucursal_id = ANY($2::uuid[]))
         AND ($3::uuid[] IS NULL OR c.unidad_negocio_id = ANY($3::uuid[]))
         AND ($4::uuid[] IS NULL OR c.sucursal_id = ANY($4::uuid[]))
       ORDER BY c.fecha_vencimiento ASC`,
      [scope.unidades, scope.sucursales, scope.unidadScope, scope.sucursalScope],
    )
  ).rows;
}

async function loadComparison(tx: Queryable, scope: NonNullable<ReturnType<typeof scopeFor>>) {
  const params = [scope.unidades, scope.sucursales, scope.unidadScope, scope.sucursalScope];
  const actual = await tx.query(
    `SELECT c.cliente, c.factura_numero AS "facturaNumero", c.saldo, c.sucursal_id AS "sucursalId"
     FROM cobranzas c
     WHERE ($1::uuid[] IS NULL OR c.unidad_negocio_id = ANY($1::uuid[]))
       AND ($2::uuid[] IS NULL OR c.sucursal_id = ANY($2::uuid[]))
       AND ($3::uuid[] IS NULL OR c.unidad_negocio_id = ANY($3::uuid[]))
       AND ($4::uuid[] IS NULL OR c.sucursal_id = ANY($4::uuid[]))`,
    params,
  );
  const latest = await tx.query(
    `SELECT captured_at AS "capturedAt" FROM cobranzas_snapshots ORDER BY captured_at DESC LIMIT 1`,
  );
  if (!latest.rows[0]) return compararSnapshots(comparisonInput(actual.rows), null);

  const anterior = await tx.query(
    `SELECT cs.cliente, cs.factura_numero AS "facturaNumero", cs.saldo, cs.sucursal_id AS "sucursalId"
     FROM cobranzas_snapshots cs
     WHERE cs.captured_at = $1
       AND ($2::uuid[] IS NULL OR cs.unidad_negocio_id = ANY($2::uuid[]))
       AND ($3::uuid[] IS NULL OR cs.sucursal_id = ANY($3::uuid[]))
       AND ($4::uuid[] IS NULL OR cs.unidad_negocio_id = ANY($4::uuid[]))
       AND ($5::uuid[] IS NULL OR cs.sucursal_id = ANY($5::uuid[]))`,
    [latest.rows[0].capturedAt, ...params],
  );
  return compararSnapshots(comparisonInput(actual.rows), comparisonInput(anterior.rows));
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
  try {
    res.json(await withScopedTransaction(authorized.session, (tx) => loadCobranzas(tx, authorized.scope)));
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