import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UNIT_NAMES = {
  repuestos: "Repuestos",
  lubfiltros: "Lubricantes/Filtros",
  servicios: "Servicios",
  equipos: "Equipos",
  alquiler: "Alquiler",
} as const;

type UnitKey = keyof typeof UNIT_NAMES;
type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult> };

function isUnitKey(value: string): value is UnitKey {
  return value in UNIT_NAMES;
}

function asUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function currentMonthCap(year: number) {
  const now = new Date();
  if (year < now.getUTCFullYear()) return 12;
  if (year > now.getUTCFullYear()) return 0;
  return now.getUTCMonth() + 1;
}

function parseMonths(value: unknown, year: number) {
  const cap = currentMonthCap(year);
  if (value === undefined || value === "all" || value === "") {
    return Array.from({ length: cap }, (_, index) => index + 1);
  }
  const values = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(
    values
      .map((month) => Number(month))
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= Math.max(cap, 12)),
  )].sort((a, b) => a - b);
}

function yearBounds(year: number) {
  return [`${year}-01-01`, `${year + 1}-01-01`];
}

function scopeFor(session: SessionPayload, requestedBranch: string | null, unitId: string) {
  const branchScope =
    session.role === "coordinador" || session.role === "asesor"
      ? session.profile.sucursalesIds ?? (session.profile.sucursalId ? [session.profile.sucursalId] : [])
      : null;
  const unitScope =
    session.role === "gerente_comercial" || session.role === "asesor"
      ? session.profile.unidadesNegocioIds ?? (session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [])
      : null;

  if (requestedBranch && branchScope && !branchScope.includes(requestedBranch)) return null;
  if (unitScope && !unitScope.includes(unitId)) return null;

  return {
    branch: requestedBranch ?? (branchScope?.length === 1 ? branchScope[0] : null),
    branchScope,
  };
}

function branchPredicates(alias: string, branchParam = 2, scopeParam = 3) {
  return [
    `($${branchParam}::uuid IS NULL OR ${alias}.sucursal_id = $${branchParam}::uuid)`,
    `($${scopeParam}::uuid[] IS NULL OR ${alias}.sucursal_id = ANY($${scopeParam}::uuid[]))`,
  ].join(" AND ");
}

