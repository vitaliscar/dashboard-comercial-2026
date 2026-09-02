import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
function list(value: unknown, max = 100) { const a = typeof value === "string" && value ? value.split(",") : []; return a.length <= max && a.every((x) => UUID_RE.test(x)) ? [...new Set(a)] : null; }
function months(value: unknown) { const a = typeof value === "string" && value ? value.split(",").map(Number) : []; return a.every((m) => Number.isInteger(m) && m >= 1 && m <= 12) ? [...new Set(a)] : null; }
function filter(session: SessionPayload, alias: string, start: number, branchIds: string[], unitIds: string[], hasAdvisor = true) {
  const b = session.profile.sucursalesIds?.length ? session.profile.sucursalesIds : [session.profile.sucursalId].filter(Boolean), u = session.profile.unidadesNegocioIds?.length ? session.profile.unidadesNegocioIds : [session.profile.unidadNegocioId].filter(Boolean);
  const sql = [`($${start}::uuid[] IS NULL OR ${alias}.sucursal_id = ANY($${start}::uuid[]))`, `($${start + 1}::uuid[] IS NULL OR ${alias}.unidad_negocio_id = ANY($${start + 1}::uuid[]))`];
  const values: unknown[] = [branchIds.length ? branchIds : null, unitIds.length ? unitIds : null];
  if (session.role === "asesor" && hasAdvisor) { sql.push(`${alias}.asesor_id = $${start + 2}::uuid`); values.push(session.user.id); }
  else if (session.role === "asesor") sql.push("FALSE");
  else if (session.role === "coordinador") { sql.push(`${alias}.sucursal_id = ANY($${start + 2}::uuid[])`); values.push(b); }
  else if (session.role === "gerente_comercial") { sql.push(`${alias}.unidad_negocio_id = ANY($${start + 2}::uuid[])`); values.push(u); }
  return { sql: sql.join(" AND "), values, b, u };
}
router.get("/embudo", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req); if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; } if (!session.role) { res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." }); return; }
  const year = Number(req.query.anio ?? new Date().getUTCFullYear()), unitIds = list(req.query.unidades), branchIds = list(req.query.sucursales), selectedMonths = months(req.query.meses);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !unitIds || !branchIds || !selectedMonths) { res.status(400).json({ message: "Los filtros del embudo no son válidos." }); return; }
  const f = filter(session, "c", 3, branchIds, unitIds);
  if (((session.role === "coordinador" || session.role === "asesor") && branchIds.some((id) => !f.b.includes(id))) || (session.role === "gerente_comercial" && unitIds.some((id) => !f.u.includes(id)))) { res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." }); return; }
  try {
    const data = await withScopedTransaction(session, async (tx: Queryable) => {
      const p = filter(session, "p", 2, branchIds, unitIds, false), c = filter(session, "c", 3, branchIds, unitIds), r = filter(session, "r", 1, branchIds, unitIds, false);
      const [quotes, budgets, totals] = await Promise.all([
        tx.query(`SELECT c.id, c.unidad_negocio_id AS "unidadNegocioId", c.monto, c.fecha, c.etapa FROM cotizaciones c WHERE c.fecha >= $1::date AND c.fecha < $2::date AND ${c.sql}`, [`${year}-01-01`, `${year + 1}-01-01`, ...c.values]),
        tx.query(`SELECT p.id, p.mes, p.unidad_negocio_id AS "unidadNegocioId", p.ventas_ccv AS "ventasCcv", p.ventas_xibi AS "ventasXibi", p.ventas_estrategicas AS "ventasEstrategicas" FROM presupuestos p WHERE p.anio = $1::int AND ${p.sql}`, [year, ...p.values]),
        tx.query(`SELECT COALESCE((SELECT SUM(c.monto) FROM cotizaciones c WHERE c.fecha >= $1::date AND c.fecha < $2::date AND (CARDINALITY($3::int[]) = 0 OR EXTRACT(month FROM c.fecha)::int = ANY($3::int[])) AND ${c.sql}), 0) AS cotizado,
          COALESCE((SELECT SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas) FROM presupuestos p WHERE p.anio = $4::int AND (CARDINALITY($3::int[]) = 0 OR p.mes = ANY($3::int[])) AND ${p.sql}), 0) AS facturado,
          COALESCE((SELECT SUM(r.saldo) FROM cobranzas r WHERE ${r.sql}), 0) AS saldo`, [`${year}-01-01`, `${year + 1}-01-01`, selectedMonths, year, ...c.values, ...p.values, ...r.values]),
      ]);
      const row = totals.rows[0] ?? {}; const facturado = Number(row.facturado ?? 0);
      return { cotizaciones: quotes.rows, presupuestos: budgets.rows, totales: { cotizado: Number(row.cotizado ?? 0), facturado, cobrado: facturado - Number(row.saldo ?? 0) } };
    });
    res.json(data);
  } catch (error) { req.log?.error?.({ error, detail: error instanceof Error ? error.message : String(error) }, "embudo query failed"); res.status(500).json({ message: "No se pudo cargar el embudo." }); }
});
export default router;