import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

const router = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Session = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

function ids(value: unknown): string[] | null {
  if (value === undefined || value === "" || value === "all") return [];
  const list = (Array.isArray(value) ? value : String(value).split(",")).map(String);
  return list.every((id) => UUID_RE.test(id)) ? [...new Set(list)] : null;
}

function months(value: unknown, targetYear: number): number[] | null {
  if (value === undefined || value === "" || value === "all") {
    const currentYear = new Date().getUTCFullYear();
    const cap = targetYear < currentYear ? 12 : targetYear === currentYear ? new Date().getUTCMonth() + 1 : 0;
    return Array.from({ length: cap }, (_, i) => i + 1);
  }
  const list = (Array.isArray(value) ? value : String(value).split(",")).map(Number);
  return list.every((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    ? [...new Set(list)].sort((a, b) => a - b)
    : null;
}

function year(value: unknown) {
  const result = Number(value ?? new Date().getUTCFullYear());
  return Number.isInteger(result) && result >= 2000 && result <= 2200 ? result : null;
}

function scope(session: Session, requestedBranches: string[], requestedUnits: string[]) {
  const branches = session.profile.sucursalesIds.length
    ? session.profile.sucursalesIds
    : session.profile.sucursalId ? [session.profile.sucursalId] : [];
  const units = session.profile.unidadesNegocioIds.length
    ? session.profile.unidadesNegocioIds
    : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [];
  const branchScope = session.role === "coordinador" || session.role === "asesor" ? branches : null;
  const unitScope = session.role === "gerente_comercial" || session.role === "asesor" ? units : null;
  if (
    (branchScope && requestedBranches.some((id) => !branchScope.includes(id))) ||
    (unitScope && requestedUnits.some((id) => !unitScope.includes(id)))
  ) return null;
  return {
    branches: requestedBranches.length ? requestedBranches : branchScope,
    units: requestedUnits.length ? requestedUnits : unitScope,
    advisorId: session.role === "asesor" ? session.profile.id : null,
  };
}

function dateWhere(alias: string, includeAdvisor = true, advisorColumn = "asesor_id") {
  return [
    `${alias}.fecha >= $1::date`, `${alias}.fecha < $2::date`,
    `EXTRACT(month FROM ${alias}.fecha)::int = ANY($3::int[])`,
    `($4::uuid[] IS NULL OR ${alias}.sucursal_id = ANY($4::uuid[]))`,
    `($5::uuid[] IS NULL OR ${alias}.unidad_negocio_id = ANY($5::uuid[]))`,
    ...(includeAdvisor ? [`($6::uuid IS NULL OR ${alias}.${advisorColumn} = $6::uuid)`] : []),
  ].join(" AND ");
}

// budgetWhere() nunca referencia $1/$2 (rango de fechas) — presupuestos y
// cumplimiento_asesores se filtran por anio+mes, no por fecha. Numerar sus
// placeholders desde $1 de forma contigua (en vez de reutilizar la posición
// $7/$3/$4/$5/$6 pensada para compartir array con dateWhere) evita que
// Postgres falle con 42P18 ("could not determine data type of parameter")
// al no poder inferir el tipo de un placeholder que nunca aparece en el texto.
function budgetWhere(alias: string, includeAdvisor = true) {
  return [
    `${alias}.anio = $1::int`, `${alias}.mes = ANY($2::int[])`,
    `($3::uuid[] IS NULL OR ${alias}.sucursal_id = ANY($3::uuid[]))`,
    `($4::uuid[] IS NULL OR ${alias}.unidad_negocio_id = ANY($4::uuid[]))`,
    ...(includeAdvisor ? [`($5::uuid IS NULL OR ${alias}.asesor_id = $5::uuid)`] : []),
  ].join(" AND ");
}
function budgetParams(anio: number, selectedMonths: number[], selectedScope: NonNullable<ReturnType<typeof scope>>, includeAdvisor = true) {
  const base = [anio, selectedMonths, selectedScope.branches, selectedScope.units];
  return includeAdvisor ? [...base, selectedScope.advisorId] : base;
}

function params(anio: number, selectedMonths: number[], selectedScope: NonNullable<ReturnType<typeof scope>>) {
  return [`${anio}-01-01`, `${anio + 1}-01-01`, selectedMonths, selectedScope.branches, selectedScope.units, selectedScope.advisorId, anio];
}

// dateWhere() solo referencia hasta $5 (sin asesor) o $6 (con asesor) — nunca
// $7 (ese es exclusivo de budgetWhere). Postgres exige que el número de
// parámetros del bind coincida exactamente con el placeholder más alto
// referenciado en la query (error 08P01 si se envían de más), así que hay
// que truncar `p` en cada uso de dateWhere en vez de pasar el array completo.
function dateParams(p: unknown[], includeAdvisor = true) {
  return p.slice(0, includeAdvisor ? 6 : 5);
}

async function authorize(req: Request, res: Response) {
  const session = await currentSession(req);
  if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
  if (!session.role) { res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." }); return null; }
  const anio = year(req.query.anio);
  const selectedMonths = anio ? months(req.query.meses, anio) : null;
  const branches = ids(req.query.sucursalIds ?? req.query.sucursalId);
  const units = ids(req.query.unidadIds ?? req.query.unidadId);
  if (!anio || !selectedMonths || !branches || !units) {
    res.status(400).json({ message: "Los filtros enviados no son válidos." }); return null;
  }
  const selectedScope = scope(session, branches, units);
  if (!selectedScope) { res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." }); return null; }
  return { session, anio, selectedMonths, selectedScope };
}

router.get("/sucursal/metrics", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  try {
    const result = await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const p = params(auth.anio, auth.selectedMonths, auth.selectedScope);
      const [facturacion, perdidas, presupuestos] = await Promise.all([
        tx.query(`SELECT COALESCE(SUM(f.monto),0) AS "totalMonto", COUNT(f.id)::int AS cantidad FROM facturas f WHERE ${dateWhere("f", false)}`, dateParams(p, false)),
        tx.query(`SELECT COALESCE(SUM(v.monto),0) AS "totalMonto", COUNT(v.id)::int AS cantidad FROM ventas_perdidas v WHERE ${dateWhere("v", false)}`, dateParams(p, false)),
        tx.query(`SELECT COALESCE(SUM(p.monto),0) AS "totalMonto" FROM presupuestos p WHERE ${budgetWhere("p", false)}`, budgetParams(auth.anio, auth.selectedMonths, auth.selectedScope, false)),
      ]);
      return { facturacion: facturacion.rows[0], perdidas: perdidas.rows[0], presupuestos: presupuestos.rows[0] };
    });
    res.json(result);
  } catch (error) { req.log?.error?.({ error }, "sucursal metrics failed"); res.status(500).json({ message: "No se pudieron cargar las métricas de sucursal." }); }
});

router.get("/sucursal/trend", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const p = params(auth.anio, auth.selectedMonths, auth.selectedScope);
      const [facturas, presupuestos] = await Promise.all([
        tx.query(`SELECT EXTRACT(month FROM f.fecha)::int AS mes, COALESCE(SUM(f.monto),0) AS monto FROM facturas f WHERE ${dateWhere("f", false)} GROUP BY EXTRACT(month FROM f.fecha)`, dateParams(p, false)),
        tx.query(`SELECT p.mes, COALESCE(SUM(p.monto),0) AS monto FROM presupuestos p WHERE ${budgetWhere("p", false)} GROUP BY p.mes`, budgetParams(auth.anio, auth.selectedMonths, auth.selectedScope, false)),
      ]);
      return { facturas: facturas.rows, presupuestos: presupuestos.rows };
    }));
  } catch (error) { req.log?.error?.({ error }, "sucursal trend failed"); res.status(500).json({ message: "No se pudo cargar la tendencia de sucursal." }); }
});

