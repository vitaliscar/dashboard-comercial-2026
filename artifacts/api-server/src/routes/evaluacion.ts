import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roster de 32 asesores activos confirmado por el usuario 2026-09-04 -- ver
 * la misma constante en ccv-main (Next.js) src/lib/actions/evaluacion.ts. */
const CODIGOS_ASESOR_ACTIVOS = new Set([
  "75610", "81238", "75595", "44711", "57995", "46128",
  "46125", "80068", "27931", "80868",
  "95520", "48179", "45499", "81459", "48162",
  "19415", "45497", "78297", "49935", "81592",
  "27124", "81300", "67094",
  "33236", "29177", "61812", "45511", "93031",
  "45501", "82001",
  "34771", "31344",
]);
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

// ── Reporte unificado (v2) ──────────────────────────────────────────────────
// Reemplaza los 3 endpoints fijos de arriba con un reporte filtrable por
// mes(es)/sucursal(es)/unidad(es), portado de ccv-main (Next.js)
// src/lib/actions/evaluacion.ts -- misma lógica, reescrita en SQL crudo sobre
// pg porque este app usa Express + pg en vez de Drizzle. El RLS de la
// transacción (withScopedTransaction) ya decide qué filas ve cada rol; los
// filtros de esta ruta son ad-hoc encima de eso, igual que en ccv-main.
type MarcaRow = { marca: string; monto: number };
type Hallazgo = { tipo: "good" | "bad" | "warn"; titulo: string; texto: string };

function parseIntList(value: unknown): number[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
}
function parseIdList(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").filter((v) => UUID_RE.test(v));
}
function agruparMarca(rows: { marca: string; monto: number }[]): MarcaRow[] {
  const acc = new Map<string, number>();
  rows.forEach((r) => acc.set(r.marca, (acc.get(r.marca) ?? 0) + number(r.monto)));
  return [...acc.entries()].map(([marca, monto]) => ({ marca, monto })).sort((a, b) => b.monto - a.monto);
}

