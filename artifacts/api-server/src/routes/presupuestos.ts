import { Router, type Request, type Response } from "express";
import type { SessionPayload } from "./auth";
import { aplicarPremisasConjunto, premisaGlobalLegacy, validarPremisas, type Premisa } from "../lib/premisas";
import {
  calcularDistribucionPresupuesto,
  distribucionInicial,
  type DistribucionPresupuesto,
  type FilaBasePresupuesto,
} from "../lib/distribucion-presupuesto";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
type SessionLoader = (req: Request) => Promise<SessionPayload | null>;
type Transaction = <T>(session: SessionPayload, fn: (tx: Queryable) => Promise<T>) => Promise<T>;

async function filasPresupuestoBase(tx: Queryable, anio: number) {
  return tx.query(`
    SELECT p.mes, p.sucursal_id AS "sucursalId", s.nombre AS sucursal,
      p.unidad_negocio_id AS "unidadNegocioId", u.nombre AS unidad,
      SUM(COALESCE(p.ventas_ccv, 0) + COALESCE(p.ventas_xibi, 0) + COALESCE(p.ventas_estrategicas, 0))::numeric AS "realBase",
      SUM(COALESCE(p.monto, 0))::numeric AS "basePresupuesto"
    FROM presupuestos p
    LEFT JOIN sucursales s ON s.id = p.sucursal_id
    LEFT JOIN unidades_negocio u ON u.id = p.unidad_negocio_id
    WHERE p.anio = $1
    GROUP BY p.mes, p.sucursal_id, s.nombre, p.unidad_negocio_id, u.nombre
    ORDER BY p.mes, sucursal, unidad`, [anio]);
}

