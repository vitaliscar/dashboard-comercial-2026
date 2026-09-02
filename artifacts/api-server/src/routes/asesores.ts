import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query: (text: string, values?: unknown[]) => Promise<QueryResult> };

function asUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function parseIds(value: unknown) {
  if (value === undefined || value === "") return [] as string[];
  const values = Array.isArray(value) ? value : String(value).split(",");
  const ids = values.map(asUuid);
  return ids.every((id): id is string => id !== null) ? [...new Set(ids)] : null;
}

function parseMonths(value: unknown) {
  if (value === undefined || value === "" || value === "all") return Array.from({ length: 12 }, (_, i) => i + 1);
  const values = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(values.map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))]
    .sort((a, b) => a - b);
}

function scopeFor(session: SessionPayload, branches: string[], units: string[]) {
  const profileBranches = session.profile.sucursalesIds ?? (session.profile.sucursalId ? [session.profile.sucursalId] : []);
  const profileUnits = session.profile.unidadesNegocioIds ?? (session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : []);
  const branchScope = session.role === "coordinador" || session.role === "asesor" ? profileBranches : null;
  const unitScope = session.role === "gerente_comercial" || session.role === "asesor" ? profileUnits : null;

  if (branchScope && branches.some((branch) => !branchScope.includes(branch))) return null;
  if (unitScope && units.some((unit) => !unitScope.includes(unit))) return null;

  return {
    branches: branches.length ? branches : branchScope,
    units: units.length ? units : unitScope,
    advisorId: session.role === "asesor" ? session.profile.id : null,
  };
}

function whereFor(alias: string, dateColumn: string | null, includeAdvisor = true) {
  const predicates = dateColumn
    ? [
        `${alias}.${dateColumn} >= $1::date`,
        `${alias}.${dateColumn} < $2::date`,
        `EXTRACT(month FROM ${alias}.${dateColumn})::int = ANY($3::int[])`,
      ]
    : [`${alias}.anio = $4::int`, `${alias}.mes = ANY($3::int[])`];
  predicates.push(
    `($5::uuid[] IS NULL OR ${alias}.sucursal_id = ANY($5::uuid[]))`,
    `($6::uuid[] IS NULL OR ${alias}.unidad_negocio_id = ANY($6::uuid[]))`,
  );
  if (includeAdvisor) predicates.push(`($7::uuid IS NULL OR ${alias}.asesor_id = $7::uuid)`);
  return predicates.join(" AND ");
}

function params(year: number, months: number[], scope: NonNullable<ReturnType<typeof scopeFor>>) {
  return [`${year}-01-01`, `${year + 1}-01-01`, months, year, scope.branches, scope.units, scope.advisorId];
}

async function rawData(
  tx: Queryable,
  year: number,
  months: number[],
  scope: NonNullable<ReturnType<typeof scopeFor>>,
) {
  const queryParams = params(year, months, scope);
  const [cotizaciones, perdidas, cumplimiento, ventasCasa] = await Promise.all([
    tx.query(
      `SELECT c.asesor_codigo, c.cliente, COALESCE(SUM(c.monto), 0) AS monto,
              COUNT(c.id)::int AS cantidad, c.sucursal_id, c.unidad_negocio_id
       FROM cotizaciones c WHERE ${whereFor("c", "fecha")}
       GROUP BY c.asesor_codigo, c.cliente, c.sucursal_id, c.unidad_negocio_id`,
      queryParams,
    ),
    tx.query(
      `SELECT v.asesor, v.cliente, COALESCE(SUM(v.monto), 0) AS monto,
              COUNT(v.id)::int AS cantidad, v.sucursal_id, v.unidad_negocio_id
       FROM ventas_perdidas v WHERE ${whereFor("v", "fecha")}
       GROUP BY v.asesor, v.cliente, v.sucursal_id, v.unidad_negocio_id`,
      queryParams,
    ),
    tx.query(
      `SELECT ca.codigo_asesor, ca.asesor, COALESCE(SUM(ca.venta), 0) AS venta,
              COALESCE(SUM(ca.presupuesto), 0) AS presupuesto, ca.sucursal_id, ca.unidad_negocio_id
       FROM cumplimiento_asesores ca WHERE ${whereFor("ca", null)}
       GROUP BY ca.codigo_asesor, ca.asesor, ca.sucursal_id, ca.unidad_negocio_id`,
      queryParams,
    ),
    scope.advisorId
      ? Promise.resolve({ rows: [] })
      : tx.query(
          `SELECT COALESCE(SUM(vc.monto), 0) AS monto, vc.sucursal_id, vc.unidad_negocio_id
           FROM ventas_casa vc
           WHERE vc.mes = ANY($3::int[])
             AND ($5::uuid[] IS NULL OR vc.sucursal_id = ANY($5::uuid[]))
             AND ($6::uuid[] IS NULL OR vc.unidad_negocio_id = ANY($6::uuid[]))
           GROUP BY vc.sucursal_id, vc.unidad_negocio_id`,
          queryParams,
        ),
  ]);
  return { cotizaciones: cotizaciones.rows, perdidas: perdidas.rows, cumplimiento: cumplimiento.rows, ventasCasa: ventasCasa.rows };
}