router.get("/evaluacion/reporte", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; }
  const anio = year(req.query.anio);
  if (!anio) { res.status(400).json({ message: "El año enviado no es válido." }); return; }
  const meses = parseIntList(req.query.meses);
  const sucursalIds = parseIdList(req.query.sucursalIds);
  const unidadNegocioIds = parseIdList(req.query.unidadNegocioIds);

  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      if (session.role === "asesor" || !session.role) {
        return reporteAsesorPropio(tx, session, anio, meses);
      }

      const params: unknown[] = [anio];
      const cond = [`anio = $1`];
      if (meses.length) { params.push(meses); cond.push(`mes = ANY($${params.length}::int[])`); }
      if (sucursalIds.length) { params.push(sucursalIds); cond.push(`sucursal_id = ANY($${params.length}::uuid[])`); }
      if (unidadNegocioIds.length) { params.push(unidadNegocioIds); cond.push(`unidad_negocio_id = ANY($${params.length}::uuid[])`); }

      const rows = (await tx.query(
        `SELECT mes, sucursal_id, unidad_negocio_id, monto, ventas_ccv, ventas_xibi, ventas_estrategicas
         FROM presupuestos WHERE ${cond.join(" AND ")}`,
        params,
      )).rows;

      let totalVenta = 0, totalMeta = 0, totalCcv = 0, totalXibi = 0, totalEstrategicas = 0;
      const porSucursal = new Map<string, { meta: number; venta: number }>();
      const porSucursalMes = new Map<string, { meta: number; venta: number }>();
      for (const r of rows) {
        const ccv = number(r.ventas_ccv), xibi = number(r.ventas_xibi), est = number(r.ventas_estrategicas);
        const venta = ccv + xibi + est, meta = number(r.monto);
        totalVenta += venta; totalMeta += meta; totalCcv += ccv; totalXibi += xibi; totalEstrategicas += est;
        const sucursalId = r.sucursal_id as string | null;
        if (!sucursalId) continue;
        const s = porSucursal.get(sucursalId) ?? { meta: 0, venta: 0 };
        s.meta += meta; s.venta += venta; porSucursal.set(sucursalId, s);
        const clave = `${sucursalId}|${r.mes}`;
        const sm = porSucursalMes.get(clave) ?? { meta: 0, venta: 0 };
        sm.meta += meta; sm.venta += venta; porSucursalMes.set(clave, sm);
      }

      const sucursalIdsUsados = [...porSucursal.keys()];
      const nombreSucursal = new Map<string, string>();
      if (sucursalIdsUsados.length) {
        const names = await tx.query(`SELECT id, nombre FROM sucursales WHERE id = ANY($1::uuid[])`, [sucursalIdsUsados]);
        names.rows.forEach((row) => nombreSucursal.set(String(row.id), String(row.nombre)));
      }

      const ranking = [...porSucursal.entries()]
        .map(([id2, v]) => ({ id: id2, label: nombreSucursal.get(id2) ?? "Sucursal", meta: v.meta, facturado: v.venta, pct: v.meta > 0 ? (v.venta / v.meta) * 100 : 0 }))
        .sort((a, b) => b.pct - a.pct);

      const mesesUsados = meses.length ? meses : [...new Set(rows.map((r) => Number(r.mes)))].sort((a, b) => a - b);
      const heatmap = ranking.map((r) => ({
        sucursal: r.label,
        celdas: mesesUsados.map((m) => {
          const sm = porSucursalMes.get(`${r.id}|${m}`);
          return { mes: m, pct: sm && sm.meta > 0 ? (sm.venta / sm.meta) * 100 : null };
        }),
      }));

      const cumplimientoGeneral = totalMeta > 0 ? (totalVenta / totalMeta) * 100 : 0;
      const bajo70 = ranking.filter((r) => r.pct < 70);
      const mejor = ranking[0] ?? null;
      const peor = ranking.length > 1 ? ranking[ranking.length - 1] : null;
      const hallazgos: Hallazgo[] = [
        mejor ? { tipo: "good", titulo: "Mejor desempeño", texto: `${mejor.label} lidera con ${mejor.pct.toFixed(1)}% de cumplimiento.` } : null,
        bajo70.length > 0
          ? { tipo: "bad", titulo: "Sucursales bajo 70%", texto: `${bajo70.length} de ${ranking.length} sucursales están bajo el 70% de cumplimiento.` }
          : { tipo: "good", titulo: "Todas sobre 70%", texto: "Ninguna sucursal está por debajo del umbral crítico." },
        peor && peor.id !== mejor?.id ? { tipo: "warn", titulo: "Necesita atención", texto: `${peor.label} tiene el cumplimiento más bajo (${peor.pct.toFixed(1)}%).` } : null,
      ].filter((h): h is Hallazgo => h !== null);

      const unidadRows = await tx.query(`SELECT id, nombre FROM unidades_negocio`, []);
      const nombrePorUnidadId = new Map<string, string>(unidadRows.rows.map((u) => [String(u.id), String(u.nombre).toLowerCase()]));
      const unidadesSeleccionadas = unidadNegocioIds.length === 0
        ? new Set(unidadRows.rows.map((u) => String(u.nombre).toLowerCase()))
        : new Set(unidadNegocioIds.map((idx) => nombrePorUnidadId.get(idx)).filter((n): n is string => !!n));

      let detalleMarca: { repuestos: MarcaRow[]; lubfiltros: MarcaRow[]; equipos: MarcaRow[] } | null = null;
      if (unidadesSeleccionadas.has("repuestos") || unidadesSeleccionadas.has("lubricantes/filtros") || unidadesSeleccionadas.has("equipos")) {
        const mesCond = meses.length ? `WHERE mes = ANY($1::int[])` : "";
        const mesParams = meses.length ? [meses] : [];
        const [repuestosRows, lubfiltrosRows] = await Promise.all([
          unidadesSeleccionadas.has("repuestos")
            ? tx.query(`SELECT marca, monto_total AS monto FROM detalles_ventas_repuestos ${mesCond}`, mesParams)
            : Promise.resolve({ rows: [] }),
          unidadesSeleccionadas.has("lubricantes/filtros")
            ? tx.query(`SELECT marca, monto_total AS monto FROM detalles_ventas_lubfiltros ${mesCond}`, mesParams)
            : Promise.resolve({ rows: [] }),
        ]);
        let equiposRows: { rows: Record<string, unknown>[] } = { rows: [] };
        if (unidadesSeleccionadas.has("equipos")) {
          const eqParams: unknown[] = [anio];
          const eqCond = [`anio = $1`];
          if (meses.length) { eqParams.push(meses); eqCond.push(`mes = ANY($${eqParams.length}::int[])`); }
          if (sucursalIds.length) { eqParams.push(sucursalIds); eqCond.push(`sucursal_id = ANY($${eqParams.length}::uuid[])`); }
          equiposRows = await tx.query(`SELECT marca, monto FROM equipos_por_marca WHERE ${eqCond.join(" AND ")}`, eqParams);
        }
        detalleMarca = {
          repuestos: agruparMarca(repuestosRows.rows.map((r) => ({ marca: String(r.marca), monto: number(r.monto) }))),
          lubfiltros: agruparMarca(lubfiltrosRows.rows.map((r) => ({ marca: String(r.marca), monto: number(r.monto) }))),
          equipos: agruparMarca(equiposRows.rows.map((r) => ({ marca: String(r.marca), monto: number(r.monto) }))),
        };
      }

      return {
        tipo: "sucursal" as const, anio, meses: mesesUsados, cumplimientoGeneral, totalVenta, totalMeta,
        ranking, heatmap, hallazgos, detalleMarca,
        composicionCompania: { ccv: totalCcv, xibi: totalXibi, estrategicas: totalEstrategicas },
      };
    });
    res.json(result);
  } catch (error) {
    req.log?.error?.({ error }, "reporte evaluacion failed");
    res.status(500).json({ message: "No se pudo cargar el reporte de evaluación." });
  }
});

