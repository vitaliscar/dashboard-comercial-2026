import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Session = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
type Point = { mes: number; venta: number; presupuesto: number };

function year(value: unknown): number | null {
  const parsed = Number(value ?? new Date().getUTCFullYear());
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200 ? parsed : null;
}

function id(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function score(puntos: Point[], ticketPropio: number, ticketPromedioGrupo: number) {
  const venta = puntos.reduce((total, point) => total + point.venta, 0);
  const presupuesto = puntos.reduce((total, point) => total + point.presupuesto, 0);
  const cumplimiento = presupuesto > 0 ? Math.min(100, Math.max(0, (venta / presupuesto) * 100)) : 0;
  const datos = puntos.filter((point) => point.presupuesto > 0).sort((a, b) => a.mes - b.mes);
  const tendencia = datos.length < 2
    ? 50
    : Math.min(100, Math.max(0, 50 + (((datos.at(-1)!.venta / datos.at(-1)!.presupuesto) * 100 - (datos[0].venta / datos[0].presupuesto) * 100) / 20) * 50));
  const ticket = ticketPromedioGrupo <= 0 ? 50 : Math.min(100, Math.max(0, (ticketPropio / ticketPromedioGrupo) * 50));
  const total = Math.round(cumplimiento * 0.5 + tendencia * 0.3 + ticket * 0.2);
  return { score: total, cumplimiento, tendencia, ticket, banda: total >= 90 ? "success" : total >= 50 ? "warning" : "danger" };
}

function percentile(own: number, peers: number[]) {
  return peers.length === 0 ? 100 : Math.round((peers.filter((value) => value < own).length / peers.length) * 100);
}

function assignedBranches(session: Session) {
  return session.profile.sucursalesIds.length ? session.profile.sucursalesIds : session.profile.sucursalId ? [session.profile.sucursalId] : [];
}
function assignedUnits(session: Session) {
  return session.profile.unidadesNegocioIds.length ? session.profile.unidadesNegocioIds : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [];
}

/** Adds the explicit application scope in addition to the transaction RLS scope. */
function visible(alias: string, session: Session, values: unknown[]) {
  if (session.role === "coordinador") {
    values.push(assignedBranches(session));
    return `${alias}.sucursal_id = ANY($${values.length}::uuid[])`;
  }
  if (session.role === "gerente_comercial") {
    values.push(assignedUnits(session));
    return `${alias}.unidad_negocio_id = ANY($${values.length}::uuid[])`;
  }
  return "TRUE";
}

async function sessionForNonAdvisor(req: Request, res: Response) {
  const session = await currentSession(req);
  if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
  if (!session.role || session.role === "asesor") { res.status(403).json({ message: "Esta evaluación no está disponible para el rol asesor." }); return null; }
  return session;
}

router.get("/evaluacion/asesor", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  const anio = year(req.query.anio);
  if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; }
  if (session.role !== "asesor") { res.status(403).json({ message: "Esta evaluación es solo para el rol asesor." }); return; }
  if (!anio) { res.status(400).json({ message: "El año enviado no es válido." }); return; }
  const requestedAdvisor = req.query.asesorId;
  if (requestedAdvisor !== undefined && requestedAdvisor !== session.user.id) { res.status(403).json({ message: "Un asesor solo puede consultar su propia evaluación." }); return; }
  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      const own = await tx.query(`SELECT mes, COALESCE(SUM(venta),0) AS venta, COALESCE(SUM(presupuesto),0) AS presupuesto FROM cumplimiento_asesores WHERE anio=$1 AND asesor_id=$2 GROUP BY mes ORDER BY mes`, [anio, session.user.id]);
      const puntos = own.rows.map((row) => ({ mes: number(row.mes), venta: number(row.venta), presupuesto: number(row.presupuesto) }));
      const [ticket, peers, groupTicket, profile] = await Promise.all([
        tx.query(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS cantidad FROM facturas WHERE asesor_id=$1 AND EXTRACT(YEAR FROM fecha)=$2`, [session.user.id, anio]),
        session.profile.sucursalId ? tx.query(`SELECT asesor_id, COALESCE(SUM(venta),0) AS venta, COALESCE(SUM(presupuesto),0) AS presupuesto FROM cumplimiento_asesores WHERE anio=$1 AND sucursal_id=$2 AND asesor_id <> $3 GROUP BY asesor_id`, [anio, session.profile.sucursalId, session.user.id]) : Promise.resolve({ rows: [] }),
        session.profile.sucursalId ? tx.query(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS cantidad FROM facturas WHERE sucursal_id=$1 AND EXTRACT(YEAR FROM fecha)=$2`, [session.profile.sucursalId, anio]) : Promise.resolve({ rows: [] }),
        tx.query(`SELECT nombre_completo FROM profiles WHERE id=$1 LIMIT 1`, [session.user.id]),
      ]);
      const ownTicket = ticket.rows[0] && number(ticket.rows[0].cantidad) > 0 ? number(ticket.rows[0].total) / number(ticket.rows[0].cantidad) : 0;
      const avgTicket = groupTicket.rows[0] && number(groupTicket.rows[0].cantidad) > 0 ? number(groupTicket.rows[0].total) / number(groupTicket.rows[0].cantidad) : 0;
      const peerValues = peers.rows.filter((row) => number(row.presupuesto) > 0).map((row) => (number(row.venta) / number(row.presupuesto)) * 100);
      const resultScore = score(puntos, ownTicket, avgTicket);
      return { asesor: String(profile.rows[0]?.nombre_completo ?? "Asesor"), anio, puntos, ticketPropio: ownTicket, ticketPromedioGrupo: avgTicket, cantidadPares: peerValues.length, percentilVsPares: percentile(resultScore.cumplimiento, peerValues), score: resultScore };
    });
    res.json(result);
  } catch (error) { req.log?.error?.({ error }, "advisor evaluation failed"); res.status(500).json({ message: "No se pudo cargar la evaluación del asesor." }); }
});