async function loadUnitData(
  tx: Queryable,
  session: SessionPayload,
  key: UnitKey,
  year: number,
  months: number[],
  requestedBranch: string | null,
) {
  const unitResult = await tx.query(
    `SELECT id, nombre FROM unidades_negocio WHERE nombre = $1 AND activa = true LIMIT 1`,
    [UNIT_NAMES[key]],
  );
  const unit = unitResult.rows[0];
  const unitId = asUuid(unit?.id);
  if (!unitId) throw new Error(`unidad_negocio "${UNIT_NAMES[key]}" no existe en la BD`);

  const scope = scopeFor(session, requestedBranch, unitId);
  if (!scope) return { forbidden: true as const };

  const [from, to] = yearBounds(year);
  const ytdMonths = Array.from({ length: currentMonthCap(year) }, (_, index) => index + 1);
  const budgetParams = [year, months, unitId, scope.branch, scope.branchScope];
  const ytdBudgetParams = [year, ytdMonths, unitId, scope.branch, scope.branchScope];

  const [presupuestos, presupuestosYtd, cobranzas, cotizado] = await Promise.all([
    tx.query(
      `SELECT p.id,
              p.anio,
              p.mes,
              p.sucursal_id AS "sucursalId",
              p.monto,
              p.ventas_ccv AS "ventasCcv",
              p.ventas_xibi AS "ventasXibi",
              p.ventas_estrategicas AS "ventasEstrategicas"
       FROM presupuestos p
       WHERE p.anio = $1
         AND p.mes = ANY($2::int[])
         AND p.unidad_negocio_id = $3::uuid
         AND ${branchPredicates("p", 4, 5)}
       ORDER BY p.mes, p.sucursal_id`,
      budgetParams,
    ),
    tx.query(
      `SELECT p.id,
              p.anio,
              p.mes,
              p.sucursal_id AS "sucursalId",
              p.monto,
              p.ventas_ccv AS "ventasCcv",
              p.ventas_xibi AS "ventasXibi",
              p.ventas_estrategicas AS "ventasEstrategicas"
       FROM presupuestos p
       WHERE p.anio = $1
         AND p.mes = ANY($2::int[])
         AND p.unidad_negocio_id = $3::uuid
         AND ${branchPredicates("p", 4, 5)}
       ORDER BY p.mes, p.sucursal_id`,
      ytdBudgetParams,
    ),
    tx.query(
      `SELECT c.id,
              c.cliente,
              c.monto,
              c.saldo,
              c.fecha_emision AS "fechaEmision",
              c.fecha_vencimiento AS "fechaVencimiento",
              c.sucursal_id AS "sucursalId"
       FROM cobranzas c
       WHERE c.saldo > 0
         AND c.unidad_negocio_id = $1::uuid
         AND ($2::uuid IS NULL OR c.sucursal_id = $2::uuid)
         AND ($3::uuid[] IS NULL OR c.sucursal_id = ANY($3::uuid[]))
         ${key === "repuestos" ? `AND c.fecha_emision >= $4::date
         AND c.fecha_emision < $5::date
         AND EXTRACT(month FROM c.fecha_emision)::int = ANY($6::int[])` : ""}
       ORDER BY c.fecha_vencimiento`,
      key === "repuestos"
        ? [unitId, scope.branch, scope.branchScope, from, to, months]
        : [unitId, scope.branch, scope.branchScope],
    ),
    tx.query(
      `SELECT COALESCE(SUM(c.monto), 0) AS "montoTotal",
              COUNT(c.id)::int AS cantidad
       FROM cotizaciones c
       WHERE c.fecha >= $1::date
         AND c.fecha < $2::date
         AND EXTRACT(month FROM c.fecha)::int = ANY($3::int[])
         AND c.unidad_negocio_id = $4::uuid
         AND ${branchPredicates("c", 5, 6)}`,
      [from, to, months, unitId, scope.branch, scope.branchScope],
    ),
  ]);

  const response: Record<string, unknown> = {
    unit: { key, id: unitId, nombre: unit.nombre },
    presupuestos: presupuestos.rows,
    presupuestosYtd: presupuestosYtd.rows,
    cobranzas: cobranzas.rows,
    cotizado: cotizado.rows[0] ?? { montoTotal: 0, cantidad: 0 },
  };

  if (key === "repuestos") {
    response.detallesMarcas = (
      await tx.query(
        `SELECT marca,
                mes,
                ventas_ccv AS "ventasCcv",
                ventas_xibi AS "ventasXibi",
                monto_total AS "montoTotal"
         FROM detalles_ventas_repuestos
         WHERE mes = ANY($1::int[])
         ORDER BY mes, monto_total DESC`,
        [months],
      )
    ).rows;
  }

  if (key === "lubfiltros") {
    const [detalles, inventario] = await Promise.all([
      tx.query(
        `SELECT marca,
                mes,
                ventas_ccv AS "ventasCcv",
                ventas_xibi AS "ventasXibi",
                ventas_estrategicas AS "ventasEstrategicas",
                monto_total AS "montoTotal"
         FROM detalles_ventas_lubfiltros
         WHERE mes = ANY($1::int[])
         ORDER BY mes, monto_total DESC`,
        [months],
      ),
      tx.query(
        `SELECT tipo,
                proveedor_codigo AS "proveedorCodigo",
                sucursal,
                monto
         FROM inventario_lubfiltros
         ORDER BY monto DESC`,
      ),
    ]);
    response.detallesMarcas = detalles.rows;
    response.inventario = inventario.rows;
  }

  if (key === "servicios") {
    const [serviceRows, interno, estrategicos] = await Promise.all([
      tx.query(
        `SELECT s.fecha,
                s.cliente,
                s.monto,
                s.tipo_servicio AS "tipoServicio",
                s.categoria_venta AS "categoriaVenta",
                s.compania,
                s.taller,
                s.csa,
                s.sucursal_id AS "sucursalId"
         FROM servicios s
         WHERE s.fecha >= $1::date
           AND s.fecha < $2::date
           AND s.unidad_negocio_id = $3::uuid
           AND EXTRACT(month FROM s.fecha)::int = ANY($4::int[])
           AND ${branchPredicates("s", 5, 6)}
         ORDER BY s.fecha DESC`,
        [from, to, unitId, months, scope.branch, scope.branchScope],
      ),
      tx.query(
        `SELECT mes, monto FROM servicios_interno WHERE mes = ANY($1::int[]) ORDER BY mes`,
        [months],
      ),
      tx.query(
        `SELECT mes,
                tipo_servicio AS "tipoServicio",
                monto,
                sucursal_id AS "sucursalId"
         FROM detalles_servicios_estrategicos
         WHERE mes = ANY($1::int[])
           AND ($2::uuid IS NULL OR sucursal_id = $2::uuid)
           AND ($3::uuid[] IS NULL OR sucursal_id = ANY($3::uuid[]))
         ORDER BY mes, monto DESC`,
        [months, scope.branch, scope.branchScope],
      ),
    ]);
    response.servicios = serviceRows.rows;
    response.serviciosInterno = interno.rows;
    response.detallesEstrategicos = estrategicos.rows;
  }

  if (key === "equipos") {
    const [lost, brands, inventory] = await Promise.all([
      tx.query(
        `SELECT v.cliente,
                v.razon,
                v.fecha,
                COALESCE(SUM(v.monto), 0) AS monto
         FROM ventas_perdidas v
         WHERE v.fecha >= $1::date
           AND v.fecha < $2::date
           AND EXTRACT(month FROM v.fecha)::int = ANY($3::int[])
           AND v.unidad_negocio_id = $4::uuid
           AND ${branchPredicates("v", 5, 6)}
         GROUP BY v.cliente, v.razon, v.fecha
         ORDER BY monto DESC`,
        [from, to, months, unitId, scope.branch, scope.branchScope],
      ),
      tx.query(
        `SELECT marca, mes, monto
         FROM equipos_por_marca
         WHERE anio = $1
           AND mes = ANY($2::int[])
           AND unidad_negocio_id = $3::uuid
         ORDER BY monto DESC`,
        [year, months, unitId],
      ),
      tx.query(
        `SELECT marca,
                tipo_equipo AS "tipoEquipo",
                disponible,
                transito,
                stock_disponible AS "stockDisponible",
                stock_transito AS "stockTransito",
                sucursal_id AS "sucursalId"
         FROM equipos_inventario
         WHERE unidad_negocio_id = $1::uuid
           AND ($2::uuid IS NULL OR sucursal_id = $2::uuid)
           AND ($3::uuid[] IS NULL OR sucursal_id = ANY($3::uuid[]))
         ORDER BY disponible DESC`,
        [unitId, scope.branch, scope.branchScope],
      ),
    ]);
    response.ventasPerdidas = lost.rows;
    response.detallesMarcas = brands.rows;
    response.inventario = inventory.rows;
  }

  return response;
}