async function reporteAsesorPropio(tx: Queryable, session: Session, anio: number, meses: number[]) {
  const params: unknown[] = [anio, session.user.id];
  const cond = [`anio = $1`, `asesor_id = $2`];
  if (meses.length) { params.push(meses); cond.push(`mes = ANY($${params.length}::int[])`); }
  const rows = (await tx.query(`SELECT mes, venta, presupuesto FROM cumplimiento_asesores WHERE ${cond.join(" AND ")}`, params)).rows;

  let totalVenta = 0, totalMeta = 0;
  const porMes = new Map<number, { meta: number; venta: number }>();
  rows.forEach((r) => {
    const venta = number(r.venta), meta = number(r.presupuesto);
    totalVenta += venta; totalMeta += meta;
    const m = porMes.get(Number(r.mes)) ?? { meta: 0, venta: 0 };
    m.meta += meta; m.venta += venta; porMes.set(Number(r.mes), m);
  });

  const mesesUsados = meses.length ? meses : [...new Set(rows.map((r) => Number(r.mes)))].sort((a, b) => a - b);
  const puntos = mesesUsados.map((mes) => {
    const m = porMes.get(mes) ?? { meta: 0, venta: 0 };
    return { mes, venta: m.venta, presupuesto: m.meta };
  });

  const cumplimientoGeneral = totalMeta > 0 ? (totalVenta / totalMeta) * 100 : 0;
  const hallazgos: Hallazgo[] = [{
    tipo: cumplimientoGeneral >= 90 ? "good" : cumplimientoGeneral >= 70 ? "warn" : "bad",
    titulo: "Tu cumplimiento del período",
    texto: `${cumplimientoGeneral.toFixed(1)}% de la meta asignada en los meses seleccionados.`,
  }];

  return { tipo: "asesor" as const, anio, meses: mesesUsados, cumplimientoGeneral, totalVenta, totalMeta, puntos, hallazgos };
}

export type GestionAsesorFila = {
  codigoAsesor: string; asesor: string; cotizado: number; clientesCotizados: number; facturado: number;
  presupuesto: number; perdido: number; clientesPerdidos: number; tasaConversion: number; tasaPerdida: number;
  cumplimiento: number; scorePonderado: number;
};

/**
 * Análisis ponderado cotizado -> facturado -> perdido. Solo gerencia/
 * gerente_comercial/coordinador (nunca el propio asesor) -- mismo cálculo y
 * mismas fuentes que ccv-main (ver ese archivo para el razonamiento completo
 * de por qué se usa cumplimiento_asesores y no cotizaciones.monto_facturado).
 */
