import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

function ids(value: unknown) {
  const values = typeof value === "string" ? value.split(",").filter(Boolean) : [];
  return values.every((id) => UUID_RE.test(id)) ? [...new Set(values)] : null;
}

function allowed(session: SessionPayload, branches: string[], units: string[]) {
  const b = session.profile.sucursalesIds?.length
    ? session.profile.sucursalesIds
    : session.profile.sucursalId
      ? [session.profile.sucursalId]
      : [];
  const u = session.profile.unidadesNegocioIds?.length
    ? session.profile.unidadesNegocioIds
    : session.profile.unidadNegocioId
      ? [session.profile.unidadNegocioId]
      : [];
  return (
    !((session.role === "coordinador" || session.role === "asesor") && branches.some((id) => !b.includes(id))) &&
    !((session.role === "gerente_comercial" || session.role === "asesor") && u.length > 0 && units.some((id) => !u.includes(id)))
  );
}

function scoped(
  session: SessionPayload,
  alias: string,
  start: number,
  branchIds: string[],
  unitIds: string[],
  hasAdvisor = true,
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (branchIds.length) {
    conditions.push(`${alias}.sucursal_id = ANY($${start + values.length}::uuid[])`);
    values.push(branchIds);
  }
  if (unitIds.length) {
    conditions.push(`${alias}.unidad_negocio_id = ANY($${start + values.length}::uuid[])`);
    values.push(unitIds);
  }
  if (session.role === "asesor" && hasAdvisor) {
    conditions.push(`${alias}.asesor_id = $${start + values.length}::uuid`);
    values.push(session.user.id);
    const assignedBranches = session.profile.sucursalesIds?.length
      ? session.profile.sucursalesIds
      : session.profile.sucursalId
        ? [session.profile.sucursalId]
        : [];
    if (assignedBranches.length) {
      conditions.push(`${alias}.sucursal_id = ANY($${start + values.length}::uuid[])`);
      values.push(assignedBranches);
    } else {
      conditions.push("FALSE");
    }
    const assignedUnits = session.profile.unidadesNegocioIds?.length
      ? session.profile.unidadesNegocioIds
      : session.profile.unidadNegocioId
        ? [session.profile.unidadNegocioId]
        : [];
    if (assignedUnits.length) {
      conditions.push(`${alias}.unidad_negocio_id = ANY($${start + values.length}::uuid[])`);
      values.push(assignedUnits);
    }
  } else if (session.role === "asesor") {
    conditions.push("FALSE");
  } else if (session.role === "coordinador") {
    conditions.push(`${alias}.sucursal_id = ANY($${start + values.length}::uuid[])`);
    values.push(
      session.profile.sucursalesIds?.length
        ? session.profile.sucursalesIds
        : [session.profile.sucursalId].filter(Boolean),
    );
  } else if (session.role === "gerente_comercial") {
    conditions.push(`${alias}.unidad_negocio_id = ANY($${start + values.length}::uuid[])`);
    values.push(
      session.profile.unidadesNegocioIds?.length
        ? session.profile.unidadesNegocioIds
        : [session.profile.unidadNegocioId].filter(Boolean),
    );
  }
  return { sql: conditions.length ? conditions.join(" AND ") : "TRUE", values };
}

const EXCLURE_CONSORCIO = `cliente NOT ILIKE '%CONSORCIO%COGESTION%VENEQUIP%'`;

type ParetoRow = { cliente: string; monto: number | string; sucursalId: string | null };

function mergePareto(parts: ParetoRow[][]): ParetoRow[] {
  const map = new Map<string, ParetoRow>();
  for (const rows of parts) {
    for (const r of rows) {
      const key = `${r.cliente}\0${r.sucursalId ?? ""}`;
      const cur = map.get(key);
      const monto = Number(r.monto ?? 0);
      if (cur) cur.monto = Number(cur.monto) + monto;
      else map.set(key, { cliente: r.cliente, monto, sucursalId: r.sucursalId });
    }
  }
  return Array.from(map.values());
}