router.get("/coordinador/year", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  if (auth.session.role !== "coordinador") { res.status(403).json({ message: "Este panel es exclusivo para coordinadores." }); return; }
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
      const result = await tx.query(`SELECT p.mes, p.unidad_negocio_id AS "unidadNegocioId", COALESCE(SUM(p.monto),0) AS monto, COALESCE(SUM(p.ventas_ccv),0) AS "ventasCcv", COALESCE(SUM(p.ventas_xibi),0) AS "ventasXibi", COALESCE(SUM(p.ventas_estrategicas),0) AS "ventasEstrategicas" FROM presupuestos p WHERE ${budgetWhere("p", false)} GROUP BY p.mes, p.unidad_negocio_id`, budgetParams(auth.anio, allMonths, auth.selectedScope, false));
      return { presupuestos: result.rows };
    }));
  } catch (error) { req.log?.error?.({ error }, "coordinador year failed"); res.status(500).json({ message: "No se pudo cargar el panel de coordinador." }); }
});

router.get("/coordinador/cobranzas", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  if (auth.session.role !== "coordinador") { res.status(403).json({ message: "Este panel es exclusivo para coordinadores." }); return; }
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => (await tx.query(
      `SELECT c.cliente, COALESCE(SUM(c.monto),0) AS monto, COALESCE(SUM(c.saldo),0) AS saldo, c.unidad_negocio_id AS "unidadNegocioId" FROM cobranzas c WHERE c.saldo > 0 AND ($1::uuid[] IS NULL OR c.sucursal_id = ANY($1::uuid[])) AND ($2::uuid[] IS NULL OR c.unidad_negocio_id = ANY($2::uuid[])) GROUP BY c.cliente, c.unidad_negocio_id`,
      [auth.selectedScope.branches, auth.selectedScope.units],
    )).rows));
  } catch (error) { req.log?.error?.({ error }, "coordinador receivables failed"); res.status(500).json({ message: "No se pudieron cargar las cobranzas." }); }
});

