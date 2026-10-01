import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction } from "./auth";

type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};
type BudgetKey = `${string}:${string}:${number}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedBranches(session: SessionPayload) {
  return session.profile.sucursalesIds.length
    ? session.profile.sucursalesIds
    : session.profile.sucursalId
      ? [session.profile.sucursalId]
      : [];
}

function groupKey(branchId: string, unitId: string, month: number): BudgetKey {
  return `${branchId}:${unitId}:${month}`;
}

function distributeCents(
  total: number,
  entries: Array<{ id: string; percentage: number }>,
) {
  const cents = Math.max(0, Math.round(total * 100));
  const portions = entries.map((entry) => {
    const raw = (cents * entry.percentage) / 100;
    return {
      ...entry,
      cents: Math.floor(raw),
      remainder: raw - Math.floor(raw),
    };
  });
  let remaining = cents - portions.reduce((sum, item) => sum + item.cents, 0);
  portions.sort(
    (a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id),
  );
  for (
    let index = 0;
    index < portions.length && remaining > 0;
    index += 1, remaining -= 1
  )
    portions[index]!.cents += 1;
  return new Map(portions.map((item) => [item.id, item.cents / 100]));
}

async function run<T>(
  res: Response,
  session: SessionPayload,
  action: (tx: Queryable) => Promise<T>,
) {
  try {
    return await withScopedTransaction(session, action);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PRESUPUESTO_SCOPE_MISMATCH"
    ) {
      res.status(409).json({
        message:
          "La distribución debe incluir exactamente cada meta oficial de tu sucursal.",
      });
      return null;
    }
    if (
      error instanceof Error &&
      error.message === "PRESUPUESTO_ADVISOR_SCOPE_MISMATCH"
    ) {
      res.status(403).json({
        message:
          "Solo puedes distribuir entre asesores asignados a esa sucursal y unidad.",
      });
      return null;
    }
    res.req?.log?.error?.({ error }, "presupuestos asesores failed");
    res.status(500).json({
      message: "No se pudo cargar o guardar la distribución por asesor.",
    });
    return null;
  }
}

export default function presupuestosAsesoresRouter() {
  const router = Router();

  async function coordinator(req: Request, res: Response) {
    const session = await currentSession(req);
    if (!session) {
      res.status(401).json({ message: "Sesión no válida." });
      return null;
    }
    if (session.role !== "coordinador") {
      res.status(403).json({
        message:
          "Solo el coordinador puede distribuir el presupuesto entre asesores.",
      });
      return null;
    }
    const branches = allowedBranches(session);
    if (!branches.length) {
      res
        .status(403)
        .json({ message: "Tu perfil no tiene sucursales asignadas." });
      return null;
    }
    return { session, branches };
  }

  router.get("/presupuestos/asesores", async (req, res) => {
    const auth = await coordinator(req, res);
    if (!auth) return;
    const year = Number(req.query.anio ?? new Date().getFullYear());
    const requestedBranch = req.query.sucursalId;
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      res.status(400).json({ message: "El año no es válido." });
      return;
    }
    if (
      requestedBranch !== undefined &&
      (typeof requestedBranch !== "string" ||
        !UUID_RE.test(requestedBranch) ||
        !auth.branches.includes(requestedBranch))
    ) {
      res.status(403).json({ message: "No tienes acceso a esa sucursal." });
      return;
    }
    const branches = requestedBranch ? [requestedBranch] : auth.branches;
    const result = await run(res, auth.session, async (tx) => {
      const [budgets, history, saved, branchAdvisors] = await Promise.all([
        tx.query(
          `SELECT p.anio, p.mes, p.sucursal_id AS "sucursalId", s.nombre AS sucursal,
                  p.unidad_negocio_id AS "unidadNegocioId", un.nombre AS unidad,
                  SUM(p.monto)::numeric AS monto
           FROM presupuestos p
           JOIN sucursales s ON s.id = p.sucursal_id
           JOIN unidades_negocio un ON un.id = p.unidad_negocio_id
           WHERE p.anio = $1 AND p.sucursal_id = ANY($2::uuid[]) AND p.unidad_negocio_id IS NOT NULL
           GROUP BY p.anio, p.mes, p.sucursal_id, s.nombre, p.unidad_negocio_id, un.nombre
           ORDER BY s.nombre, un.nombre, p.mes`,
          [year, branches],
        ),
        tx.query(
          `SELECT ca.anio, ca.mes, ca.sucursal_id AS "sucursalId", ca.unidad_negocio_id AS "unidadNegocioId",
                  ca.asesor_id AS "asesorId", MAX(ca.codigo_asesor) AS "codigoAsesor", MAX(ca.asesor) AS asesor,
                  SUM(ca.venta)::numeric AS venta
           FROM cumplimiento_asesores ca
           WHERE ca.anio = ANY($1::int[]) AND ca.sucursal_id = ANY($2::uuid[])
             AND ca.asesor_id IS NOT NULL AND ca.unidad_negocio_id IS NOT NULL
           GROUP BY ca.anio, ca.mes, ca.sucursal_id, ca.unidad_negocio_id, ca.asesor_id`,
          [[year, year - 1], branches],
        ),
        tx.query(
          `SELECT anio, mes, sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId",
                  asesor_id AS "asesorId", codigo_asesor AS "codigoAsesor", asesor_nombre AS asesor, participacion, monto
           FROM presupuestos_asesores WHERE anio = $1 AND sucursal_id = ANY($2::uuid[])`,
          [year, branches],
        ),
        tx.query(
          `SELECT asesor_id AS "advisorId", sucursal_id AS "sucursalId",
                  unidad_negocio_id AS "unidadNegocioId", asesor
           FROM coordinator_branch_unit_advisors($1::uuid[])`,
          [branches],
        ),
      ]);

      const savedByKey = new Map(
        saved.rows.map((row) => [
          `${row["sucursalId"]}:${row["unidadNegocioId"]}:${row["mes"]}:${row["asesorId"]}`,
          {
            participacion: Number(row["participacion"]),
            monto: Number(row["monto"]),
            asesor: String(row["asesor"] ?? "Asesor"),
            codigoAsesor: String(row["codigoAsesor"] ?? ""),
          },
        ]),
      );
      const results = budgets.rows.map((budget) => {
        const branchId = String(budget["sucursalId"]);
        const unitId = String(budget["unidadNegocioId"]);
        const month = Number(budget["mes"]);
        const roster = new Map<
          string,
          {
            advisorId: string;
            advisor: string;
            code: string;
            salesMonth: number;
            salesYear: number;
            current: boolean;
          }
        >();
        for (const row of branchAdvisors.rows) {
          if (
            row["sucursalId"] !== branchId ||
            row["unidadNegocioId"] !== unitId
          ) continue;
          const advisorId = String(row["advisorId"]);
          roster.set(advisorId, {
            advisorId,
            advisor: String(row["asesor"] ?? "Asesor"),
            code: "",
            salesMonth: 0,
            salesYear: 0,
            current: false,
          });
        }
        for (const row of history.rows) {
          if (
            row["sucursalId"] !== branchId ||
            row["unidadNegocioId"] !== unitId
          )
            continue;
          const advisorId = String(row["asesorId"]);
          const assignedAdvisor = roster.get(advisorId);
          if (!assignedAdvisor) continue;
          const current = Number(row["anio"]) === year;
          const value = assignedAdvisor;
          if (current) value.current = true;
          else {
            value.salesYear += Number(row["venta"] ?? 0);
            if (Number(row["mes"]) === month)
              value.salesMonth += Number(row["venta"] ?? 0);
          }
          if (current && row["asesor"]) value.advisor = String(row["asesor"]);
          if (current && row["codigoAsesor"])
            value.code = String(row["codigoAsesor"]);
          roster.set(advisorId, value);
        }
        const advisors = [...roster.values()];
        const monthSales = advisors.reduce(
          (sum, item) => sum + item.salesMonth,
          0,
        );
        const yearSales = advisors.reduce(
          (sum, item) => sum + item.salesYear,
          0,
        );
        const hasSavedGroup = saved.rows.some(
          (row) =>
            row["sucursalId"] === branchId &&
            row["unidadNegocioId"] === unitId &&
            Number(row["mes"]) === month,
        );
        const seeded = advisors.map((item) => {
          const basis =
            monthSales > 0
              ? item.salesMonth
              : yearSales > 0
                ? item.salesYear
                : 1;
          const total =
            monthSales > 0
              ? monthSales
              : yearSales > 0
                ? yearSales
                : advisors.length;
          const stored = savedByKey.get(
            `${branchId}:${unitId}:${month}:${item.advisorId}`,
          );
          return {
            advisorId: item.advisorId,
            advisor: item.advisor || stored?.asesor || "Asesor",
            codigoAsesor: item.code || stored?.codigoAsesor || "",
            participacion:
              stored?.participacion ??
              (hasSavedGroup ? 0 : total > 0 ? (basis * 100) / total : 0),
            monto: stored?.monto ?? 0,
            ventaBase: item.salesMonth,
            ventaAnualBase: item.salesYear,
            origen: stored
              ? "guardado"
              : hasSavedGroup
                ? "nuevo_asesor_sin_asignacion"
                : monthSales > 0
                  ? "venta_mismo_mes_anterior"
                  : yearSales > 0
                    ? "venta_anual_anterior"
                    : "distribucion_igualitaria",
            activoEnAnio: item.current,
          };
        });
        if (!hasSavedGroup && seeded.length) {
          const units = seeded.map((item) =>
            Math.round(item.participacion * 100000),
          );
          let remainder =
            10_000_000 - units.reduce((sum, value) => sum + value, 0);
          const order = seeded
            .map((item, index) => ({
              index,
              basis:
                monthSales > 0
                  ? item.ventaBase
                  : yearSales > 0
                    ? item.ventaAnualBase
                    : 1,
            }))
            .sort((a, b) => b.basis - a.basis || a.index - b.index);
          for (
            let index = 0;
            index < order.length && remainder !== 0;
            index += 1
          ) {
            const adjustment = remainder > 0 ? 1 : -1;
            units[order[index]!.index]! += adjustment;
            remainder -= adjustment;
            if (index === order.length - 1 && remainder !== 0) index = -1;
          }
          seeded.forEach((item, index) => {
            item.participacion = units[index]! / 100000;
          });
        }
        const total = Number(budget["monto"] ?? 0);
        if (
          !saved.rows.some(
            (row) =>
              row["sucursalId"] === branchId &&
              row["unidadNegocioId"] === unitId &&
              Number(row["mes"]) === month,
          ) &&
          seeded.length
        ) {
          const percentages = seeded.map((item) => ({
            id: item.advisorId,
            percentage: item.participacion,
          }));
          const amounts = distributeCents(total, percentages);
          seeded.forEach((item) => {
            item.monto = amounts.get(item.advisorId) ?? 0;
          });
        }
        return {
          anio: year,
          mes: month,
          sucursalId: branchId,
          sucursal: String(budget["sucursal"]),
          unidadNegocioId: unitId,
          unidad: String(budget["unidad"]),
          monto: total,
          asesores: seeded,
          requiereAsignacionAsesores: seeded.length === 0,
        };
      });
      return {
        anio: year,
        sucursales: [
          ...new Map(
            budgets.rows.map((row) => [
              String(row["sucursalId"]),
              {
                id: String(row["sucursalId"]),
                nombre: String(row["sucursal"]),
              },
            ]),
          ).values(),
        ],
        rows: results,
      };
    });
    if (result) res.json(result);
  });

  router.put("/presupuestos/asesores", async (req, res) => {
    const auth = await coordinator(req, res);
    if (!auth) return;
    const year = Number(req.body?.anio);
    const rows = req.body?.rows;
    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2200 ||
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.length > 10000
    ) {
      res
        .status(400)
        .json({ message: "El año o la distribución no son válidos." });
      return;
    }
    const seen = new Set<string>();
    const groupShares = new Map<
      BudgetKey,
      Array<{ advisorId: string; percentage: number }>
    >();
    for (const input of rows) {
      if (!input || typeof input !== "object") {
        res
          .status(400)
          .json({ message: "La distribución contiene filas no válidas." });
        return;
      }
      const row = input as Record<string, unknown>;
      const branchId = row["sucursalId"];
      const unitId = row["unidadNegocioId"];
      const advisorId = row["asesorId"];
      const month = Number(row["mes"]);
      const percentage = Number(row["participacion"]);
      if (
        typeof branchId !== "string" ||
        !UUID_RE.test(branchId) ||
        !auth.branches.includes(branchId) ||
        typeof unitId !== "string" ||
        !UUID_RE.test(unitId) ||
        typeof advisorId !== "string" ||
        !UUID_RE.test(advisorId) ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12 ||
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100 ||
        Math.abs(percentage * 100000 - Math.round(percentage * 100000)) >
          0.000001
      ) {
        res.status(400).json({
          message:
            "Hay una sucursal, unidad, asesor, mes o porcentaje no válido.",
        });
        return;
      }
      const key = groupKey(branchId, unitId, month);
      const advisorKey = `${key}:${advisorId}`;
      if (seen.has(advisorKey)) {
        res.status(400).json({
          message: "Un asesor está repetido en la misma distribución.",
        });
        return;
      }
      seen.add(advisorKey);
      groupShares.set(key, [
        ...(groupShares.get(key) ?? []),
        { advisorId, percentage },
      ]);
    }
    for (const shares of groupShares.values()) {
      if (
        !shares.length ||
        Math.abs(shares.reduce((sum, item) => sum + item.percentage, 0) - 100) >
          0.000005
      ) {
        res.status(400).json({
          message:
            "La participación de cada sucursal, unidad y mes debe sumar 100 %.",
        });
        return;
      }
    }
    const saved = await run(res, auth.session, async (tx) => {
      const budgets = await tx.query(
        `SELECT sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId", mes,
                SUM(monto)::numeric AS monto
         FROM presupuestos WHERE anio = $1 AND sucursal_id = ANY($2::uuid[]) AND unidad_negocio_id IS NOT NULL
         GROUP BY sucursal_id, unidad_negocio_id, mes`,
        [year, auth.branches],
      );
      const budgetByKey = new Map(
        budgets.rows.map((row) => [
          groupKey(
            String(row["sucursalId"]),
            String(row["unidadNegocioId"]),
            Number(row["mes"]),
          ),
          Number(row["monto"] ?? 0),
        ]),
      );
      if (
        budgetByKey.size === 0 ||
        budgetByKey.size !== groupShares.size ||
        [...budgetByKey.keys()].some((key) => !groupShares.has(key))
      ) {
        throw new Error("PRESUPUESTO_SCOPE_MISMATCH");
      }
      const advisors = await tx.query(
        `SELECT a.asesor_id AS "asesorId", a.sucursal_id AS "sucursalId",
                a.unidad_negocio_id AS "unidadNegocioId", a.asesor,
                MAX(ca.codigo_asesor) AS "codigoAsesor"
         FROM coordinator_branch_unit_advisors($1::uuid[]) a
         LEFT JOIN cumplimiento_asesores ca
           ON ca.asesor_id = a.asesor_id AND ca.sucursal_id = a.sucursal_id
           AND ca.unidad_negocio_id = a.unidad_negocio_id
         GROUP BY a.asesor_id, a.sucursal_id, a.unidad_negocio_id, a.asesor`,
        [auth.branches],
      );
      const advisorDetails = new Map(
        advisors.rows.map((row) => [
          `${row["sucursalId"]}:${row["unidadNegocioId"]}:${row["asesorId"]}`,
          {
            nombre: String(row["asesor"] ?? "Asesor"),
            codigo: row["codigoAsesor"] ? String(row["codigoAsesor"]) : null,
          },
        ]),
      );
      for (const [key, shares] of groupShares) {
        const [branchId] = key.split(":");
        const [, unitId] = key.split(":");
        if (
          shares.some(
            (share) =>
              !advisorDetails.has(`${branchId}:${unitId}:${share.advisorId}`),
          )
        ) {
          throw new Error("PRESUPUESTO_ADVISOR_SCOPE_MISMATCH");
        }
      }
      const touchedBranches = [...new Set(
        [...groupShares.keys()].map((key) => key.split(":")[0]).filter((id): id is string => Boolean(id)),
      )];
      await tx.query(
        "DELETE FROM presupuestos_asesores WHERE anio = $1 AND sucursal_id = ANY($2::uuid[])",
        [year, touchedBranches],
      );
      for (const [key, shares] of groupShares) {
        const [branchId, unitId, rawMonth] = key.split(":");
        const month = Number(rawMonth);
        const amounts = distributeCents(
          budgetByKey.get(key) ?? 0,
          shares.map((item) => ({
            id: item.advisorId,
            percentage: item.percentage,
          })),
        );
        for (const share of shares) {
          await tx.query(
            `INSERT INTO presupuestos_asesores
              (anio, mes, sucursal_id, unidad_negocio_id, asesor_id, codigo_asesor, asesor_nombre,
               participacion, monto, actualizado_por)
             VALUES ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10::uuid)`,
            [
              year,
              month,
              branchId,
              unitId,
              share.advisorId,
              advisorDetails.get(`${branchId}:${unitId}:${share.advisorId}`)?.codigo ??
                null,
              advisorDetails.get(`${branchId}:${unitId}:${share.advisorId}`)?.nombre ??
                "Asesor",
              share.percentage,
              amounts.get(share.advisorId) ?? 0,
              auth.session.user.id,
            ],
          );
        }
      }
      return { anio: year, distribucionesGuardadas: rows.length };
    });
    if (saved) res.json(saved);
  });

  return router;
}