router.get("/cliente-360", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  if (!session) {
    res.status(401).json({ message: "Sesión no válida." });
    return;
  }
  if (!session.role) {
    res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
    return;
  }
  const year = Number(req.query.anio);
  const legacyMonth = Number(req.query.mes ?? 0);
  const months = req.query.meses === undefined
    ? (legacyMonth === 0 ? Array.from({ length: 12 }, (_, index) => index + 1) : [legacyMonth])
    : typeof req.query.meses === "string" ? req.query.meses.split(",").map(Number) : [];
  const source = req.query.fuente;
  const unitIds = ids(req.query.unidades);
  const branchIds = ids(req.query.sucursales);
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200 ||
    !Number.isInteger(legacyMonth) ||
    legacyMonth < 0 ||
    legacyMonth > 12 ||
    months.length > 12 ||
    months.some((month) => !Number.isInteger(month) || month < 1 || month > 12) ||
    !["cotizado", "facturado", "perdido"].includes(String(source)) ||
    !unitIds ||
    !branchIds
  ) {
    res.status(400).json({ message: "Los filtros de cliente 360 no son válidos." });
    return;
  }
  if (!allowed(session, branchIds, unitIds)) {
    res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." });
    return;
  }
  const selectedMonths = [...new Set(months)];
  const from = `${year}-01-01`;
  const until = `${year + 1}-01-01`;

  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      const p = scoped(session, "x", 4, branchIds, unitIds);
      const f = scoped(session, "f", 4, branchIds, unitIds);
      const s = scoped(session, "s", 4, branchIds, unitIds, false);
      const v = scoped(session, "v", 4, branchIds, unitIds);
      const c = scoped(session, "c", 1, branchIds, unitIds, false);

      let paretoRows: ParetoRow[] = [];

      if (source === "cotizado") {
        const pareto = await tx.query(
          `SELECT x.cliente, COALESCE(SUM(x.monto), 0) AS monto, x.sucursal_id AS "sucursalId"
           FROM cotizaciones x
           WHERE x.fecha >= $1::date AND x.fecha < $2::date AND EXTRACT(MONTH FROM x.fecha)::int = ANY($3::int[]) AND ${p.sql}
             AND x.${EXCLURE_CONSORCIO}
           GROUP BY x.cliente, x.sucursal_id`,
          [from, until, selectedMonths, ...p.values],
        );
        paretoRows = pareto.rows as ParetoRow[];
      } else if (source === "facturado") {
        // Misma lógica que Top Clientes Facturados en Resumen:
        // facturas (Xibi/Otra) + servicios (CCV AS400), excluyendo Consorcio.
        const [fac, serv] = await Promise.all([
          tx.query(
            `SELECT x.cliente, COALESCE(SUM(x.monto), 0) AS monto, x.sucursal_id AS "sucursalId"
             FROM facturas x
             WHERE x.fecha >= $1::date AND x.fecha < $2::date AND EXTRACT(MONTH FROM x.fecha)::int = ANY($3::int[]) AND ${p.sql}
               AND x.${EXCLURE_CONSORCIO}
             GROUP BY x.cliente, x.sucursal_id`,
            [from, until, selectedMonths, ...p.values],
          ),
          tx.query(
            `SELECT s.cliente, COALESCE(SUM(s.monto), 0) AS monto, s.sucursal_id AS "sucursalId"
             FROM servicios s
             WHERE s.fecha >= $1::date AND s.fecha < $2::date AND EXTRACT(MONTH FROM s.fecha)::int = ANY($3::int[]) AND ${s.sql}
               AND s.${EXCLURE_CONSORCIO}
             GROUP BY s.cliente, s.sucursal_id`,
            [from, until, selectedMonths, ...s.values],
          ),
        ]);
        paretoRows = mergePareto([fac.rows as ParetoRow[], serv.rows as ParetoRow[]]);
      } else {
        const pareto = await tx.query(
          `SELECT x.cliente, COALESCE(SUM(x.monto), 0) AS monto, x.sucursal_id AS "sucursalId"
           FROM ventas_perdidas x
           WHERE x.fecha >= $1::date AND x.fecha < $2::date AND EXTRACT(MONTH FROM x.fecha)::int = ANY($3::int[]) AND ${p.sql}
           GROUP BY x.cliente, x.sucursal_id`,
          [from, until, selectedMonths, ...p.values],
        );
        paretoRows = pareto.rows as ParetoRow[];
      }

      const [facLtv, servLtv, lost, receivables] = await Promise.all([
        tx.query(
          `SELECT f.cliente, MAX(f.fecha) AS fecha, COALESCE(SUM(f.monto), 0) AS monto
           FROM facturas f
           WHERE f.fecha >= $1::date AND f.fecha < $2::date AND EXTRACT(MONTH FROM f.fecha)::int = ANY($3::int[]) AND ${f.sql}
             AND f.${EXCLURE_CONSORCIO}
           GROUP BY f.cliente`,
          [from, until, selectedMonths, ...f.values],
        ),
        tx.query(
          `SELECT s.cliente, MAX(s.fecha) AS fecha, COALESCE(SUM(s.monto), 0) AS monto
           FROM servicios s
           WHERE s.fecha >= $1::date AND s.fecha < $2::date AND EXTRACT(MONTH FROM s.fecha)::int = ANY($3::int[]) AND ${s.sql}
             AND s.${EXCLURE_CONSORCIO}
           GROUP BY s.cliente`,
          [from, until, selectedMonths, ...s.values],
        ),
        tx.query(
          `SELECT v.cliente, COALESCE(SUM(v.monto), 0) AS monto
           FROM ventas_perdidas v
           WHERE v.fecha >= $1::date AND v.fecha < $2::date AND EXTRACT(MONTH FROM v.fecha)::int = ANY($3::int[]) AND ${v.sql}
           GROUP BY v.cliente`,
          [from, until, selectedMonths, ...v.values],
        ),
        tx.query(
          `SELECT c.cliente, COALESCE(SUM(c.saldo), 0) AS saldo, MIN(c.fecha_vencimiento) AS "fechaVencimiento"
           FROM cobranzas c
           WHERE c.saldo > 0 AND ${c.sql}
           GROUP BY c.cliente`,
          c.values,
        ),
      ]);

      const ltvMap = new Map<string, { cliente: string; fecha: string; monto: number }>();
      for (const r of [...facLtv.rows, ...servLtv.rows] as {
        cliente: string;
        fecha: string;
        monto: number | string;
      }[]) {
        const cur = ltvMap.get(r.cliente);
        const monto = Number(r.monto ?? 0);
        const fecha = r.fecha ?? "";
        if (!cur) ltvMap.set(r.cliente, { cliente: r.cliente, fecha, monto });
        else {
          cur.monto += monto;
          if (fecha && (!cur.fecha || fecha > cur.fecha)) cur.fecha = fecha;
        }
      }

      return {
        pareto: paretoRows,
        facturas: Array.from(ltvMap.values()),
        ventasPerdidas: lost.rows,
        cobranzas: receivables.rows,
      };
    });
    res.json(result);
  } catch (error) {
    req.log?.error?.(
      { error, detail: error instanceof Error ? error.message : String(error) },
      "cliente 360 query failed",
    );
    res.status(500).json({ message: "No se pudo cargar cliente 360." });
  }
});

export default router;