router.get("/coordinador/scorecard", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  if (auth.session.role !== "coordinador") { res.status(403).json({ message: "Este panel es exclusivo para coordinadores." }); return; }
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const p = params(auth.anio, auth.selectedMonths, auth.selectedScope);
      const [cotizaciones, facturas, minutas, asesores] = await Promise.all([
        tx.query(`SELECT c.asesor_codigo AS "asesorCodigo", COALESCE(SUM(c.monto),0) AS monto, COUNT(c.id)::int AS cantidad FROM cotizaciones c WHERE ${dateWhere("c", false)} GROUP BY c.asesor_codigo`, dateParams(p, false)),
        tx.query(`SELECT f.asesor, COALESCE(SUM(f.monto),0) AS monto, COUNT(f.id)::int AS cantidad FROM facturas f WHERE ${dateWhere("f", false)} GROUP BY f.asesor`, dateParams(p, false)),
        tx.query(`SELECT pr.nombre_completo AS responsable, m.estado, COUNT(m.id)::int AS cantidad FROM minutas m LEFT JOIN profiles pr ON pr.id=m.destinatario_id WHERE ${dateWhere("m", false)} GROUP BY pr.nombre_completo, m.estado`, dateParams(p, false)),
        tx.query(`SELECT ca.codigo_asesor AS "codigoAsesor", ca.asesor, COALESCE(SUM(ca.venta),0) AS venta, COALESCE(MAX(ca.pct_cumplimiento),0) AS "pctCumplimiento", COALESCE(MAX(ca.pct_participacion),0) AS "pctParticipacion" FROM cumplimiento_asesores ca WHERE ${budgetWhere("ca", false)} GROUP BY ca.codigo_asesor, ca.asesor`, budgetParams(auth.anio, auth.selectedMonths, auth.selectedScope, false)),
      ]);
      return { cotizaciones: cotizaciones.rows, facturas: facturas.rows, minutas: minutas.rows, asesores: asesores.rows };
    }));
  } catch (error) { req.log?.error?.({ error }, "coordinador scorecard failed"); res.status(500).json({ message: "No se pudo cargar el scorecard." }); }
});

