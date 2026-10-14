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

router.get("/cliente-360/cartera-ventas", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  if (!session) return void res.status(401).json({ message: "Sesión no válida." });
  if (!session.role) return void res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
  const year = Number(req.query.anio);
  const months = typeof req.query.meses === "string" ? req.query.meses.split(",").map(Number) : [];
  const requestedUnits = ids(req.query.unidades);
  const requestedBranches = ids(req.query.sucursales);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !requestedUnits || !requestedBranches || months.length > 12 || months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    return void res.status(400).json({ message: "Los filtros de cartera y ventas no son válidos." });
  }
  const profileUnits = session.profile.unidadesNegocioIds?.length ? session.profile.unidadesNegocioIds : [session.profile.unidadNegocioId].filter(Boolean) as string[];
  const profileBranches = session.profile.sucursalesIds?.length ? session.profile.sucursalesIds : [session.profile.sucursalId].filter(Boolean) as string[];
  const unitIds = session.role === "asesor"
    ? []
    : session.role === "gerente_comercial"
    ? requestedUnits.length ? requestedUnits.filter((id) => profileUnits.includes(id)) : profileUnits
    : requestedUnits;
  const branchIds = session.role === "coordinador" || session.role === "asesor"
    ? requestedBranches.length ? requestedBranches.filter((id) => profileBranches.includes(id)) : profileBranches
    : requestedBranches;
  if ((session.role === "gerente_comercial" && (unitIds.length === 0 || unitIds.length !== (requestedUnits.length ? requestedUnits.filter((id) => profileUnits.includes(id)).length : profileUnits.length))) ||
      ((session.role === "coordinador" || session.role === "asesor") && (branchIds.length === 0 || branchIds.length !== (requestedBranches.length ? requestedBranches.filter((id) => profileBranches.includes(id)).length : profileBranches.length)))) {
    return void res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." });
  }

  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      let advisorCodes: string[] = [];
      if (session.role === "asesor") {
        const codes = await tx.query(
          `SELECT DISTINCT codigo_asesor FROM cumplimiento_asesores WHERE asesor_id = $1::uuid AND codigo_asesor IS NOT NULL`,
          [session.user.id],
        );
        advisorCodes = codes.rows.map((row) => String(row.codigo_asesor));
      }
      const params: unknown[] = [`${year}-01-01`, `${year + 1}-01-01`, months.length ? months : Array.from({ length: 12 }, (_, i) => i + 1), unitIds.length ? unitIds : null, branchIds.length ? branchIds : null];
      const roleClauses: string[] = ["($4::uuid[] IS NULL OR v.unidad_negocio_id = ANY($4::uuid[]))", "($5::uuid[] IS NULL OR v.sucursal_id = ANY($5::uuid[]))"];
      if (session.role === "gerente_comercial" && !profileUnits.length) roleClauses.push("FALSE");
      if ((session.role === "coordinador" || session.role === "asesor") && !profileBranches.length) roleClauses.push("FALSE");
      if (session.role === "asesor") {
        params.push(advisorCodes);
        params.push(session.user.id);
        roleClauses.push(`(v.codigo_asesor = ANY($${params.length - 1}::text[]) OR v.asesor_id = $${params.length}::uuid OR (v.fuente = 'servicio' AND v.codigo_asesor IS NULL AND servicio_cartera_tiene_asesor_unico(32, v.codigo_cliente, v.sucursal_id, $${params.length}::uuid)))`);
      }
      const where = roleClauses.join(" AND ");
      const rows = await tx.query(
        `WITH ventas AS (
           SELECT fecha, sucursal_id, unidad_negocio_id, codigo_cliente, codigo_asesor, asesor_id, asesor, cliente, monto, 'factura'::text AS fuente
           FROM facturas WHERE fecha >= $1::date AND fecha < $2::date AND EXTRACT(MONTH FROM fecha)::int = ANY($3::int[]) AND ${EXCLURE_CONSORCIO}
           UNION ALL
           SELECT fecha, sucursal_id, unidad_negocio_id, codigo_cliente, codigo_asesor, NULL::uuid AS asesor_id, asesor, cliente, monto, 'servicio'::text AS fuente
           FROM servicios WHERE fecha >= $1::date AND fecha < $2::date AND EXTRACT(MONTH FROM fecha)::int = ANY($3::int[]) AND ${EXCLURE_CONSORCIO}
         ), alcance AS (
           SELECT v.*,
             EXISTS (SELECT 1 FROM cartera_integral ci
               WHERE ci.compania_codigo = 32 AND ci.codigo_cliente = v.codigo_cliente AND ci.sucursal_id = v.sucursal_id
                 AND (${session.role === "asesor" ? "(ci.codigo_asesor = v.codigo_asesor OR (v.asesor_id = $7::uuid AND v.codigo_asesor IS NULL AND ci.codigo_asesor = ANY($6::text[])) OR (v.fuente = 'servicio' AND v.codigo_asesor IS NULL AND servicio_cartera_tiene_asesor_unico(32, v.codigo_cliente, v.sucursal_id, $7::uuid)))" : "TRUE"})) AS es_cartera
           FROM ventas v WHERE ${where} AND v.sucursal_id IS NOT NULL
         ), resumen AS (
           SELECT CASE WHEN codigo_cliente IS NULL OR btrim(codigo_cliente) = '' THEN 'sin_codigo'
                       WHEN es_cartera THEN 'cartera' ELSE 'esporadico' END AS tipo,
                  SUM(monto)::numeric AS monto, COUNT(DISTINCT codigo_cliente)::int AS clientes
           FROM alcance GROUP BY 1
         ), unidad AS (
           SELECT a.codigo_cliente, a.sucursal_id, a.unidad_negocio_id,
                  COALESCE(MAX(u.nombre), 'Sin unidad') AS unidad,
                  SUM(a.monto)::numeric AS monto
           FROM alcance a LEFT JOIN unidades_negocio u ON u.id = a.unidad_negocio_id
           WHERE a.codigo_cliente IS NOT NULL AND btrim(a.codigo_cliente) <> ''
           GROUP BY a.codigo_cliente, a.sucursal_id, a.unidad_negocio_id
         ), mix_unidad AS (
           SELECT codigo_cliente, sucursal_id,
                  jsonb_agg(jsonb_build_object('unidad', unidad, 'monto', monto) ORDER BY monto DESC) AS "desgloseUnidad"
           FROM unidad GROUP BY codigo_cliente, sucursal_id
         ), detalle AS (
           SELECT a.codigo_cliente AS "codigoCliente", a.sucursal_id AS "sucursalId", MAX(suc.nombre) AS sucursal,
                  COALESCE(MAX(ci.nombre), MAX(a.cliente), a.codigo_cliente) AS cliente,
                  SUM(a.monto)::numeric AS monto,
                  COALESCE(SUM(a.monto) FILTER (WHERE a.es_cartera), 0)::numeric AS "montoCartera",
                  COALESCE(SUM(a.monto) FILTER (WHERE NOT a.es_cartera), 0)::numeric AS "montoEsporadico",
                  BOOL_OR(a.es_cartera) AS "esCartera",
                  MAX(a.fecha) AS "ultimaVenta",
                  COALESCE(jsonb_agg(DISTINCT jsonb_build_object('codigoAsesor', a.codigo_asesor, 'asesor', a.asesor))
                    FILTER (WHERE a.codigo_asesor IS NOT NULL OR a.asesor IS NOT NULL), '[]'::jsonb) AS asesores,
                  COALESCE(mu."desgloseUnidad", '[]'::jsonb) AS "desgloseUnidad"
           FROM alcance a LEFT JOIN clientes_integrales ci ON ci.compania_codigo = 32 AND ci.codigo_cliente = a.codigo_cliente
           LEFT JOIN sucursales suc ON suc.id = a.sucursal_id
           LEFT JOIN mix_unidad mu ON mu.codigo_cliente = a.codigo_cliente AND mu.sucursal_id = a.sucursal_id
           WHERE a.codigo_cliente IS NOT NULL AND btrim(a.codigo_cliente) <> ''
           GROUP BY a.codigo_cliente, a.sucursal_id, mu."desgloseUnidad"
         ), calidad AS (
           SELECT COALESCE(SUM(monto) FILTER (WHERE codigo_cliente IS NULL OR btrim(codigo_cliente) = ''), 0)::numeric AS "ventasSinCodigoCliente",
                  COALESCE(SUM(monto) FILTER (WHERE codigo_asesor IS NULL OR btrim(codigo_asesor) = ''), 0)::numeric AS "ventasSinCodigoAsesor"
           FROM alcance
         )
         SELECT jsonb_build_object(
           'resumen', COALESCE((SELECT jsonb_agg(to_jsonb(resumen)) FROM resumen), '[]'::jsonb),
           'clientes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.monto DESC) FROM (SELECT * FROM detalle ORDER BY monto DESC LIMIT 5000) x), '[]'::jsonb),
           'calidad', (SELECT to_jsonb(calidad) FROM calidad)
         ) AS data`,
        params,
      );
      return rows.rows[0]?.data ?? { resumen: [], clientes: [], calidad: { ventasSinCodigoCliente: 0, ventasSinCodigoAsesor: 0 } };
    });
    res.json(result);
  } catch (error) {
    req.log?.error?.({ error, detail: error instanceof Error ? error.message : String(error) }, "client portfolio sales analysis failed");
    res.status(500).json({ message: "No se pudo cargar el análisis de cartera y ventas. Verifica que se haya aplicado la migración de códigos de cliente." });
  }
});

