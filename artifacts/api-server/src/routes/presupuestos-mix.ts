import { Router } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

type Row = Record<string, any>;
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Row[] }> };
type ScopeRow = { nivel: string; unidadId: string; unidad: string; sucursalId: string; sucursal: string; mes: number; asesorId: string; asesor: string; monto: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATALOG: Record<string, Array<{ key: string; label: string }>> = {
  repuestos: [{ key: "caterpillar", label: "Caterpillar" }, { key: "blumaq", label: "Blumaq" }, { key: "otros", label: "Otros" }],
  lubfiltros: [{ key: "chronus", label: "Chronus · Lubricantes" }, { key: "donaldson", label: "Donaldson · Filtros" }],
  servicios: [{ key: "csa", label: "CSA" }, { key: "otras", label: "Otras" }],
  equipos: [{ key: "generac", label: "Generac" }, { key: "weichai", label: "Weichai" }, { key: "ep_equipment", label: "EP Equipment" }, { key: "otras", label: "Otras" }],
  alquiler: [{ key: "comercial", label: "Comercial" }, { key: "industrial", label: "Industrial" }, { key: "residencial", label: "Residencial" }],
};
function unitKey(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("repuesto")) return "repuestos";
  if (normalized.includes("lub") || normalized.includes("filtro")) return "lubfiltros";
  if (normalized.includes("servicio")) return "servicios";
  if (normalized.includes("equipo")) return "equipos";
  if (normalized.includes("alquiler")) return "alquiler";
  return "";
}
function allocate(total: number, items: Array<{ key: string; share: number }>) {
  const cents = Math.round(total * 100);
  const portions = items.map(item => {
    const raw = cents * item.share / 100;
    return { key: item.key, cents: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let left = cents - portions.reduce((sum, item) => sum + item.cents, 0);
  for (const item of [...portions].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key)).slice(0, left)) item.cents += 1;
  return new Map(portions.map(item => [item.key, item.cents / 100]));
}
function salesItem(kind: string, rawName: unknown) {
  const value = String(rawName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (kind === "repuestos") return value.includes("caterpillar") || value === "cat" ? "caterpillar" : value.includes("blumaq") ? "blumaq" : "otros";
  if (kind === "lubfiltros") return ["co", "chronus"].includes(value) || value.includes("chronus") ? "chronus" : ["dn", "d1", "gf", "nc", "donaldson"].includes(value) || value.includes("donaldson") ? "donaldson" : null;
  if (kind === "equipos") return value.includes("generac") ? "generac" : value.includes("weichai") ? "weichai" : value.includes("ep") ? "ep_equipment" : "otras";
  if (kind === "servicios") return value ? "csa" : "otras";
  return null;
}
async function transaction<T>(session: SessionPayload, action: (tx: Queryable) => Promise<T>) {
  return withScopedTransaction(session, action);
}

export default function presupuestosMixRouter() {
  const router = Router();

  router.get("/presupuestos/mix", async (req, res): Promise<void> => {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; }
    if (!["administrador", "director", "gerencia", "gerente_comercial", "coordinador"].includes(session.role ?? "")) { res.status(403).json({ message: "No tienes permiso para consultar el mix del presupuesto." }); return; }
    const year = Number(req.query.anio ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) { res.status(400).json({ message: "El año no es válido." }); return; }
    try {
      const result = await transaction(session, async tx => {
        const version = await tx.query(
          "SELECT id, estado, creado_por AS \"creadoPor\" FROM presupuestos_versiones WHERE anio = $1 AND ($2::uuid IS NULL OR id = $2::uuid) ORDER BY CASE WHEN estado = CASE WHEN $3 = 'coordinador' THEN 'aprobado' ELSE 'propuesto' END THEN 0 ELSE 1 END, aprobado_at DESC NULLS LAST, created_at DESC LIMIT 1",
          [year, typeof req.query.versionId === "string" && UUID.test(req.query.versionId) ? req.query.versionId : null, session.role ?? ""],
        );
        const selected = version.rows[0];
        if (!selected) return { versionId: null, estado: null, scopes: [], records: [], editableLevels: [] };
        const lines = await tx.query(
          `SELECT l.mes, l.sucursal_id AS "sucursalId", s.nombre AS sucursal,
                  l.unidad_negocio_id AS "unidadId", u.nombre AS unidad, SUM(l.monto)::numeric AS monto
           FROM presupuestos_versiones_lineas l
           LEFT JOIN sucursales s ON s.id = l.sucursal_id
           JOIN unidades_negocio u ON u.id = l.unidad_negocio_id
           WHERE l.version_id = $1::uuid
           GROUP BY l.mes, l.sucursal_id, s.nombre, l.unidad_negocio_id, u.nombre
           ORDER BY u.nombre, s.nombre, l.mes`, [selected.id],
        );
        let branchScopes = lines.rows.map(row => ({ nivel: "sucursal_mes", unidadId: String(row.unidadId), unidad: String(row.unidad), sucursalId: String(row.sucursalId ?? ""), sucursal: String(row.sucursal ?? "Sin sucursal"), mes: Number(row.mes), asesorId: "", asesor: "", monto: Number(row.monto) }));
        if (session.role === "gerente_comercial") branchScopes = branchScopes.filter(row => session.profile.unidadesNegocioIds.includes(row.unidadId));
        if (session.role === "coordinador") branchScopes = branchScopes.filter(row => session.profile.sucursalesIds.includes(row.sucursalId));
        const [parts, lube, equipment, services] = await Promise.all([
          tx.query(`SELECT sucursal_id AS "sucursalId", mes, marca, SUM(monto_total)::numeric AS monto FROM detalles_ventas_repuestos WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC') = $1 GROUP BY sucursal_id, mes, marca`, [year]),
          tx.query(`SELECT sucursal_id AS "sucursalId", mes, marca, SUM(monto_total)::numeric AS monto FROM detalles_ventas_lubfiltros WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC') = $1 GROUP BY sucursal_id, mes, marca`, [year]),
          tx.query(`SELECT unidad_negocio_id AS "unidadId", sucursal_id AS "sucursalId", mes, marca, SUM(monto)::numeric AS monto FROM equipos_por_marca WHERE anio = $1 GROUP BY unidad_negocio_id, sucursal_id, mes, marca`, [year]),
          tx.query(`SELECT unidad_negocio_id AS "unidadId", sucursal_id AS "sucursalId", EXTRACT(MONTH FROM fecha)::int AS mes, csa, SUM(monto)::numeric AS monto FROM servicios WHERE EXTRACT(YEAR FROM fecha)::int = $1 GROUP BY unidad_negocio_id, sucursal_id, EXTRACT(MONTH FROM fecha)::int, csa`, [year]),
        ]);
        const salesRows = [
          ...parts.rows.map(row => ({ kind: "repuestos", unidadId: "", sucursalId: String(row.sucursalId ?? ""), mes: Number(row.mes), key: salesItem("repuestos", row.marca), monto: Number(row.monto) })),
          ...lube.rows.map(row => ({ kind: "lubfiltros", unidadId: "", sucursalId: String(row.sucursalId ?? ""), mes: Number(row.mes), key: salesItem("lubfiltros", row.marca), monto: Number(row.monto) })),
          ...equipment.rows.map(row => ({ kind: "equipos", unidadId: String(row.unidadId), sucursalId: String(row.sucursalId ?? ""), mes: Number(row.mes), key: salesItem("equipos", row.marca), monto: Number(row.monto) })),
          ...services.rows.map(row => ({ kind: "servicios", unidadId: String(row.unidadId), sucursalId: String(row.sucursalId ?? ""), mes: Number(row.mes), key: salesItem("servicios", row.csa), monto: Number(row.monto) })),
        ].filter(row => row.key);
        const addSalesReference = (scope: ScopeRow) => {
          const kind = unitKey(scope.unidad);
          const matching = salesRows.filter(row => row.kind === kind && (!row.unidadId || row.unidadId === scope.unidadId) && (!scope.sucursalId || row.sucursalId === scope.sucursalId) && (!scope.mes || row.mes === scope.mes));
          const totals = new Map<string, number>();
          for (const row of matching) totals.set(row.key!, (totals.get(row.key!) ?? 0) + row.monto);
          const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
          if (!total) return { ...scope, sugerencias: [] };
          const categories = CATALOG[kind] ?? [];
          let accumulated = 0;
          const sugerencias = categories.map((item, index) => {
            const share = index === categories.length - 1 ? 100 - accumulated : Math.round((totals.get(item.key) ?? 0) / total * 10000) / 100;
            accumulated += share;
            return { itemKey: item.key, participacion: share };
          });
          return { ...scope, sugerencias };
        };
        const units = [...new Map(branchScopes.map(row => [row.unidadId, row])).values()].map(row => ({ ...row, nivel: "unidad", sucursalId: "", sucursal: "Todas", mes: 0, monto: branchScopes.filter(item => item.unidadId === row.unidadId).reduce((sum, item) => sum + item.monto, 0) }));
        const advisors = await tx.query(
          `SELECT a.sucursal_id AS "sucursalId", a.unidad_negocio_id AS "unidadId", a.mes,
                  a.asesor_id AS "asesorId", MAX(a.asesor_nombre) AS asesor, SUM(a.monto)::numeric AS monto
           FROM presupuestos_asesores a WHERE a.anio = $1
           GROUP BY a.sucursal_id, a.unidad_negocio_id, a.mes, a.asesor_id`, [year],
        );
        const advisorScopes = advisors.rows.map(row => {
          const branch = branchScopes.find(item => item.unidadId === String(row.unidadId) && item.sucursalId === String(row.sucursalId) && item.mes === Number(row.mes));
          return { nivel: "asesor_mes", unidadId: String(row.unidadId), unidad: branch?.unidad ?? "Unidad", sucursalId: String(row.sucursalId), sucursal: branch?.sucursal ?? "Sucursal", mes: Number(row.mes), asesorId: String(row.asesorId), asesor: String(row.asesor ?? "Asesor"), monto: Number(row.monto) };
        }).filter(row => branchScopes.some(branch => branch.unidadId === row.unidadId && branch.sucursalId === row.sucursalId && branch.mes === row.mes));
        const records = await tx.query(
          `SELECT nivel, unidad_negocio_id AS "unidadId", sucursal_id AS "sucursalId", mes,
                  asesor_id AS "asesorId", item_key AS "itemKey", participacion::numeric AS participacion,
                  monto::numeric AS monto, updated_at AS "updatedAt"
           FROM presupuestos_mix WHERE version_id = $1::uuid ORDER BY item_key`, [selected.id],
        );
        const editableLevels = session.role === "administrador" && selected.estado === "propuesto" ? ["unidad", "sucursal_mes"]
          : session.role === "administrador" && selected.estado === "aprobado" ? ["asesor_mes"]
          : session.role === "gerencia" && selected.estado === "propuesto" && String(selected.creadoPor) === session.user.id ? ["unidad"]
          : session.role === "gerente_comercial" && selected.estado === "propuesto" ? ["sucursal_mes"]
          : session.role === "coordinador" && selected.estado === "aprobado" ? ["asesor_mes"] : [];
        const visibleScopes = session.role === "coordinador"
          ? [...branchScopes, ...advisorScopes]
          : [...units, ...branchScopes, ...advisorScopes];
        const identity = (row: { nivel: string; unidadId: string; sucursalId?: string | null; mes?: number | null; asesorId?: string | null }) =>
          [row.nivel, row.unidadId, row.sucursalId ?? "", Number(row.mes ?? 0), row.asesorId ?? ""].join(":");
        const readableScopes = new Set(visibleScopes.map(identity));
        const visibleRecords = records.rows.filter(row => readableScopes.has(identity({
          nivel: String(row.nivel), unidadId: String(row.unidadId), sucursalId: row.sucursalId == null ? "" : String(row.sucursalId),
          mes: row.mes == null ? 0 : Number(row.mes), asesorId: row.asesorId == null ? "" : String(row.asesorId),
        })));
        return { versionId: String(selected.id), estado: String(selected.estado), scopes: visibleScopes.map(addSalesReference), records: visibleRecords, editableLevels };
      });
      res.json({ anio: year, ...result });
    } catch (error) {
      req.log?.error?.({ error }, "presupuestos mix read failed");
      res.status(500).json({ message: "No se pudo cargar el presupuesto por marca o premisa." });
    }
  });

  router.put("/presupuestos/mix", async (req, res): Promise<void> => {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return; }
    const { versionId, nivel, unidadId, sucursalId = null, mes = null, asesorId = null, items } = req.body ?? {};
    if (!UUID.test(String(versionId)) || !["unidad", "sucursal_mes", "asesor_mes"].includes(nivel) || !UUID.test(String(unidadId)) || !Array.isArray(items) || items.length < 1 || items.length > 20) { res.status(400).json({ message: "La asignación del mix no es válida." }); return; }
    const canWrite = session.role === "administrador"
      || (session.role === "gerencia" && nivel === "unidad")
      || (session.role === "gerente_comercial" && nivel === "sucursal_mes" && session.profile.unidadesNegocioIds.includes(String(unidadId)))
      || (session.role === "coordinador" && nivel === "asesor_mes" && typeof sucursalId === "string" && session.profile.sucursalesIds.includes(sucursalId));
    if (!canWrite) { res.status(403).json({ message: "Tu rol no puede editar esta asignación." }); return; }
    if (nivel !== "unidad" && (!UUID.test(String(sucursalId)) || !Number.isInteger(Number(mes)) || Number(mes) < 1 || Number(mes) > 12)) { res.status(400).json({ message: "La sucursal y el mes son obligatorios." }); return; }
    if ((nivel === "asesor_mes") !== (typeof asesorId === "string" && UUID.test(asesorId))) { res.status(400).json({ message: "Selecciona un asesor válido para el alcance." }); return; }
    const seen = new Set<string>();
    const parsed = items.map((item: any) => ({ key: String(item?.key ?? ""), share: Number(item?.participacion) }));
    for (const item of parsed) {
      if (!item.key || seen.has(item.key) || !Number.isFinite(item.share) || item.share < 0 || item.share > 100 || Math.abs(item.share * 100000 - Math.round(item.share * 100000)) > 0.000001) { res.status(400).json({ message: "Hay porcentajes repetidos o inválidos." }); return; }
      seen.add(item.key);
    }
    if (Math.abs(parsed.reduce((sum, item) => sum + item.share, 0) - 100) > 0.000005) { res.status(400).json({ message: "La participación del mix debe sumar 100 %." }); return; }
    try {
      const saved = await transaction(session, async tx => {
        const version = await tx.query("SELECT anio, estado, creado_por AS \"creadoPor\" FROM presupuestos_versiones WHERE id = $1::uuid FOR UPDATE", [versionId]);
        if (!version.rows[0]) throw new Error("VERSION_NOT_FOUND");
        if (nivel !== "asesor_mes" && version.rows[0].estado !== "propuesto") throw new Error("VERSION_LOCKED");
        if (session.role === "gerencia" && nivel === "unidad" && String(version.rows[0].creadoPor) !== session.user.id) throw new Error("VERSION_OWNER_MISMATCH");
        if (session.role === "coordinador" && version.rows[0].estado !== "aprobado") throw new Error("VERSION_LOCKED");
        const unit = await tx.query("SELECT nombre FROM unidades_negocio WHERE id = $1::uuid", [unidadId]);
        const catalog = CATALOG[unitKey(String(unit.rows[0]?.nombre ?? ""))] ?? [];
        if (catalog.length !== parsed.length || parsed.some(item => !catalog.some(row => row.key === item.key))) throw new Error("CATALOG_MISMATCH");
        let parent = await tx.query("SELECT COALESCE(SUM(monto),0)::numeric AS monto FROM presupuestos_versiones_lineas WHERE version_id = $1::uuid AND unidad_negocio_id = $2::uuid AND ($3::uuid IS NULL OR sucursal_id = $3::uuid) AND ($4::int IS NULL OR mes = $4)", [versionId, unidadId, nivel === "unidad" ? null : sucursalId, nivel === "unidad" ? null : Number(mes)]);
        let parentAmount = Number(parent.rows[0]?.monto ?? 0);
        if (nivel === "asesor_mes") {
          parent = await tx.query("SELECT COALESCE(SUM(monto),0)::numeric AS monto FROM presupuestos_asesores WHERE anio = $1 AND unidad_negocio_id = $2::uuid AND sucursal_id = $3::uuid AND mes = $4 AND asesor_id = $5::uuid", [Number(version.rows[0].anio), unidadId, sucursalId, Number(mes), asesorId]);
          parentAmount = Number(parent.rows[0]?.monto ?? 0);
          if (session.role === "coordinador") {
            const validAdvisor = await tx.query("SELECT 1 FROM coordinator_branch_unit_advisors($1::uuid[]) WHERE sucursal_id = $2::uuid AND unidad_negocio_id = $3::uuid AND asesor_id = $4::uuid", [session.profile.sucursalesIds, sucursalId, unidadId, asesorId]);
            if (!validAdvisor.rows.length) throw new Error("ADVISOR_SCOPE_DENIED");
          }
        }
        if (parentAmount <= 0) throw new Error(nivel === "asesor_mes" ? "ADVISOR_NOT_ALLOCATED" : "PARENT_EMPTY");
        const amounts = allocate(parentAmount, parsed);
        await tx.query("DELETE FROM presupuestos_mix WHERE version_id = $1::uuid AND nivel = $2 AND unidad_negocio_id = $3::uuid AND sucursal_id IS NOT DISTINCT FROM $4::uuid AND mes IS NOT DISTINCT FROM $5::int AND asesor_id IS NOT DISTINCT FROM $6::uuid", [versionId, nivel, unidadId, sucursalId, nivel === "unidad" ? null : Number(mes), asesorId]);
        for (const item of parsed) await tx.query("INSERT INTO presupuestos_mix (version_id, anio, nivel, unidad_negocio_id, sucursal_id, mes, asesor_id, item_key, participacion, monto, actualizado_por) VALUES ($1::uuid,$2,$3,$4::uuid,$5::uuid,$6,$7::uuid,$8,$9,$10,$11::uuid)", [versionId, Number(version.rows[0].anio), nivel, unidadId, sucursalId, nivel === "unidad" ? null : Number(mes), asesorId, item.key, item.share, amounts.get(item.key) ?? 0, session.user.id]);
        return { versionId, nivel, parentAmount, totalAsignado: [...amounts.values()].reduce((sum, amount) => sum + amount, 0) };
      });
      res.json(saved);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const status = code === "VERSION_NOT_FOUND" ? 404 : ["VERSION_LOCKED", "VERSION_OWNER_MISMATCH", "ADVISOR_SCOPE_DENIED"].includes(code) ? 403 : ["PARENT_EMPTY", "ADVISOR_NOT_ALLOCATED"].includes(code) ? 409 : code === "CATALOG_MISMATCH" ? 400 : 500;
      if (status === 500) req.log?.error?.({ error }, "presupuestos mix save failed");
      const message = code === "VERSION_NOT_FOUND" ? "La versión no existe." : code === "VERSION_LOCKED" ? "El mix solo se puede editar en una propuesta vigente; Coordinación usa la última versión aprobada." : code === "VERSION_OWNER_MISMATCH" ? "Solo puedes editar el mix de una propuesta creada por tu nivel." : code === "PARENT_EMPTY" ? "El nivel superior no tiene monto presupuestado." : code === "ADVISOR_NOT_ALLOCATED" ? "Primero asigna presupuesto a este asesor." : code === "ADVISOR_SCOPE_DENIED" ? "El asesor no pertenece a tu sucursal y unidad." : code === "CATALOG_MISMATCH" ? "Las premisas enviadas no corresponden a la unidad." : "No se pudo guardar el mix de presupuesto.";
      res.status(status).json({ message });
    }
  });
  return router;
}