router.get("/asesor/metrics", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  if (auth.session.role !== "asesor") { res.status(403).json({ message: "Este panel es exclusivo para asesores." }); return; }
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const p = params(auth.anio, auth.selectedMonths, auth.selectedScope);
      const [facturacion, perdidas, cotizaciones, presupuestos, minutas] = await Promise.all([
        tx.query(`SELECT COALESCE(SUM(f.monto),0) AS "totalMonto", COUNT(f.id)::int AS cantidad FROM facturas f WHERE ${dateWhere("f")}`, dateParams(p, true)),
        tx.query(`SELECT COALESCE(SUM(v.monto),0) AS "totalMonto", COUNT(v.id)::int AS cantidad FROM ventas_perdidas v WHERE ${dateWhere("v")}`, dateParams(p, true)),
        tx.query(`SELECT COUNT(c.id)::int AS cantidad FROM cotizaciones c WHERE ${dateWhere("c")}`, dateParams(p, true)),
        tx.query(`SELECT ca.mes, COALESCE(SUM(ca.presupuesto),0) AS presupuesto, COALESCE(MAX(ca.pct_participacion),0) AS "pctParticipacion" FROM cumplimiento_asesores ca WHERE ${budgetWhere("ca")} GROUP BY ca.mes`, budgetParams(auth.anio, auth.selectedMonths, auth.selectedScope, true)),
        tx.query(`SELECT m.estado, m.fecha_limite AS "fechaLimite", COUNT(m.id)::int AS cantidad FROM minutas m WHERE ${dateWhere("m", true, "destinatario_id")} GROUP BY m.estado, m.fecha_limite`, dateParams(p, true)),
      ]);
      return { facturacion: facturacion.rows[0], perdidas: perdidas.rows[0], cotizaciones: cotizaciones.rows[0], presupuestos: presupuestos.rows, scoreAsesor: presupuestos.rows, minutas: minutas.rows };
    }));
  } catch (error) { req.log?.error?.({ error }, "asesor metrics failed"); res.status(500).json({ message: "No se pudieron cargar las métricas del asesor." }); }
});

router.get("/asesor/trend", async (req: Request, res: Response): Promise<void> => {
  const auth = await authorize(req, res); if (!auth) return;
  if (auth.session.role !== "asesor") { res.status(403).json({ message: "Este panel es exclusivo para asesores." }); return; }
  try {
    res.json(await withScopedTransaction(auth.session, async (tx: Queryable) => {
      const p = params(auth.anio, auth.selectedMonths, auth.selectedScope);
      const [facturas, presupuestos] = await Promise.all([
        tx.query(`SELECT EXTRACT(month FROM f.fecha)::int AS mes, COALESCE(SUM(f.monto),0) AS monto FROM facturas f WHERE ${dateWhere("f")} GROUP BY EXTRACT(month FROM f.fecha)`, dateParams(p, true)),
        tx.query(`SELECT ca.mes, COALESCE(SUM(ca.presupuesto),0) AS presupuesto FROM cumplimiento_asesores ca WHERE ${budgetWhere("ca")} GROUP BY ca.mes`, budgetParams(auth.anio, auth.selectedMonths, auth.selectedScope, true)),
      ]);
      return { facturas: facturas.rows, presupuestos: presupuestos.rows };
    }));
  } catch (error) { req.log?.error?.({ error }, "asesor trend failed"); res.status(500).json({ message: "No se pudo cargar la tendencia del asesor." }); }
});

export default router;