router.get("/cliente-360/cartera-integral", async (req: Request, res: Response): Promise<void> => {
  const session = await currentSession(req);
  if (!session) return void res.status(401).json({ message: "Sesión no válida." });
  if (!session.role) return void res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });

  const branchIds = ids(req.query.sucursales);
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  if (!branchIds || !allowed(session, branchIds, [])) {
    return void res.status(403).json({ message: "El filtro solicitado está fuera de tu alcance." });
  }

  try {
    const result = await withScopedTransaction(session, async (tx: Queryable) => {
      const advisorCodes = session.role === "asesor"
        ? (await tx.query(
            `SELECT DISTINCT codigo_asesor FROM cumplimiento_asesores WHERE asesor_id = $1::uuid AND codigo_asesor IS NOT NULL`,
            [session.user.id],
          )).rows.map((row) => String(row.codigo_asesor))
        : null;
      const rows = await tx.query(
        `SELECT c.compania_codigo AS "companiaCodigo",
                c.codigo_cliente AS "codigoCliente",
                c.nombre AS cliente,
                COUNT(DISTINCT ci.codigo_asesor)::int AS "asesoresAsignados",
                COUNT(DISTINCT ci.sucursal_id)::int AS "sucursalesAsignadas",
                COUNT(*)::int AS "totalAsignaciones",
                jsonb_agg(
                  DISTINCT jsonb_build_object(
                    'codigoAsesor', ci.codigo_asesor,
                    'asesor', ci.asesor,
                    'sucursalId', ci.sucursal_id,
                    'sucursal', s.nombre
                  )
                ) AS asignaciones
         FROM clientes_integrales c
         JOIN cartera_integral ci
           ON ci.compania_codigo = c.compania_codigo
          AND ci.codigo_cliente = c.codigo_cliente
         JOIN sucursales s ON s.id = ci.sucursal_id
         WHERE ($1::text = '' OR c.codigo_cliente ILIKE '%' || $1 || '%'
                OR c.nombre ILIKE '%' || $1 || '%'
                OR ci.asesor ILIKE '%' || $1 || '%')
           AND ($2::uuid[] IS NULL OR ci.sucursal_id = ANY($2::uuid[]))
           AND ($3::text[] IS NULL OR ci.codigo_asesor = ANY($3::text[]))
         GROUP BY c.compania_codigo, c.codigo_cliente, c.nombre
         ORDER BY c.nombre, c.codigo_cliente
         LIMIT 10000`,
        [search, branchIds.length ? branchIds : null, advisorCodes],
      );
      return {
        clientes: rows.rows,
        total: rows.rows.length,
        asignaciones: rows.rows.reduce((total, row) => total + Number(row["totalAsignaciones"] ?? 0), 0),
      };
    });
    res.json(result);
  } catch (error) {
    req.log?.error?.({ error, detail: error instanceof Error ? error.message : String(error) }, "integral client portfolio query failed");
    res.status(500).json({ message: "No se pudo cargar la cartera integral." });
  }
});

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

      let invoiceRows: Array<{ cliente: string; fecha: string; monto: number }> = [];
      let receivableRows: Record<string, any>[] = [];
      if (source === "facturado") {
        const [facLtv, servLtv] = await Promise.all([
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
        ]);
        const relevantClientNames = [...new Set([
          ...paretoRows.map((row) => row.cliente),
          ...facLtv.rows.map((row) => String(row.cliente ?? "")),
          ...servLtv.rows.map((row) => String(row.cliente ?? "")),
        ].map((name) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es")).filter(Boolean))];
        const receivables = relevantClientNames.length
          ? await tx.query(
              `SELECT c.cliente, COALESCE(SUM(c.saldo), 0) AS saldo, MIN(c.fecha_vencimiento) AS "fechaVencimiento"
               FROM cobranzas c
               WHERE c.saldo > 0 AND ${c.sql}
                 AND lower(trim(regexp_replace(c.cliente, '[[:space:]]+', ' ', 'g'))) = ANY($${c.values.length + 1}::text[])
               GROUP BY c.cliente`,
              [...c.values, relevantClientNames],
            )
          : { rows: [] as Record<string, any>[] };
        const ltvMap = new Map<string, { cliente: string; fecha: string; monto: number }>();
        for (const r of [...facLtv.rows, ...servLtv.rows] as { cliente: string; fecha: string; monto: number | string }[]) {
          const cur = ltvMap.get(r.cliente);
          const monto = Number(r.monto ?? 0);
          const fecha = r.fecha ?? "";
          if (!cur) ltvMap.set(r.cliente, { cliente: r.cliente, fecha, monto });
          else {
            cur.monto += monto;
            if (fecha && (!cur.fecha || fecha > cur.fecha)) cur.fecha = fecha;
          }
        }
        invoiceRows = Array.from(ltvMap.values());
        receivableRows = receivables.rows;
      }

      return {
        pareto: paretoRows,
        facturas: invoiceRows,
        ventasPerdidas: [],
        cobranzas: receivableRows,
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