async function contextoPresupuesto(tx: Queryable, anioBase: number, anioObjetivo: number) {
  const aprobada = await tx.query(
    `SELECT id, premisas FROM presupuestos_versiones WHERE anio = $1 AND estado = 'aprobado'
     ORDER BY aprobado_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [anioObjetivo],
  );
  const versionBaseId = aprobada.rows[0]?.id ?? null;
  if (!versionBaseId) {
    const presupuestoObjetivo = await filasPresupuestoBase(tx, anioObjetivo);
    const totalObjetivo = presupuestoObjetivo.rows.reduce((sum, row) => sum + Number(row.basePresupuesto ?? 0), 0);
    const anioFuente = totalObjetivo > 0 ? anioObjetivo : anioBase;
    const base = anioFuente === anioObjetivo ? presupuestoObjetivo : await filasPresupuestoBase(tx, anioBase);
    const filas: FilaBasePresupuesto[] = base.rows.map((row) => ({
      mes: Number(row.mes),
      sucursalId: row.sucursalId,
      sucursal: row.sucursal,
      unidadNegocioId: row.unidadNegocioId,
      unidad: row.unidad,
      basePresupuesto: Number(row.basePresupuesto ?? 0),
      realBase: Number(row.realBase ?? 0),
    }));
    return { filas, versionBaseId: null as string | null, premisasBase: null as Record<string, unknown> | null, anioBaseUsado: anioFuente, origen: anioFuente === anioObjetivo ? "presupuesto_objetivo" : "anio_anterior" };
  }

  const base = await tx.query(`
    SELECT l.mes, l.sucursal_id AS "sucursalId", s.nombre AS sucursal,
      l.unidad_negocio_id AS "unidadNegocioId", u.nombre AS unidad,
      l.monto::numeric AS "basePresupuesto", COALESCE(r.real_base, 0)::numeric AS "realBase"
    FROM presupuestos_versiones_lineas l
    LEFT JOIN sucursales s ON s.id = l.sucursal_id
    LEFT JOIN unidades_negocio u ON u.id = l.unidad_negocio_id
    LEFT JOIN (
      SELECT mes, sucursal_id, unidad_negocio_id,
        SUM(COALESCE(ventas_ccv, 0) + COALESCE(ventas_xibi, 0) + COALESCE(ventas_estrategicas, 0)) AS real_base
      FROM presupuestos WHERE anio = $2
      GROUP BY mes, sucursal_id, unidad_negocio_id
    ) r ON r.mes = l.mes AND r.sucursal_id IS NOT DISTINCT FROM l.sucursal_id
      AND r.unidad_negocio_id IS NOT DISTINCT FROM l.unidad_negocio_id
    WHERE l.version_id = $1::uuid ORDER BY l.mes, sucursal, unidad`,
    [versionBaseId, anioObjetivo],
  );
  const filas: FilaBasePresupuesto[] = base.rows.map((row) => ({
    mes: Number(row.mes),
    sucursalId: row.sucursalId,
    sucursal: row.sucursal,
    unidadNegocioId: row.unidadNegocioId,
    unidad: row.unidad,
    basePresupuesto: Math.max(0, Number(row.basePresupuesto ?? 0) - montoGestionPorFila(aprobada.rows[0].premisas, row.unidadNegocioId, row.sucursalId, Number(row.mes))),
    realBase: Number(row.realBase ?? 0),
  }));
  return { filas, versionBaseId: String(versionBaseId), premisasBase: aprobada.rows[0].premisas as Record<string, unknown> | null, anioBaseUsado: anioObjetivo, origen: "version_aprobada" };
}

function distribucionDeBody(input: unknown): DistribucionPresupuesto | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.crecimientoAnualPct !== "number" || !Number.isFinite(value.crecimientoAnualPct)) return null;
  if (!Array.isArray(value.unidades) || !Array.isArray(value.sucursales) || !Array.isArray(value.meses)) return null;
  const parseId = (id: unknown) => id === null || typeof id === "string" ? id : undefined;
  const unidades = value.unidades.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const id = parseId(row.unidadNegocioId);
    if (id === undefined || typeof row.participacion !== "number" || !Number.isFinite(row.participacion)) return null;
    const gestionComercialPct = typeof row.gestionComercialPct === "number" && Number.isFinite(row.gestionComercialPct) ? row.gestionComercialPct : 0;
    const gestionComercialMonto = row.gestionComercialMonto === null || row.gestionComercialMonto === undefined
      ? null
      : typeof row.gestionComercialMonto === "number" && Number.isFinite(row.gestionComercialMonto) && row.gestionComercialMonto >= 0
        ? row.gestionComercialMonto
        : null;
    return { unidadNegocioId: id, participacion: row.participacion, gestionComercialPct, gestionComercialMonto };
  });
  const sucursales = value.sucursales.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const unidadId = parseId(row.unidadNegocioId);
    const sucursalId = parseId(row.sucursalId);
    if (unidadId === undefined || sucursalId === undefined || typeof row.participacion !== "number" || !Number.isFinite(row.participacion)) return null;
    return { unidadNegocioId: unidadId, sucursalId, participacion: row.participacion };
  });
  const meses = value.meses.map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const unidadId = parseId(row.unidadNegocioId);
    if (unidadId === undefined || !Number.isInteger(row.mes) || typeof row.participacion !== "number" || !Number.isFinite(row.participacion)) return null;
    return { unidadNegocioId: unidadId, mes: Number(row.mes), participacion: row.participacion };
  });
  if (unidades.some((row) => row === null) || sucursales.some((row) => row === null) || meses.some((row) => row === null)) return null;
  return {
    crecimientoAnualPct: value.crecimientoAnualPct,
    unidades: unidades as DistribucionPresupuesto["unidades"],
    sucursales: sucursales as DistribucionPresupuesto["sucursales"],
    meses: meses as DistribucionPresupuesto["meses"],
  };
}

function distribucionAprobada(contexto: Awaited<ReturnType<typeof contextoPresupuesto>>, crecimientoInicial: number, gestionBase = gestionConfigDePremisas(contexto.premisasBase)) {
  const aprobada = contexto.premisasBase?.tipo === "participacion"
    ? distribucionDeBody(contexto.premisasBase)
    : null;
  return aprobada ?? distribucionInicial(contexto.filas, crecimientoInicial, gestionBase.porcentajes, gestionBase.montos);
}

function aplicarPermisosDeRol(
  role: string | null | undefined,
  contexto: Awaited<ReturnType<typeof contextoPresupuesto>>,
  enviada: DistribucionPresupuesto,
  crecimientoInicial: number,
): DistribucionPresupuesto {
  if (role !== "director" && role !== "gerencia") return enviada;
  const gestionBase = gestionConfigDePremisas(contexto.premisasBase);
  const base = distribucionAprobada(contexto, crecimientoInicial, gestionBase);
  if (role === "director") return { ...base, crecimientoAnualPct: enviada.crecimientoAnualPct };
  return { ...enviada, crecimientoAnualPct: base.crecimientoAnualPct };
}

function unidadesAsignadas(session: SessionPayload) {
  return [...new Set(session.profile.unidadesNegocioIds?.length
    ? session.profile.unidadesNegocioIds
    : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [])];
}

function gestionConfigDePremisas(premisas: unknown) {
  const salida = new Map<string, number>();
  const montos = new Map<string, number>();
  if (!premisas || typeof premisas !== "object") return { porcentajes: salida, montos };
  const snapshot = premisas as Record<string, unknown>;
  if (snapshot.tipo !== "participacion" || !Array.isArray(snapshot.unidades)) return { porcentajes: salida, montos };
  for (const item of snapshot.unidades) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if ((row.unidadNegocioId === null || typeof row.unidadNegocioId === "string") && typeof row.gestionComercialPct === "number" && Number.isFinite(row.gestionComercialPct)) {
      salida.set(row.unidadNegocioId ?? "__sin_id__", row.gestionComercialPct);
    }
    if ((row.unidadNegocioId === null || typeof row.unidadNegocioId === "string") && typeof row.gestionComercialMonto === "number" && Number.isFinite(row.gestionComercialMonto) && row.gestionComercialMonto >= 0) {
      montos.set(row.unidadNegocioId ?? "__sin_id__", row.gestionComercialMonto);
    }
  }
  return { porcentajes: salida, montos };
}

function montoGestionPorFila(premisas: unknown, unidadNegocioId: string | null, sucursalId: string | null, mes: number): number {
  if (!premisas || typeof premisas !== "object") return 0;
  const snapshot = premisas as Record<string, unknown>;
  if (snapshot.tipo !== "participacion" || !Array.isArray(snapshot.unidades) || !Array.isArray(snapshot.sucursales) || !Array.isArray(snapshot.meses)) return 0;
  const unidad = snapshot.unidades.find((item) => !!item && typeof item === "object" && ((item as Record<string, unknown>).unidadNegocioId ?? null) === unidadNegocioId) as Record<string, unknown> | undefined;
  const mesRow = snapshot.meses.find((item) => !!item && typeof item === "object" && (item as Record<string, unknown>).unidadNegocioId === unidadNegocioId && (item as Record<string, unknown>).mes === mes) as Record<string, unknown> | undefined;
  const sucursalRow = snapshot.sucursales.find((item) => !!item && typeof item === "object" && (item as Record<string, unknown>).unidadNegocioId === unidadNegocioId && (item as Record<string, unknown>).sucursalId === sucursalId) as Record<string, unknown> | undefined;
  const monto = unidad?.gestionComercialMonto;
  const participacionMes = mesRow?.participacion;
  const participacionSucursal = sucursalRow?.participacion;
  if (typeof monto !== "number" || !Number.isFinite(monto) || typeof participacionMes !== "number" || typeof participacionSucursal !== "number") return 0;
  return Math.round((monto * participacionMes * participacionSucursal / 10_000 + Number.EPSILON) * 100) / 100;
}

function aplicarAlcanceDistribucion(session: SessionPayload, filas: FilaBasePresupuesto[], propuesta: DistribucionPresupuesto, gestionBase = gestionConfigDePremisas(null)) {
  if (session.role !== "gerente_comercial") return { distribucion: propuesta, unidadIds: null as string[] | null };

  const unidadIds = unidadesAsignadas(session);
  if (unidadIds.length === 0) throw new Error("PRESUPUESTO_INVALIDO:Tu perfil no tiene una unidad de negocio asignada.");
  if (propuesta.crecimientoAnualPct !== 0 || propuesta.unidades.length > 0) {
    throw new Error("PRESUPUESTO_INVALIDO:La gerencia comercial solo puede redistribuir su unidad entre sucursales y meses.");
  }

  const autorizadas = new Set(unidadIds);
  const base = distribucionInicial(filas, 0, gestionBase.porcentajes, gestionBase.montos);
  const sucursalesPermitidas = base.sucursales.filter((row) => row.unidadNegocioId !== null && autorizadas.has(row.unidadNegocioId));
  const mesesPermitidos = base.meses.filter((row) => row.unidadNegocioId !== null && autorizadas.has(row.unidadNegocioId));
  if (sucursalesPermitidas.length === 0) throw new Error("PRESUPUESTO_INVALIDO:No hay una meta asignada a las unidades de tu perfil.");

  const sucursalesEnviadas = new Set(propuesta.sucursales.map((row) => `${row.unidadNegocioId}:${row.sucursalId}`));
  const sucursalesEsperadas = new Set(sucursalesPermitidas.map((row) => `${row.unidadNegocioId}:${row.sucursalId}`));
  const mesesEnviados = new Set(propuesta.meses.map((row) => `${row.unidadNegocioId}:${row.mes}`));
  const mesesEsperados = new Set(mesesPermitidos.map((row) => `${row.unidadNegocioId}:${row.mes}`));
  if (
    propuesta.sucursales.some((row) => row.unidadNegocioId === null || !autorizadas.has(row.unidadNegocioId)) ||
    propuesta.meses.some((row) => row.unidadNegocioId === null || !autorizadas.has(row.unidadNegocioId)) ||
    sucursalesEnviadas.size !== sucursalesEsperadas.size || [...sucursalesEsperadas].some((key) => !sucursalesEnviadas.has(key)) ||
    mesesEnviados.size !== mesesEsperados.size || [...mesesEsperados].some((key) => !mesesEnviados.has(key))
  ) {
    throw new Error("PRESUPUESTO_INVALIDO:La propuesta contiene sucursales o unidades fuera de tu alcance.");
  }

  return {
    unidadIds,
    distribucion: {
      ...base,
      sucursales: base.sucursales.map((row) => sucursalesEsperadas.has(`${row.unidadNegocioId}:${row.sucursalId}`)
        ? propuesta.sucursales.find((item) => item.unidadNegocioId === row.unidadNegocioId && item.sucursalId === row.sucursalId) ?? row
        : row),
      meses: base.meses.map((row) => mesesEsperados.has(`${row.unidadNegocioId}:${row.mes}`)
        ? propuesta.meses.find((item) => item.unidadNegocioId === row.unidadNegocioId && item.mes === row.mes) ?? row
        : row),
    },
  };
}

// Roles que pueden ver o tocar este módulo (financiero) — coordinador/asesor nunca
// deben leer presupuesto/facturación de toda la empresa. Debe coincidir con
// MODULE_ACCESS["presupuestos"] en el frontend (src/lib/permissions.ts).
const ALLOWED_ROLES = ["administrador", "director", "gerencia", "gerente_comercial"];

const ESCENARIOS = ["conservador", "base", "optimista"];

function premisasDeBody(body: Record<string, unknown>): Premisa[] | null {
  if (Array.isArray(body["premisas"])) {
    const input = body["premisas"];
    if (input.length > 100 || !input.every((value) => {
      if (!value || typeof value !== "object") return false;
      const row = value as Record<string, unknown>;
      const tipoValido = row["tipo"] === "crecimiento_pct" || row["tipo"] === "ajuste_fijo";
      const alcanceValido = ["global", "unidad", "sucursal", "mes"].includes(String(row["alcance"]));
      if (!tipoValido || !alcanceValido || typeof row["valor"] !== "number" || !Number.isFinite(row["valor"])) return false;
      if (row["tipo"] === "crecimiento_pct" && (row["valor"] < -100 || row["valor"] > 500)) return false;
      if (row["tipo"] === "ajuste_fijo" && Math.abs(row["valor"]) > 1_000_000_000) return false;
      if ((row["alcance"] === "unidad" || row["alcance"] === "sucursal") && (typeof row["alcanceId"] !== "string" || !row["alcanceId"])) return false;
      if (row["alcance"] === "mes" && (!Number.isInteger(row["mes"]) || Number(row["mes"]) < 1 || Number(row["mes"]) > 12)) return false;
      return true;
    })) return null;
    return validarPremisas(input);
  }
  const crecimiento = Number(body["crecimientoPct"] ?? 0);
  if (!Number.isFinite(crecimiento) || crecimiento < -100 || crecimiento > 500) return null;
  return premisaGlobalLegacy(crecimiento);
}

export default function presupuestosRouter(currentSession: SessionLoader, withScopedTransaction: Transaction) {
  const router = Router();

  async function scopedSession(req: Request, res: Response) {
    const value = await currentSession(req);
    if (!value) { res.status(401).json({ message: "Sesión no válida." }); return null; }
    if (!ALLOWED_ROLES.includes(value.role ?? "")) {
      res.status(403).json({ message: "No tienes permisos para ver presupuestos." }); return null;
    }
    return value;
  }

  async function run<T>(res: Response, value: SessionPayload, fn: (tx: Queryable) => Promise<T>) {
    try {
      return await withScopedTransaction(value, fn);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        res.status(404).json({ message: "No se encontró la versión indicada." });
        return null;
      }
      if (error instanceof Error && error.message.startsWith("PRESUPUESTO_INVALIDO:")) {
        res.status(409).json({ message: error.message.slice("PRESUPUESTO_INVALIDO:".length) });
        return null;
      }
      res.req?.log?.error?.({ error }, "presupuestos failed");
      res.status(500).json({ message: "No se pudo completar la operación." });
      return null;
    }
  }

  function anioValido(anio: number) {
    return Number.isInteger(anio) && anio >= 2000 && anio <= 2200;
  }

  router.get("/presupuestos/historico", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.query.anio);
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const rows = await run(res, value, async (tx) => {
      const result = await filasPresupuestoBase(tx, anio);
      return { rows: result.rows.map((r): Record<string, any> => ({
        ...r,
        historico: r.realBase,
        presupuestoOficial: r.basePresupuesto,
      })) };
    });
    if (rows) {
      const scope = value.role === "gerente_comercial" ? new Set(unidadesAsignadas(value)) : null;
      res.json(scope ? rows.rows.filter((row) => row["unidadNegocioId"] !== null && scope.has(String(row["unidadNegocioId"]))) : rows.rows);
    }
  });

  router.get("/presupuestos/versiones", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.query.anio);
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const managerFilter = value.role === "gerente_comercial" ? "AND creado_por = $2::uuid" : "";
    const premisasSelect = value.role === "gerente_comercial" ? "NULL AS premisas" : "premisas";
    const params = value.role === "gerente_comercial" ? [anio, value.user.id] : [anio];
    const rows = await run(res, value, (tx) => tx.query(
      `SELECT id, anio, nombre, escenario, estado, descripcion, ${premisasSelect},
        creado_por AS "creadoPor",
        aprobado_por AS "aprobadoPor", aprobado_at AS "aprobadoAt",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM presupuestos_versiones WHERE anio = $1 ${managerFilter} ORDER BY created_at DESC`,
      params,
    ));
    if (rows) res.json(rows.rows);
  });

  router.post("/presupuestos/versiones", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.body?.anio);
    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const escenario = req.body?.escenario;
    const baseAnio = Number(req.body?.baseAnio);
    const descripcion = typeof req.body?.descripcion === "string" ? req.body.descripcion.trim() : null;
    if (!anioValido(anio) || !nombre || nombre.length > 120 || !ESCENARIOS.includes(escenario)) {
      res.status(400).json({ message: "Los datos de la versión no son válidos." }); return;
    }
    const distribucionSolicitada = Object.prototype.hasOwnProperty.call(req.body ?? {}, "distribucion");
    const distribucion = distribucionDeBody(req.body?.distribucion);
    if (distribucionSolicitada && !distribucion) { res.status(400).json({ message: "La distribución no es válida." }); return; }
    if ((value.role === "director" || value.role === "gerencia") && !distribucion) { res.status(403).json({ message: "Dirección y Gerencia Nacional deben usar la propuesta por distribución." }); return; }
    if (value.role === "gerente_comercial" && !distribucion) { res.status(403).json({ message: "La gerencia comercial solo puede proponer la distribución de su unidad." }); return; }
    if ((value.role === "gerente_comercial" || value.role === "director") && !anioValido(baseAnio)) { res.status(400).json({ message: "El año base de la propuesta no es válido." }); return; }
    if (value.role === "gerente_comercial" && (!descripcion || descripcion.length < 20 || descripcion.length > 2000)) {
      res.status(400).json({ message: "Incluye un plan comercial de al menos 20 caracteres y máximo 2.000." }); return;
    }
    if (descripcion && descripcion.length > 2000) { res.status(400).json({ message: "La descripción no puede exceder 2.000 caracteres." }); return; }
    const premisas = distribucion ? [] : premisasDeBody(req.body ?? {});
    if (!distribucion && !premisas) { res.status(400).json({ message: "Las premisas o la distribución no son válidas." }); return; }
    const row = await run(res, value, async (tx) => {
      let snapshot: unknown = distribucion ? { tipo: "participacion", ...distribucion } : premisas;
      const estado = value.role === "gerente_comercial" ? "propuesto" : "borrador";
      if (value.role === "gerente_comercial" && distribucion) {
        const contexto = await contextoPresupuesto(tx, baseAnio, anio);
        const crecimientoInicial = contexto.origen === "anio_anterior" ? 5 : 0;
        const distribucionAutorizada = aplicarPermisosDeRol(value.role, contexto, distribucion, crecimientoInicial);
        const alcance = aplicarAlcanceDistribucion(value, contexto.filas, distribucionAutorizada, gestionConfigDePremisas(contexto.premisasBase));
        snapshot = { tipo: "plan_comercial_unidad", ...distribucion, baseAnio: contexto.anioBaseUsado, versionBaseId: contexto.versionBaseId, unidadSolicitanteIds: alcance.unidadIds };
      } else if (value.role === "director" && distribucion) {
        const contexto = await contextoPresupuesto(tx, baseAnio, anio);
        const crecimientoInicial = contexto.origen === "anio_anterior" ? 5 : 0;
        const config = aplicarPermisosDeRol(value.role, contexto, distribucion, crecimientoInicial);
        snapshot = { tipo: "participacion", ...config, versionBaseId: contexto.versionBaseId };
      }
      return tx.query(
      `INSERT INTO presupuestos_versiones (anio, nombre, escenario, estado, descripcion, premisas, creado_por)
       VALUES ($1, $2, $3::presupuesto_escenario, $4, $5, $6::jsonb, $7::uuid)
       RETURNING id, anio, nombre, escenario, estado, descripcion, premisas, created_at AS "createdAt"`,
      [anio, nombre, escenario, estado, descripcion, JSON.stringify(snapshot), value.user.id],
      );
    });
    if (row) res.status(201).json(row.rows[0]);
  });

  router.post("/presupuestos/sugerencia", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.body?.anio);
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const premisas = premisasDeBody(req.body ?? {});
    if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
    const rows = await run(res, value, (tx) => filasPresupuestoBase(tx, anio));
    if (!rows) return;
    const calculables: Array<Record<string, any> & { mes: number; sucursalId: string | null; unidadNegocioId: string | null; base: number }> = rows.rows.map((r) => ({
      ...r,
      mes: Number(r.mes),
      sucursalId: r.sucursalId,
      unidadNegocioId: r.unidadNegocioId,
      base: Number(r.basePresupuesto ?? 0),
    }));
    const scope = value.role === "gerente_comercial" ? new Set(unidadesAsignadas(value)) : null;
    if (scope && scope.size === 0) { res.status(403).json({ message: "Tu perfil no tiene una unidad de negocio asignada." }); return; }
    const filasVisibles = scope ? calculables.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)) : calculables;
    const conSugerido = aplicarPremisasConjunto(filasVisibles, premisas);
    res.json({ anio, premisas, rows: conSugerido });
  });

  router.post("/presupuestos/versiones/:id/generar", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    if (value.role === "gerente_comercial") {
      res.status(403).json({ message: "La generación y aprobación de la meta anual corresponde a Gerencia Nacional. Tu distribución por sucursal y mes se presenta como plan de trabajo." });
      return;
    }
    const anio = Number(req.body?.anio);
    const id = req.params.id;
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const distribucionSolicitada = Object.prototype.hasOwnProperty.call(req.body ?? {}, "distribucion");
    const distribucion = distribucionDeBody(req.body?.distribucion);
    if (distribucionSolicitada && !distribucion) { res.status(400).json({ message: "La distribución no es válida." }); return; }
    if ((value.role === "director" || value.role === "gerencia") && !distribucion) { res.status(403).json({ message: "Dirección y Gerencia Nacional deben usar la propuesta por distribución." }); return; }
    const premisas = distribucion ? [] : premisasDeBody(req.body ?? {});
    if (!distribucion && !premisas) { res.status(400).json({ message: "Las premisas o la distribución no son válidas." }); return; }
    const result = await run(res, value, async (tx) => {
      const exists = await tx.query("SELECT id, anio, estado FROM presupuestos_versiones WHERE id = $1::uuid", [id]);
      const version = exists.rows[0];
      if (!version) throw new Error("NOT_FOUND");
      if (version.estado === "aprobado" || version.estado === "archivado") throw new Error("PRESUPUESTO_INVALIDO:No se puede regenerar una versión aprobada o archivada.");
      if (distribucion) {
        const contexto = await contextoPresupuesto(tx, anio, Number(version.anio));
        const crecimientoInicial = contexto.origen === "anio_anterior" ? 5 : 0;
        const distribucionAutorizada = aplicarPermisosDeRol(value.role, contexto, distribucion, crecimientoInicial);
        const alcance = aplicarAlcanceDistribucion(value, contexto.filas, distribucionAutorizada, gestionConfigDePremisas(contexto.premisasBase));
        const configCompleta = alcance.distribucion;
        // The currency amount is controlled by the latest approved snapshot. A client
        // may propose the rate, but cannot replace a previously fixed amount.
        const gestionFijada = gestionConfigDePremisas(contexto.premisasBase).montos;
        const configConMontoFijado: DistribucionPresupuesto = {
          ...configCompleta,
          unidades: configCompleta.unidades.map((unidad) => ({
            ...unidad,
            gestionComercialMonto: gestionFijada.get(unidad.unidadNegocioId ?? "__sin_id__") ?? null,
          })),
        };
        const calculo = calcularDistribucionPresupuesto(contexto.filas, configConMontoFijado, contexto.filas.reduce((sum, row) => sum + row.basePresupuesto, 0));
        const snapshotCompleto: DistribucionPresupuesto = {
          ...configConMontoFijado,
          unidades: calculo.totalesUnidad.map((total) => ({
            ...configConMontoFijado.unidades.find((unidad) => unidad.unidadNegocioId === total.unidadNegocioId)!,
            gestionComercialMonto: total.gestionComercialMonto,
          })),
        };
        if (calculo.errores.length > 0) throw new Error(`PRESUPUESTO_INVALIDO:${calculo.errores[0]}`);
        await tx.query("DELETE FROM presupuestos_versiones_lineas WHERE version_id = $1::uuid", [id]);
        for (const row of calculo.filas) {
          await tx.query(
            `INSERT INTO presupuestos_versiones_lineas (version_id, mes, sucursal_id, unidad_negocio_id, historico, sugerido, monto, fuente)
             VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $6, 'participacion')`,
            [id, row.mes, row.sucursalId, row.unidadNegocioId, row.realBase, row.sugerido],
          );
        }
        await tx.query(
          "UPDATE presupuestos_versiones SET premisas = $1::jsonb, estado = 'propuesto', updated_at = now() WHERE id = $2::uuid",
          [JSON.stringify({ tipo: "participacion", ...snapshotCompleto, versionBaseId: contexto.versionBaseId, metaPropuesta: calculo.metaPropuesta, montoGestionComercialTotal: calculo.montoGestionComercialTotal, metaTotalConGestion: calculo.metaTotalConGestion, unidadSolicitanteIds: alcance.unidadIds }), id],
        );
        const propuesta = alcance.unidadIds
          ? calculo.filas.filter((row) => row.unidadNegocioId !== null && alcance.unidadIds?.includes(row.unidadNegocioId))
          : calculo.filas;
        const metaVisible = propuesta.reduce((sum, row) => sum + row.sugerido, 0);
        return alcance.unidadIds
          ? { id, lineas: propuesta.length, metaUnidadPropuesta: metaVisible }
          : { id, lineas: calculo.filas.length, metaBase: calculo.metaBase, metaPropuesta: calculo.metaPropuesta, montoGestionComercialTotal: calculo.montoGestionComercialTotal, metaTotalConGestion: calculo.metaTotalConGestion, premisas: { tipo: "participacion", ...snapshotCompleto } };
      }
      const rows = await filasPresupuestoBase(tx, anio);
      const calculables: Array<Record<string, any> & { mes: number; sucursalId: string | null; unidadNegocioId: string | null; base: number }> = rows.rows.map((row) => ({
        ...row,
        mes: Number(row.mes),
        sucursalId: row.sucursalId,
        unidadNegocioId: row.unidadNegocioId,
        base: Number(row.basePresupuesto ?? 0),
      }));
      const propuestas = aplicarPremisasConjunto(calculables, premisas ?? []);
      await tx.query("DELETE FROM presupuestos_versiones_lineas WHERE version_id = $1::uuid", [id]);
      for (const row of propuestas) {
        await tx.query(
          `INSERT INTO presupuestos_versiones_lineas (version_id, mes, sucursal_id, unidad_negocio_id, historico, sugerido, monto, fuente)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $6, 'premisas')`,
          [id, row.mes, row.sucursalId, row.unidadNegocioId, row.realBase, row.sugerido],
        );
      }
      await tx.query(
        "UPDATE presupuestos_versiones SET premisas = $1::jsonb, estado = 'propuesto', updated_at = now() WHERE id = $2::uuid",
        [JSON.stringify(premisas), id],
      );
      return { id, lineas: propuestas.length, premisas };
    });
    if (result) res.json(result);
  });

  router.post("/presupuestos/versiones/:id/aprobar", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    if (value.role === "gerente_comercial") { res.status(403).json({ message: "La aprobación de versiones corresponde a gerencia nacional." }); return; }
    const result = await run(res, value, async (tx) => {
      const candidate = await tx.query("SELECT anio, premisas FROM presupuestos_versiones WHERE id = $1::uuid AND estado = 'propuesto'", [req.params.id]);
      if (!candidate.rows[0]) throw new Error("NOT_FOUND");
      if ((candidate.rows[0].premisas as Record<string, unknown> | null)?.tipo === "plan_comercial_unidad") {
        throw new Error("PRESUPUESTO_INVALIDO:Un plan comercial de unidad no puede aprobarse como presupuesto anual completo.");
      }
      const anioCandidato = Number(candidate.rows[0].anio);
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('presupuesto-anual'), $1)", [anioCandidato]);
      const ultimaAprobada = await tx.query(
        "SELECT id FROM presupuestos_versiones WHERE anio = $1 AND estado = 'aprobado' ORDER BY aprobado_at DESC NULLS LAST, created_at DESC LIMIT 1",
        [anioCandidato],
      );
      const premisasSnapshot = candidate.rows[0].premisas as Record<string, unknown> | null;
      if (premisasSnapshot?.tipo === "participacion" && (premisasSnapshot.versionBaseId ?? null) !== (ultimaAprobada.rows[0]?.id ?? null)) {
        throw new Error("PRESUPUESTO_INVALIDO:Esta propuesta parte de una versión anterior. Genera una nueva revisión antes de aprobarla.");
      }
      const totalPropuesto = await tx.query(
        `SELECT COALESCE(SUM(l.monto), 0)::numeric AS total FROM presupuestos_versiones_lineas l WHERE l.version_id = $1::uuid`,
        [req.params.id],
      );
      const totalAprobadoVersiones = await tx.query(
        `SELECT COALESCE(SUM(l.monto), 0)::numeric AS total
         FROM presupuestos_versiones v JOIN presupuestos_versiones_lineas l ON l.version_id = v.id
         WHERE v.anio = $1 AND v.estado = 'aprobado'`,
        [anioCandidato],
      );
      const hayMetaAprobada = Number(totalAprobadoVersiones.rows[0]?.total ?? 0) > 0;
      const totalOficialInicial = hayMetaAprobada ? { rows: [{ total: 0 }] } : await tx.query(
        "SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM presupuestos WHERE anio = $1",
        [anioCandidato],
      );
      const metaMinima = hayMetaAprobada
        ? Number(totalAprobadoVersiones.rows[0]?.total ?? 0)
        : Number(totalOficialInicial.rows[0]?.total ?? 0);
      if (Number(totalPropuesto.rows[0]?.total ?? 0) + 0.005 < metaMinima) {
        throw new Error("PRESUPUESTO_INVALIDO:La meta anual aprobada no puede disminuir.");
      }
      await tx.query("UPDATE presupuestos_versiones SET estado = 'archivado', updated_at = now() WHERE anio = $1 AND estado = 'aprobado'", [anioCandidato]);
      const version = await tx.query(
        `UPDATE presupuestos_versiones SET estado = 'aprobado', aprobado_por = $1::uuid, aprobado_at = now(), updated_at = now()
         WHERE id = $2::uuid AND estado = 'propuesto' RETURNING id, anio, estado, aprobado_at AS "aprobadoAt"`,
        [value.user.id, req.params.id],
      );
      if (!version.rows[0]) throw new Error("NOT_FOUND");
      const anio = version.rows[0].anio;
      const lineas = await tx.query(
        `SELECT mes, sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId", monto FROM presupuestos_versiones_lineas WHERE version_id = $1::uuid`,
        [req.params.id],
      );
      // The table has no unique constraint for year/month/branch/unit and can
      // contain duplicate imported rows. Clear all target metas first, then
      // write each grouped allocation into one row so duplicates cannot
      // multiply the approved annual total.
      await tx.query("UPDATE presupuestos SET monto = 0 WHERE anio = $1", [anio]);
      // Aplica la versión aprobada a los presupuestos oficiales del año objetivo:
      // actualiza si ya existe la combinación mes/sucursal/unidad, inserta si no —
      // sin esto "aprobar" solo cambiaba de estado sin que el resto del dashboard
      // (Resumen, Gerencia Nacional) viera la nueva meta.
      for (const linea of lineas.rows) {
        const updated = await tx.query(
          `UPDATE presupuestos SET monto = $5
           WHERE id = (SELECT id FROM presupuestos
             WHERE anio = $1 AND mes = $2 AND sucursal_id IS NOT DISTINCT FROM $3::uuid AND unidad_negocio_id IS NOT DISTINCT FROM $4::uuid
             ORDER BY id LIMIT 1)
           RETURNING id`,
          [anio, linea.mes, linea.sucursalId, linea.unidadNegocioId, linea.monto],
        );
        if (updated.rows.length === 0) {
          await tx.query(
            `INSERT INTO presupuestos (anio, mes, sucursal_id, unidad_negocio_id, monto) VALUES ($1, $2, $3::uuid, $4::uuid, $5)`,
            [anio, linea.mes, linea.sucursalId, linea.unidadNegocioId, linea.monto],
          );
        }
      }
      return { ...version.rows[0], lineasAplicadas: lineas.rows.length };
    });
    if (result) res.json(result);
  });

  router.post("/presupuestos/proyeccion-anual", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const baseAnio = Number(req.body?.baseAnio);
    const targetAnio = Number(req.body?.targetAnio);
    if (!anioValido(baseAnio) || !anioValido(targetAnio)) { res.status(400).json({ message: "Los años no son válidos." }); return; }
    if (req.body?.modo !== "distribucion") {
      const premisas = premisasDeBody(req.body ?? {});
      if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
      if (value.role === "gerente_comercial") { res.status(403).json({ message: "Gerencia Comercial debe consultar la proyección por distribución de su unidad." }); return; }
      const result = await run(res, value, (tx) => filasPresupuestoBase(tx, baseAnio));
      if (!result) return;
      const calculables: Array<Record<string, any> & { mes: number; sucursalId: string | null; unidadNegocioId: string | null; base: number }> = result.rows.map((r) => ({
        ...r,
        mes: Number(r.mes),
        sucursalId: r.sucursalId,
        unidadNegocioId: r.unidadNegocioId,
        base: Number(r.basePresupuesto ?? 0),
      }));
      const conSugerido = aplicarPremisasConjunto(calculables, premisas);
      res.json({ baseAnio, targetAnio, premisas, rows: conSugerido });
      return;
    }

    const result = await run(res, value, async (tx) => {
      const contexto = await contextoPresupuesto(tx, baseAnio, targetAnio);
      const crecimientoInicial = contexto.origen === "anio_anterior" ? 5 : 0;
      const gestionPorUnidad = gestionConfigDePremisas(contexto.premisasBase);
      const configuracionSolicitada = req.body?.distribucion === undefined
        ? distribucionInicial(contexto.filas, crecimientoInicial, gestionPorUnidad.porcentajes, gestionPorUnidad.montos)
        : distribucionDeBody(req.body.distribucion);
      const configuracionInicial = configuracionSolicitada
        ? aplicarPermisosDeRol(value.role, contexto, configuracionSolicitada, crecimientoInicial)
        : null;
      if (!configuracionInicial) throw new Error("PRESUPUESTO_INVALIDO:La distribución no es válida.");
      const configuracionConGestionFijada: DistribucionPresupuesto = {
        ...configuracionInicial,
        unidades: configuracionInicial.unidades.map((unidad) => ({
          ...unidad,
          gestionComercialMonto:
            gestionPorUnidad.montos.get(unidad.unidadNegocioId ?? "__sin_id__") ?? null,
        })),
      };
      const enviada = value.role === "gerente_comercial"
        ? { ...configuracionConGestionFijada, crecimientoAnualPct: 0, unidades: [] }
        : configuracionConGestionFijada;
      const alcance = aplicarAlcanceDistribucion(value, contexto.filas, enviada, gestionPorUnidad);
      const config = alcance.distribucion;
      const metaMinima = contexto.filas.reduce((sum, row) => sum + row.basePresupuesto, 0);
      const calculo = calcularDistribucionPresupuesto(contexto.filas, config, metaMinima);
      if (calculo.errores.length > 0) {
        if (alcance.unidadIds) {
          const scope = new Set(alcance.unidadIds);
          const filasBaseVisibles = contexto.filas.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
          const unidadesVisibles = config.unidades.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
          const sucursalesVisibles = config.sucursales.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
          const mesesVisibles = config.meses.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
          return {
            contexto,
            config: { crecimientoAnualPct: 0, unidades: unidadesVisibles, sucursales: sucursalesVisibles, meses: mesesVisibles },
            calculo: {
              ...calculo,
              metaBase: filasBaseVisibles.reduce((sum, row) => sum + row.basePresupuesto, 0),
              metaPropuesta: filasBaseVisibles.reduce((sum, row) => sum + row.basePresupuesto, 0),
              metaTotalConGestion: filasBaseVisibles.reduce((sum, row) => sum + row.basePresupuesto, 0),
              totalesUnidad: calculo.totalesUnidad.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)),
              errores: calculo.errores.filter((error) => alcance.unidadIds!.some((id) => error.includes(id))),
              filas: [],
            },
            metaMinima: filasBaseVisibles.reduce((sum, row) => sum + row.basePresupuesto, 0),
            unidadIds: alcance.unidadIds,
          };
        }
        return { contexto, config, calculo, metaMinima, unidadIds: alcance.unidadIds };
      }
      if (alcance.unidadIds) {
        const scope = new Set(alcance.unidadIds);
        const filas = calculo.filas.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
        const baseScope = contexto.filas.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId));
        const configVisible: DistribucionPresupuesto = {
          crecimientoAnualPct: 0,
          unidades: config.unidades.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)),
          sucursales: config.sucursales.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)),
          meses: config.meses.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)),
        };
        return {
          contexto,
          config: configVisible,
          calculo: { ...calculo, filas },
          metaMinima: baseScope.reduce((sum, row) => sum + row.basePresupuesto, 0),
          metaBase: baseScope.reduce((sum, row) => sum + row.basePresupuesto, 0),
          totalesUnidad: calculo.totalesUnidad.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)),
          montoGestionComercialTotal: calculo.totalesUnidad.filter((row) => row.unidadNegocioId !== null && scope.has(row.unidadNegocioId)).reduce((sum, row) => sum + row.gestionComercialMonto, 0),
          metaTotalConGestion: filas.reduce((sum, row) => sum + row.sugerido, 0),
          unidadIds: alcance.unidadIds,
        };
      }
      return { contexto, config, calculo, metaMinima, unidadIds: null };
    });
    if (!result) return;
    res.json({
      baseAnio: result.contexto.anioBaseUsado,
      targetAnio,
      versionBaseId: result.contexto.versionBaseId,
      distribucion: result.config,
      metaBase: result.metaBase ?? result.calculo.metaBase,
      metaMinima: result.metaMinima,
      metaPropuesta: result.unidadIds
        ? (result.calculo.filas as Array<{ sugerido: number }>).reduce((sum, row) => sum + row.sugerido, 0)
        : result.calculo.metaPropuesta,
      montoGestionComercialTotal: result.montoGestionComercialTotal ?? result.calculo.montoGestionComercialTotal,
      metaTotalConGestion: result.metaTotalConGestion ?? result.calculo.metaTotalConGestion,
      totalesUnidad: result.totalesUnidad ?? result.calculo.totalesUnidad,
      unidadMetaAsignada: result.unidadIds
        ? (result.calculo.filas as Array<{ sugerido: number }>).reduce((sum, row) => sum + row.sugerido, 0)
        : undefined,
      errores: result.unidadIds
        ? result.calculo.errores.filter((error) => result.unidadIds!.some((id) => error.includes(id)))
        : result.calculo.errores,
      rows: result.calculo.filas,
    });
  });

  return router;
}