router.get("/evaluacion/gestion-asesores", async (req: Request, res: Response): Promise<void> => {
  const session = await sessionForNonAdvisor(req, res); if (!session) return;
  const anio = year(req.query.anio);
  if (!anio) { res.status(400).json({ message: "El año enviado no es válido." }); return; }
  const meses = parseIntList(req.query.meses);
  const unidadNegocioIds = parseIdList(req.query.unidadNegocioIds);

  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      const cotParams: unknown[] = [anio];
      const cotCond = [`EXTRACT(YEAR FROM fecha) = $1`];
      if (meses.length) { cotParams.push(meses); cotCond.push(`EXTRACT(MONTH FROM fecha) = ANY($${cotParams.length}::int[])`); }
      if (unidadNegocioIds.length) { cotParams.push(unidadNegocioIds); cotCond.push(`unidad_negocio_id = ANY($${cotParams.length}::uuid[])`); }
      const cotRows = (await tx.query(`SELECT asesor_codigo AS codigo, cliente, monto FROM cotizaciones WHERE ${cotCond.join(" AND ")}`, cotParams)).rows;

      const cotizadoPorCodigo = new Map<string, { monto: number; clientes: Set<string> }>();
      cotRows.forEach((r) => {
        if (!r.codigo) return;
        const codigo = String(r.codigo);
        const acc = cotizadoPorCodigo.get(codigo) ?? { monto: 0, clientes: new Set<string>() };
        acc.monto += number(r.monto); acc.clientes.add(String(r.cliente)); cotizadoPorCodigo.set(codigo, acc);
      });

      const vpParams: unknown[] = [anio];
      const vpCond = [`EXTRACT(YEAR FROM fecha) = $1`];
      if (meses.length) { vpParams.push(meses); vpCond.push(`EXTRACT(MONTH FROM fecha) = ANY($${vpParams.length}::int[])`); }
      if (unidadNegocioIds.length) { vpParams.push(unidadNegocioIds); vpCond.push(`unidad_negocio_id = ANY($${vpParams.length}::uuid[])`); }
      const vpRows = (await tx.query(`SELECT asesor, cliente, monto FROM ventas_perdidas WHERE ${vpCond.join(" AND ")}`, vpParams)).rows;

      const perdidoPorNombre = new Map<string, { monto: number; clientes: Set<string> }>();
      vpRows.forEach((r) => {
        const clave = String(r.asesor ?? "").trim().toLowerCase();
        if (!clave) return;
        const acc = perdidoPorNombre.get(clave) ?? { monto: 0, clientes: new Set<string>() };
        acc.monto += number(r.monto); acc.clientes.add(String(r.cliente)); perdidoPorNombre.set(clave, acc);
      });

      const caParams: unknown[] = [anio];
      const caCond = [`anio = $1`];
      if (meses.length) { caParams.push(meses); caCond.push(`mes = ANY($${caParams.length}::int[])`); }
      if (unidadNegocioIds.length) { caParams.push(unidadNegocioIds); caCond.push(`unidad_negocio_id = ANY($${caParams.length}::uuid[])`); }
      const caRows = (await tx.query(`SELECT codigo_asesor AS codigo, asesor, venta, presupuesto FROM cumplimiento_asesores WHERE ${caCond.join(" AND ")}`, caParams)).rows;

      const facturadoPorCodigo = new Map<string, { asesor: string; venta: number; presupuesto: number }>();
      caRows.forEach((r) => {
        const codigo = String(r.codigo);
        const acc = facturadoPorCodigo.get(codigo) ?? { asesor: String(r.asesor), venta: 0, presupuesto: 0 };
        acc.venta += number(r.venta); acc.presupuesto += number(r.presupuesto); facturadoPorCodigo.set(codigo, acc);
      });

      // Solo asesores del roster activo (cumplimiento_asesores) -- ver nota
      // equivalente en ccv-main sobre por qué no se usa el set de cotizados.
      const codigos = [...facturadoPorCodigo.keys()].filter((c) => CODIGOS_ASESOR_ACTIVOS.has(c));
      const filas: GestionAsesorFila[] = codigos.map((codigo) => {
        const cot = cotizadoPorCodigo.get(codigo) ?? { monto: 0, clientes: new Set<string>() };
        const fact = facturadoPorCodigo.get(codigo)!;
        const nombreClave = fact.asesor.trim().toLowerCase();
        const perdido = perdidoPorNombre.get(nombreClave) ?? { monto: 0, clientes: new Set<string>() };
        const tasaConversion = cot.monto > 0 ? (fact.venta / cot.monto) * 100 : 0;
        const tasaPerdida = cot.monto > 0 ? (perdido.monto / cot.monto) * 100 : 0;
        const cumplimiento = fact.presupuesto > 0 ? (fact.venta / fact.presupuesto) * 100 : 0;
        const scorePonderado = Math.min(cumplimiento, 100) * 0.4 + Math.min(tasaConversion, 100) * 0.35 + (100 - Math.min(tasaPerdida, 100)) * 0.25;
        return {
          codigoAsesor: codigo, asesor: fact.asesor, cotizado: cot.monto, clientesCotizados: cot.clientes.size,
          facturado: fact.venta, presupuesto: fact.presupuesto, perdido: perdido.monto, clientesPerdidos: perdido.clientes.size,
          tasaConversion, tasaPerdida, cumplimiento, scorePonderado,
        };
      });
      filas.sort((a, b) => b.scorePonderado - a.scorePonderado);
      return { anio, meses, filas };
    });
    res.json(result);
  } catch (error) {
    req.log?.error?.({ error }, "gestion asesores failed");
    res.status(500).json({ message: "No se pudo cargar la gestión de asesores." });
  }
});

