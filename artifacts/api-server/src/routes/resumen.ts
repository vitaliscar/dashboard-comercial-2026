import { Router, type Request, type Response } from "express";
import { currentSession, getPool } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult> };

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
  const months = values
    .map((month) => Number(month))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= Math.max(cap, 12));
  return [...new Set(months)].sort((a, b) => a - b);
}

function addScope(
  role: SessionPayload["role"],
  profile: SessionPayload["profile"],
  requestedBranch: string | null,
  requestedUnit: string | null,
) {
  const branchIds = profile.sucursalesIds ?? (profile.sucursalId ? [profile.sucursalId] : []);
  const unitIds = profile.unidadesNegocioIds ?? (profile.unidadNegocioId ? [profile.unidadNegocioId] : []);
  const branch = requestedBranch ?? (role === "coordinador" ? branchIds[0] ?? null : null);
  const branchScope = role === "coordinador" || role === "asesor" ? branchIds : null;
  const unitScope = role === "gerente_comercial" ? unitIds : null;

  if (requestedBranch && branchScope && !branchScope.includes(requestedBranch)) {
    return null;
  }
  if (requestedUnit && unitScope && !unitScope.includes(requestedUnit)) {
    return null;
  }

  return {
    branch,
    branchScope,
    unit: requestedUnit,
    unitScope,
    advisor: role === "asesor" ? profile.id : null,
  };
}

function whereFor(
  alias: string,
  scope: NonNullable<ReturnType<typeof addScope>>,
  dateColumn?: string,
  includeMonthFilter = true,
) {
  const predicates = dateColumn
    ? [
        `${alias}.${dateColumn} >= $1::date`,
        `${alias}.${dateColumn} < $2::date`,
        ...(includeMonthFilter
          ? [
              `(${alias}.${dateColumn} IS NOT NULL AND EXTRACT(month FROM ${alias}.${dateColumn})::int = ANY($3::int[]))`,
            ]
          : []),
      ]
    : [
        `${alias}.anio = EXTRACT(year FROM $1::date)::int`,
        ...(includeMonthFilter ? [`${alias}.mes = ANY($3::int[])`] : []),
      ];

  if (scope.branch) predicates.push(`${alias}.sucursal_id = $4::uuid`);
  else if (scope.branchScope) predicates.push(`${alias}.sucursal_id = ANY($7::uuid[])`);
  if (scope.unit) predicates.push(`${alias}.unidad_negocio_id = $5::uuid`);
  else if (scope.unitScope) predicates.push(`${alias}.unidad_negocio_id = ANY($8::uuid[])`);
  if (scope.advisor) predicates.push(`${alias}.asesor_id = $6::uuid`);
  return predicates.join(" AND ");
}

function queryParams(
  year: number,
  months: number[],
  scope: NonNullable<ReturnType<typeof addScope>>,
) {
  return [
    `${year}-01-01`,
    `${year + 1}-01-01`,
    months,
    scope.branch,
    scope.unit,
    scope.advisor,
    scope.branchScope,
    scope.unitScope,
  ];
}

async function getCatalogs(pool: Queryable, session: SessionPayload) {
  const branchIds =
    session.role === "coordinador" || session.role === "asesor"
      ? session.profile.sucursalesIds ?? []
      : null;
  const unitIds =
    session.role === "gerente_comercial" ? session.profile.unidadesNegocioIds ?? [] : null;
  const [branches, units] = await Promise.all([
    pool.query(
      `SELECT id, nombre, ciudad
       FROM sucursales
       WHERE activa = true AND visible_general = true
         AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
       ORDER BY nombre`,
      [branchIds],
    ),
    pool.query(
      `SELECT id, nombre, descripcion
       FROM unidades_negocio
       WHERE activa = true
         AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
       ORDER BY nombre`,
      [unitIds],
    ),
  ]);
  return { sucursales: branches.rows, unidades: units.rows };
}

router.get("/catalogos", async (req: Request, res: Response) => {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ message: "Sesión no válida." });
    return;
  }
  const pool = await getPool();
  if (!pool) {
    res.status(503).json({ message: "La base de datos no está configurada." });
    return;
  }
  try {
    res.json(await getCatalogs(pool, session));
  } catch {
    res.status(500).json({ message: "No se pudieron cargar los catálogos." });
  }
});