router.get("/evaluacion/sucursal", async (req: Request, res: Response): Promise<void> => {
  const session = await sessionForNonAdvisor(req, res); if (!session) return;
  const anio = year(req.query.anio);
  const requested = id(req.query.sucursalId);
  if (!anio || (req.query.sucursalId !== undefined && !requested)) { res.status(400).json({ message: "Los filtros enviados no son válidos." }); return; }
  const sucursalId = session.role === "coordinador" ? requested ?? session.profile.sucursalId : requested;
  if (!sucursalId) { res.status(400).json({ message: "Debe especificar una sucursal." }); return; }
  if (session.role === "coordinador" && !assignedBranches(session).includes(sucursalId)) { res.status(403).json({ message: "La sucursal solicitada está fuera de tu alcance." }); return; }
  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      if (session.role === "coordinador" && !assignedBranches(session).includes(sucursalId)) {
        throw new Error("OUT_OF_SCOPE");
      }
      if (session.role === "gerente_comercial") {
        const allowed = await tx.query(`SELECT 1 FROM (SELECT unidad_negocio_id FROM presupuestos WHERE sucursal_id=$1 UNION SELECT unidad_negocio_id FROM facturas WHERE sucursal_id=$1) scope WHERE unidad_negocio_id = ANY($2::uuid[]) LIMIT 1`, [sucursalId, assignedUnits(session)]);
        if (!allowed.rows.length) throw new Error("OUT_OF_SCOPE");
      }
      const base = [anio, sucursalId];
      const budget = await tx.query(`SELECT mes, COALESCE(SUM(monto),0) AS presupuesto FROM presupuestos WHERE anio=$1 AND sucursal_id=$2 GROUP BY mes`, base);
      const sales = await tx.query(`SELECT EXTRACT(MONTH FROM fecha)::int AS mes, COALESCE(SUM(monto),0) AS venta FROM facturas WHERE EXTRACT(YEAR FROM fecha)=$1 AND sucursal_id=$2 GROUP BY EXTRACT(MONTH FROM fecha)`, base);
      const salesByMonth = new Map(sales.rows.map((row) => [number(row.mes), number(row.venta)]));
      const puntos = budget.rows.map((row) => ({ mes: number(row.mes), presupuesto: number(row.presupuesto), venta: salesByMonth.get(number(row.mes)) ?? 0 }));
      const peerParams: unknown[] = [anio, sucursalId];
      const peerScope = visible("p", session, peerParams);
      const salesParams: unknown[] = [anio, sucursalId];
      const salesScope = visible("f", session, salesParams);
      const [ticket, peerBudget, peerSales, groupTicket, branch] = await Promise.all([
        tx.query(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS cantidad FROM facturas WHERE sucursal_id=$1 AND EXTRACT(YEAR FROM fecha)=$2`, [sucursalId, anio]),
        tx.query(`SELECT sucursal_id, COALESCE(SUM(monto),0) AS presupuesto FROM presupuestos p WHERE p.anio=$1 AND p.sucursal_id <> $2 AND ${peerScope} GROUP BY sucursal_id`, peerParams),
        tx.query(`SELECT sucursal_id, COALESCE(SUM(monto),0) AS venta FROM facturas f WHERE EXTRACT(YEAR FROM f.fecha)=$1 AND f.sucursal_id <> $2 AND ${salesScope} GROUP BY sucursal_id`, salesParams),
        tx.query(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS cantidad FROM facturas f WHERE EXTRACT(YEAR FROM f.fecha)=$1 AND f.sucursal_id <> $2 AND ${salesScope}`, salesParams),
        tx.query(`SELECT nombre FROM sucursales WHERE id=$1 LIMIT 1`, [sucursalId]),
      ]);
      const peerSalesByBranch = new Map(peerSales.rows.map((row) => [String(row.sucursal_id), number(row.venta)]));
      const peerValues = peerBudget.rows.filter((row) => number(row.presupuesto) > 0).map((row) => ((peerSalesByBranch.get(String(row.sucursal_id)) ?? 0) / number(row.presupuesto)) * 100);
      const ownTicket = number(ticket.rows[0]?.cantidad) > 0 ? number(ticket.rows[0]?.total) / number(ticket.rows[0]?.cantidad) : 0;
      const avgTicket = number(groupTicket.rows[0]?.cantidad) > 0 ? number(groupTicket.rows[0]?.total) / number(groupTicket.rows[0]?.cantidad) : 0;
      const resultScore = score(puntos, ownTicket, avgTicket);
      return { sucursal: String(branch.rows[0]?.nombre ?? "Sucursal"), anio, puntos, ticketPropio: ownTicket, ticketPromedioGrupo: avgTicket, cantidadPares: peerValues.length, percentilVsPares: percentile(resultScore.cumplimiento, peerValues), score: resultScore };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "OUT_OF_SCOPE") { res.status(403).json({ message: "La sucursal solicitada está fuera de tu alcance." }); return; }
    req.log?.error?.({ error }, "branch evaluation failed"); res.status(500).json({ message: "No se pudo cargar la evaluación de sucursal." });
  }
});