async function drilldownData(tx: Queryable, year: number, scope: NonNullable<ReturnType<typeof scopeFor>>) {
  const queryParams = params(year, Array.from({ length: 12 }, (_, i) => i + 1), scope);
  const [aliases, metas, facturas, cotizaciones, perdidas] = await Promise.all([
    tx.query(
      `SELECT ca.codigo_asesor, ca.asesor FROM cumplimiento_asesores ca
       WHERE ca.codigo_asesor IS NOT NULL AND ca.asesor IS NOT NULL
         AND ($5::uuid[] IS NULL OR ca.sucursal_id = ANY($5::uuid[]))
         AND ($6::uuid[] IS NULL OR ca.unidad_negocio_id = ANY($6::uuid[]))
         AND ($7::uuid IS NULL OR ca.asesor_id = $7::uuid)
       GROUP BY ca.codigo_asesor, ca.asesor`,
      queryParams,
    ),
    tx.query(
      `SELECT ca.mes, COALESCE(SUM(ca.presupuesto), 0) AS presupuesto, ca.codigo_asesor,
              ca.asesor, ca.sucursal_id, ca.unidad_negocio_id
       FROM cumplimiento_asesores ca WHERE ${whereFor("ca", null)}
       GROUP BY ca.mes, ca.codigo_asesor, ca.asesor, ca.sucursal_id, ca.unidad_negocio_id`,
      queryParams,
    ),
    tx.query(
      `SELECT COALESCE(SUM(f.monto), 0) AS monto, f.fecha, f.asesor, f.cliente,
              f.sucursal_id, f.unidad_negocio_id
       FROM facturas f WHERE ${whereFor("f", "fecha")}
       GROUP BY f.fecha, f.asesor, f.cliente, f.sucursal_id, f.unidad_negocio_id`,
      queryParams,
    ),
    tx.query(
      `SELECT c.monto, c.fecha, c.cliente, c.descripcion, c.nro_cotizacion, c.etapa,
              c.asesor_codigo, c.sucursal_id, c.unidad_negocio_id
       FROM cotizaciones c WHERE ${whereFor("c", "fecha")}`,
      queryParams,
    ),
    tx.query(
      `SELECT v.monto, v.fecha, v.cliente, v.razon, v.asesor, v.sucursal_id, v.unidad_negocio_id
       FROM ventas_perdidas v WHERE ${whereFor("v", "fecha")}`,
      queryParams,
    ),
  ]);
  return { aliases: aliases.rows, metas: metas.rows, facturas: facturas.rows, cotizaciones: cotizaciones.rows, perdidas: perdidas.rows };
}

router.get("/asesores", async (req: Request, res: Response) => {
  const session = await currentSession(req);
  if (!session) return void res.status(401).json({ message: "Sesión no válida." });
  if (!session.role) return void res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });

  const year = Number(req.query.anio ?? new Date().getUTCFullYear());
  const branches = parseIds(req.query.sucursalIds ?? req.query.sucursalId);
  const units = parseIds(req.query.unidadIds ?? req.query.unidadId);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return void res.status(400).json({ message: "El año no es válido." });
  if (!branches || !units) return void res.status(400).json({ message: "La sucursal o unidad no es válida." });
  const scope = scopeFor(session, branches, units);
  if (!scope) return void res.status(403).json({ message: "La sucursal o unidad está fuera de tu alcance." });

  try {
    const result = req.query.drilldown === "true"
      ? await withScopedTransaction(session, (tx) => drilldownData(tx, year, scope))
      : await withScopedTransaction(session, (tx) => rawData(tx, year, parseMonths(req.query.meses), scope));
    res.json(result);
  } catch (error) {
    req.log?.error?.(error);
    res.status(500).json({ message: "No se pudieron cargar los datos de asesores." });
  }
});

export default router;