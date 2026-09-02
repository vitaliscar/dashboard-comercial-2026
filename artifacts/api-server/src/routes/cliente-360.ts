import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
function ids(value: unknown) { const values = typeof value === "string" ? value.split(",").filter(Boolean) : []; return values.every((id) => UUID_RE.test(id)) ? [...new Set(values)] : null; }
function allowed(session: SessionPayload, branches: string[], units: string[]) {
  const b = session.profile.sucursalesIds?.length ? session.profile.sucursalesIds : session.profile.sucursalId ? [session.profile.sucursalId] : [];
  const u = session.profile.unidadesNegocioIds?.length ? session.profile.unidadesNegocioIds : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [];
  return !((session.role === "coordinador" || session.role === "asesor") && branches.some((id) => !b.includes(id))) && !(session.role === "gerente_comercial" && units.some((id) => !u.includes(id)));
}
function scoped(session: SessionPayload, alias: string, start: number, branch: string | null, unitIds: string[], hasAdvisor = true) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (branch) { conditions.push(`${alias}.sucursal_id = $${start + values.length}::uuid`); values.push(branch); }
  if (unitIds.length) { conditions.push(`${alias}.unidad_negocio_id = ANY($${start + values.length}::uuid[])`); values.push(unitIds); }
  if (session.role === "asesor" && hasAdvisor) { conditions.push(`${alias}.asesor_id = $${start + values.length}::uuid`); values.push(session.user.id); }
  else if (session.role === "asesor") conditions.push("FALSE");
  else if (session.role === "coordinador") { conditions.push(`${alias}.sucursal_id = ANY($${start + values.length}::uuid[])`); values.push(session.profile.sucursalesIds?.length ? session.profile.sucursalesIds : [session.profile.sucursalId].filter(Boolean)); }
  else if (session.role === "gerente_comercial") { conditions.push(`${alias}.unidad_negocio_id = ANY($${start + values.length}::uuid[])`); values.push(session.profile.unidadesNegocioIds?.length ? session.profile.unidadesNegocioIds : [session.profile.unidadNegocioId].filter(Boolean)); }
  return { sql: conditions.length ? conditions.join(" AND ") : "TRUE", values };
}
router.get("/cliente-360", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req); if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; } if (!session.role) { res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." }); return; }
  const year = Number(req.query.anio), month = Number(req.query.mes ?? 0), source = req.query.fuente;
  const unitIds = ids(req.query.unidades), branchIds = ids(req.query.sucursales);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 0 || month > 12 || !["cotizado", "facturado", "perdido"].includes(String(source)) || !unitIds || !branchIds) { res.status(400).json({ message: "Los filtros de cliente 360 no son válidos." }); return; }
  if (!allowed(session, branchIds, unitIds) || branchIds.length > 1) { res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." }); return; }
  const branch = branchIds[0] ?? null, until = month === 0 || month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`, from = month === 0 ? `${year}-01-01` : `${year}-${String(month).padStart(2, "0")}-01`;
  const table = source === "cotizado" ? "cotizaciones" : source === "facturado" ? "facturas" : "ventas_perdidas";
  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      const p = scoped(session, "x", 3, branch, unitIds), f = scoped(session, "f", 1, branch, unitIds), v = scoped(session, "v", 1, branch, unitIds), c = scoped(session, "c", 1, branch, unitIds, false);
      const [pareto, invoices, lost, receivables] = await Promise.all([
        tx.query(`SELECT x.cliente, COALESCE(SUM(x.monto), 0) AS monto, x.sucursal_id AS "sucursalId" FROM ${table} x WHERE x.fecha >= $1::date AND x.fecha < $2::date AND ${p.sql} GROUP BY x.cliente, x.sucursal_id`, [from, until, ...p.values]),
        tx.query(`SELECT f.cliente, MAX(f.fecha) AS fecha, COALESCE(SUM(f.monto), 0) AS monto FROM facturas f WHERE ${f.sql} GROUP BY f.cliente`, f.values),
        tx.query(`SELECT v.cliente, COALESCE(SUM(v.monto), 0) AS monto FROM ventas_perdidas v WHERE v.fecha >= CURRENT_DATE - INTERVAL '90 days' AND ${v.sql} GROUP BY v.cliente`, v.values),
        tx.query(`SELECT c.cliente, COALESCE(SUM(c.saldo), 0) AS saldo, MIN(c.fecha_vencimiento) AS "fechaVencimiento" FROM cobranzas c WHERE c.saldo > 0 AND ${c.sql} GROUP BY c.cliente`, c.values),
      ]);
      return { pareto: pareto.rows, facturas: invoices.rows, ventasPerdidas: lost.rows, cobranzas: receivables.rows };
    });
    res.json(result);
  } catch (error) { req.log?.error?.({ error, detail: error instanceof Error ? error.message : String(error) }, "cliente 360 query failed"); res.status(500).json({ message: "No se pudo cargar cliente 360." }); }
});
export default router;