router.get("/resumen", async (req: Request, res: Response) => {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ message: "Sesión no válida." });
    return;
  }
  if (!session.role) {
    res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
    return;
  }

  const year = Number(req.query.anio ?? new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    res.status(400).json({ message: "El año no es válido." });
    return;
  }
  const months = parseMonths(req.query.meses, year);
  const requestedBranch = asUuid(req.query.sucursalId);
  const requestedUnit = asUuid(req.query.unidadNegocioId);
  const scope = addScope(session.role, session.profile, requestedBranch, requestedUnit);
  if (!scope) {
    res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." });
    return;
  }

  const pool = await getPool();
  if (!pool) {
    res.status(503).json({ message: "La base de datos no está configurada." });
    return;
  }
  const params = queryParams(year, months, scope);
  const cotWhere = whereFor("c", scope, "fecha");
  const facWhere = whereFor("f", scope, "fecha");
  const lostWhere = whereFor("v", scope, "fecha");
  const servicesWhere = whereFor("s", scope, "fecha");
  const budgetWhere = whereFor("p", scope);
  const advisorWhere = whereFor("ca", scope);
  const adjustmentWhere = whereFor("a", scope);
  const cotMonthlyWhere = whereFor("c", scope, "fecha", false);
  const lostMonthlyWhere = whereFor("v", scope, "fecha", false);
  const budgetMonthlyWhere = whereFor("p", scope, undefined, false);

  try {
    const [
      cotizaciones,
      cotizacionesMensual,
      ventasPerdidasMensual,
      cotizacionesClientes,
      facturas,
      facturasClientes,
      ventasPerdidas,
      ventasPerdidasClientes,
      ventasPerdidasRazones,
      servicios,
      presupuestos,
      presupuestosMensual,
      cumplimientoAsesor,
      ajustesManuales,
    ] = await Promise.all([
      pool.query(
        `SELECT c.unidad_negocio_id AS "unidadNegocioId",
                COALESCE(SUM(c.monto), 0) AS "montoTotal",
                COUNT(c.id)::int AS cantidad
         FROM cotizaciones c WHERE ${cotWhere}
         GROUP BY c.unidad_negocio_id`,
        params,
      ),
      pool.query(
        `SELECT c.unidad_negocio_id AS "unidadNegocioId",
                EXTRACT(month FROM c.fecha)::int AS mes,
                COALESCE(SUM(c.monto), 0) AS "montoTotal"
         FROM cotizaciones c WHERE ${cotMonthlyWhere}
         GROUP BY c.unidad_negocio_id, EXTRACT(month FROM c.fecha)`,
        params,
      ),
      pool.query(
        `SELECT v.unidad_negocio_id AS "unidadNegocioId",
                EXTRACT(month FROM v.fecha)::int AS mes,
                COALESCE(SUM(v.monto), 0) AS "montoTotal"
         FROM ventas_perdidas v WHERE ${lostMonthlyWhere}
         GROUP BY v.unidad_negocio_id, EXTRACT(month FROM v.fecha)`,
        params,
      ),
      pool.query(
        `SELECT c.unidad_negocio_id AS "unidadNegocioId",
                c.sucursal_id AS "sucursalId",
                c.cliente,
                COALESCE(SUM(c.monto), 0) AS "montoTotal"
         FROM cotizaciones c WHERE ${cotWhere}
         GROUP BY c.unidad_negocio_id, c.sucursal_id, c.cliente`,
        params,
      ),
      pool.query(
        `SELECT f.unidad_negocio_id AS "unidadNegocioId",
                COALESCE(SUM(f.monto), 0) AS "montoTotal",
                COUNT(f.id)::int AS cantidad
         FROM facturas f WHERE ${facWhere}
         GROUP BY f.unidad_negocio_id`,
        params,
      ),
      pool.query(
        `SELECT f.unidad_negocio_id AS "unidadNegocioId",
                f.sucursal_id AS "sucursalId",
                f.cliente,
                COALESCE(SUM(f.monto), 0) AS "montoTotal"
         FROM facturas f WHERE ${facWhere}
         GROUP BY f.unidad_negocio_id, f.sucursal_id, f.cliente`,
        params,
      ),
      pool.query(
        `SELECT v.unidad_negocio_id AS "unidadNegocioId",
                COALESCE(SUM(v.monto), 0) AS "montoTotal",
                COUNT(v.id)::int AS cantidad
         FROM ventas_perdidas v WHERE ${lostWhere}
         GROUP BY v.unidad_negocio_id`,
        params,
      ),
      pool.query(
        `SELECT v.unidad_negocio_id AS "unidadNegocioId",
                v.sucursal_id AS "sucursalId",
                v.cliente,
                COALESCE(SUM(v.monto), 0) AS "montoTotal"
         FROM ventas_perdidas v WHERE ${lostWhere}
         GROUP BY v.unidad_negocio_id, v.sucursal_id, v.cliente`,
        params,
      ),
      pool.query(
        `SELECT v.unidad_negocio_id AS "unidadNegocioId",
                v.razon,
                COALESCE(SUM(v.monto), 0) AS "montoTotal",
                COUNT(v.id)::int AS cantidad
         FROM ventas_perdidas v WHERE ${lostWhere}
         GROUP BY v.unidad_negocio_id, v.razon`,
        params,
      ),
      pool.query(
        `SELECT s.unidad_negocio_id AS "unidadNegocioId",
                COALESCE(SUM(s.monto), 0) AS "montoTotal",
                COUNT(s.id)::int AS cantidad
         FROM servicios s WHERE ${servicesWhere}
         GROUP BY s.unidad_negocio_id`,
        params,
      ),
      pool.query(
        `SELECT p.id, p.anio, p.mes, p.sucursal_id AS "sucursalId",
                p.unidad_negocio_id AS "unidadNegocioId", p.monto,
                p.ventas_ccv AS "ventasCcv", p.ventas_xibi AS "ventasXibi",
                p.ventas_estrategicas AS "ventasEstrategicas"
         FROM presupuestos p WHERE ${budgetWhere}`,
        params,
      ),
      pool.query(
        `SELECT p.mes,
                p.unidad_negocio_id AS "unidadNegocioId",
                COALESCE(SUM(p.monto), 0) AS monto,
                COALESCE(SUM(p.ventas_ccv), 0) AS "ventasCcv",
                COALESCE(SUM(p.ventas_xibi), 0) AS "ventasXibi",
                COALESCE(SUM(p.ventas_estrategicas), 0) AS "ventasEstrategicas"
         FROM presupuestos p WHERE ${budgetMonthlyWhere}
         GROUP BY p.mes, p.unidad_negocio_id`,
        params,
      ),
      session.role === "asesor"
        ? pool.query(
            `SELECT ca.mes, ca.presupuesto, ca.venta,
                    ca.unidad_negocio_id AS "unidadNegocioId"
             FROM cumplimiento_asesores ca WHERE ${advisorWhere}`,
            params,
          )
        : Promise.resolve({ rows: [] }),
      session.role === "gerencia"
        ? pool.query(
            `SELECT a.id, a.anio, a.mes, a.sucursal_id AS "sucursalId",
                    a.unidad_negocio_id AS "unidadNegocioId", a.monto,
                    a.motivo, a.creado_por AS "creadoPor"
             FROM ajustes_manuales a WHERE ${adjustmentWhere}`,
            params,
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const adjustmentRows = ajustesManuales.rows.map((adjustment) => ({
      id: adjustment.id,
      anio: adjustment.anio,
      mes: adjustment.mes,
      sucursalId: adjustment.sucursalId,
      unidadNegocioId: adjustment.unidadNegocioId,
      monto: "0",
      ventasCcv: adjustment.monto,
      ventasXibi: "0",
      ventasEstrategicas: "0",
      ajusteManual: true,
      motivo: adjustment.motivo,
    }));

    res.json({
      cotizaciones: cotizaciones.rows,
      cotizacionesPrevMonth: [],
      cotizacionesMensual: cotizacionesMensual.rows,
      ventasPerdidasMensual: ventasPerdidasMensual.rows,
      cotizacionesClientes: cotizacionesClientes.rows,
      facturas: facturas.rows,
      facturasClientes: facturasClientes.rows,
      ventasPerdidas: ventasPerdidas.rows,
      ventasPerdidasPrevMonth: [],
      ventasPerdidasClientes: ventasPerdidasClientes.rows,
      ventasPerdidasRazones: ventasPerdidasRazones.rows,
      servicios: servicios.rows,
      presupuestos: [...presupuestos.rows, ...adjustmentRows],
      presupuestosMensual: presupuestosMensual.rows,
      cumplimientoAsesor: cumplimientoAsesor.rows,
    });
  } catch (error) {
    req.log?.error?.({ error }, "resumen query failed");
    res.status(500).json({ message: "No se pudo cargar el resumen comercial." });
  }
});

export default router;