/**
 * Análisis narrativo con IA (Gemini) -- port de ccv-main (Next.js). Misma
 * llamada REST directa (sin SDK), mismo prompt y mismo thinkingBudget bajo
 * (128, no 0 -- gemini-3.6-flash rechaza 0 con 400) para que no tarde
 * demasiado en aparecer (confirmado con el usuario 2026-09-04).
 */
router.get("/evaluacion/analisis-narrativo", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ message: "GEMINI_API_KEY no está configurada en el servidor." }); return; }

  const anio = year(req.query.anio);
  if (!anio) { res.status(400).json({ message: "El año enviado no es válido." }); return; }
  const cumplimientoGeneral = Number(req.query.cumplimientoGeneral ?? 0);
  const totalVenta = Number(req.query.totalVenta ?? 0);
  const totalMeta = Number(req.query.totalMeta ?? 0);
  const meses = parseIntList(req.query.meses);
  const hallazgos: string[] = typeof req.query.hallazgos === "string" ? JSON.parse(req.query.hallazgos) : [];
  const ranking: { label: string; meta: number; facturado: number; pct: number }[] =
    typeof req.query.ranking === "string" ? JSON.parse(req.query.ranking) : [];

  const MESES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const periodo = meses.length ? meses.map((m) => MESES_NOMBRE[m - 1]).join(", ") : "todo el año";

  const prompt = `Eres un analista comercial senior escribiendo el resumen ejecutivo de un reporte interno de cumplimiento de ventas para gerencia de una empresa venezolana de maquinaria/equipos (Consorcio Cogestión Venequip).

Datos del período (${periodo} ${anio}):
- Cumplimiento general: ${cumplimientoGeneral.toFixed(1)}%
- Facturado: $${totalVenta.toLocaleString("es-VE", { maximumFractionDigits: 0 })}
- Meta: $${totalMeta.toLocaleString("es-VE", { maximumFractionDigits: 0 })}
${ranking.length ? `- Ranking por sucursal (facturado vs meta):\n${ranking.map((r) => `  ${r.label}: ${r.pct.toFixed(1)}% ($${r.facturado.toLocaleString("es-VE", { maximumFractionDigits: 0 })} de $${r.meta.toLocaleString("es-VE", { maximumFractionDigits: 0 })})`).join("\n")}` : ""}
- Hallazgos automáticos: ${hallazgos.join(" ")}

Redacta un análisis narrativo de 3 a 5 párrafos cortos, en español, tono profesional directo (no genérico ni de plantilla). Interpreta los números -- no los repitas tal cual, explica qué significan para el negocio, qué riesgos u oportunidades sugieren, y qué debería priorizar gerencia. Varía el fraseo y el orden de ideas respecto a análisis anteriores que hayas podido generar para datos parecidos. No uses viñetas ni encabezados, solo prosa. No inventes cifras que no te di.`;

  try {
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, thinkingConfig: { thinkingBudget: 128 } },
        }),
      },
    );
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => "");
      res.status(502).json({ message: `Gemini API error ${respuesta.status}: ${cuerpo.slice(0, 300)}` });
      return;
    }
    const json = (await respuesta.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!texto.trim()) { res.status(502).json({ message: "Gemini no devolvió texto." }); return; }
    res.json({ texto: texto.trim() });
  } catch (error) {
    req.log?.error?.({ error }, "analisis narrativo failed");
    res.status(500).json({ message: "No se pudo generar el análisis narrativo." });
  }
});

export default router;