router.get("/evaluacion/unidad", async (req: Request, res: Response): Promise<void> => {
  const session = await sessionForNonAdvisor(req, res); if (!session) return;
  const anio = year(req.query.anio); const unidadId = id(req.query.unidadId);
  if (!anio || !unidadId) { res.status(400).json({ message: "Los filtros enviados no son válidos." }); return; }
  if (session.role === "gerente_comercial" && !assignedUnits(session).includes(unidadId)) { res.status(403).json({ message: "La unidad solicitada está fuera de tu alcance." }); return; }
  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      if (session.role === "coordinador") {
        const allowed = await tx.query(`SELECT 1 FROM (SELECT unidad_negocio_id FROM presupuestos WHERE sucursal_id = ANY($1::uuid[]) UNION SELECT unidad_negocio_id FROM facturas WHERE sucursal_id = ANY($1::uuid[])) scope WHERE unidad_negocio_id=$2 LIMIT 1`, [assignedBranches(session), unidadId]);
        if (!allowed.rows.length) throw new Error("OUT_OF_SCOPE");
      }
      const budgetParams: unknown[] = [anio, unidadId]; const budgetScope = visible("p", session, budgetParams);
      const salesParams: unknown[] = [anio, unidadId]; const salesScope = visible("f", session, salesParams);
      const [budget, sales, branchBudget, branchSales, ticket, unit] = await Promise.all([
        tx.query(`SELECT mes, COALESCE(SUM(monto),0) AS presupuesto FROM presupuestos p WHERE p.anio=$1 AND p.unidad_negocio_id=$2 AND ${budgetScope} GROUP BY mes`, budgetParams),
        tx.query(`SELECT EXTRACT(MONTH FROM fecha)::int AS mes, COALESCE(SUM(monto),0) AS venta FROM facturas f WHERE EXTRACT(YEAR FROM f.fecha)=$1 AND f.unidad_negocio_id=$2 AND ${salesScope} GROUP BY EXTRACT(MONTH FROM fecha)`, salesParams),
        tx.query(`SELECT sucursal_id, COALESCE(SUM(monto),0) AS presupuesto FROM presupuestos p WHERE p.anio=$1 AND p.unidad_negocio_id=$2 AND ${budgetScope} GROUP BY sucursal_id`, budgetParams),
        tx.query(`SELECT sucursal_id, COALESCE(SUM(monto),0) AS venta FROM facturas f WHERE EXTRACT(YEAR FROM f.fecha)=$1 AND f.unidad_negocio_id=$2 AND ${salesScope} GROUP BY sucursal_id`, salesParams),
        tx.query(`SELECT COALESCE(SUM(monto),0) AS total, COUNT(*)::int AS cantidad FROM facturas f WHERE EXTRACT(YEAR FROM f.fecha)=$1 AND f.unidad_negocio_id=$2 AND ${salesScope}`, salesParams),
        tx.query(`SELECT nombre FROM unidades_negocio WHERE id=$1 LIMIT 1`, [unidadId]),
      ]);
      const salesByMonth = new Map(sales.rows.map((row) => [number(row.mes), number(row.venta)]));
      const puntos = budget.rows.map((row) => ({ mes: number(row.mes), presupuesto: number(row.presupuesto), venta: salesByMonth.get(number(row.mes)) ?? 0 }));
      const salesByBranch = new Map(branchSales.rows.map((row) => [String(row.sucursal_id), number(row.venta)]));
      const ids = branchBudget.rows.map((row) => String(row.sucursal_id)).filter((branchId) => UUID_RE.test(branchId));
      const names = ids.length ? await tx.query(`SELECT id, nombre FROM sucursales WHERE id = ANY($1::uuid[])`, [ids]) : { rows: [] };
      const nameMap = new Map(names.rows.map((row) => [String(row.id), String(row.nombre)]));
      const desglosePorSucursal = branchBudget.rows.filter((row) => row.sucursal_id && number(row.presupuesto) > 0).map((row) => {
        const presupuesto = number(row.presupuesto); const branchId = String(row.sucursal_id);
        const venta = salesByBranch.get(branchId) ?? 0;
        return { sucursal: nameMap.get(branchId) ?? "Sucursal", venta, presupuesto, cumplimiento: (venta / presupuesto) * 100 };
      }).sort((a, b) => b.cumplimiento - a.cumplimiento);
      const ownTicket = number(ticket.rows[0]?.cantidad) > 0 ? number(ticket.rows[0]?.total) / number(ticket.rows[0]?.cantidad) : 0;
      return { unidad: String(unit.rows[0]?.nombre ?? "Unidad de Negocio"), anio, puntos, ticketPropio: ownTicket, desglosePorSucursal, score: score(puntos, ownTicket, ownTicket) };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "OUT_OF_SCOPE") { res.status(403).json({ message: "La unidad solicitada está fuera de tu alcance." }); return; }
    req.log?.error?.({ error }, "unit evaluation failed"); res.status(500).json({ message: "No se pudo cargar la evaluación de unidad." });
  }
});

export default router;