router.get("/unidades/:unitKey", async (req: Request, res: Response) => {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ message: "Sesión no válida." });
    return;
  }
  if (!session.role) {
    res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
    return;
  }

  const key = String(req.params.unitKey ?? "");
  if (!isUnitKey(key)) {
    res.status(404).json({ message: "Unidad de negocio no válida." });
    return;
  }

  const year = Number(req.query.anio ?? new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    res.status(400).json({ message: "El año no es válido." });
    return;
  }
  const months = parseMonths(req.query.meses, year);
  const requestedBranch = req.query.sucursalId ? asUuid(req.query.sucursalId) : null;
  if (req.query.sucursalId && !requestedBranch) {
    res.status(400).json({ message: "La sucursal no es válida." });
    return;
  }

  try {
    const result = await withScopedTransaction(session, (tx) =>
      loadUnitData(tx, session, key, year, months, requestedBranch),
    );
    if ("forbidden" in result) {
      res.status(403).json({ message: "La unidad o sucursal está fuera de tu alcance." });
      return;
    }
    res.json({ ...result, filters: { anio: year, meses: months, sucursalId: requestedBranch } });
  } catch (error) {
    req.log?.error?.(error);
    res.status(500).json({ message: "No se pudieron cargar los datos de la unidad." });
  }
});

export default router;