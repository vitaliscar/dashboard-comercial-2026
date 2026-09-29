import { Router, type Request, type Response } from "express";
import type { SessionPayload } from "./auth";
import { aplicarPremisas, premisaGlobalLegacy, validarPremisas, type FilaBase, type Premisa } from "../lib/premisas";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
type SessionLoader = (req: Request) => Promise<SessionPayload | null>;
type Transaction = <T>(session: SessionPayload, fn: (tx: Queryable) => Promise<T>) => Promise<T>;

// Roles que pueden ver o tocar este módulo (financiero) — coordinador/asesor nunca
// deben leer presupuesto/facturación de toda la empresa. Debe coincidir con
// MODULE_ACCESS["presupuestos"] en el frontend (src/lib/permissions.ts).
const ALLOWED_ROLES = ["administrador", "gerencia", "gerente_comercial"];

const ESCENARIOS = ["conservador", "base", "optimista"];

function premisasDeBody(body: Record<string, unknown>): Premisa[] | null {
  if (Array.isArray(body["premisas"])) return validarPremisas(body["premisas"]);
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
    const rows = await run(res, value, (tx) => tx.query(`
      SELECT p.mes, p.sucursal_id AS "sucursalId", s.nombre AS sucursal,
        p.unidad_negocio_id AS "unidadNegocioId", u.nombre AS unidad,
        SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas)::numeric AS historico,
        SUM(p.monto)::numeric AS "presupuestoOficial"
      FROM presupuestos p
      LEFT JOIN sucursales s ON s.id = p.sucursal_id
      LEFT JOIN unidades_negocio u ON u.id = p.unidad_negocio_id
      WHERE p.anio = $1
      GROUP BY p.mes, p.sucursal_id, s.nombre, p.unidad_negocio_id, u.nombre
      ORDER BY p.mes, sucursal, unidad`, [anio]));
    if (rows) res.json(rows.rows);
  });

  router.get("/presupuestos/versiones", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.query.anio);
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const rows = await run(res, value, (tx) => tx.query(
      `SELECT id, anio, nombre, escenario, estado, descripcion, premisas, creado_por AS "creadoPor",
        aprobado_por AS "aprobadoPor", aprobado_at AS "aprobadoAt",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM presupuestos_versiones WHERE anio = $1 ORDER BY created_at DESC`,
      [anio],
    ));
    if (rows) res.json(rows.rows);
  });

  router.post("/presupuestos/versiones", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.body?.anio);
    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : "";
    const escenario = req.body?.escenario;
    const descripcion = typeof req.body?.descripcion === "string" ? req.body.descripcion.trim() : null;
    if (!anioValido(anio) || !nombre || nombre.length > 120 || !ESCENARIOS.includes(escenario)) {
      res.status(400).json({ message: "Los datos de la versión no son válidos." }); return;
    }
    const premisas = premisasDeBody(req.body ?? {});
    if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
    const row = await run(res, value, (tx) => tx.query(
      `INSERT INTO presupuestos_versiones (anio, nombre, escenario, descripcion, premisas, creado_por)
       VALUES ($1, $2, $3::presupuesto_escenario, $4, $5::jsonb, $6::uuid)
       RETURNING id, anio, nombre, escenario, estado, descripcion, premisas, created_at AS "createdAt"`,
      [anio, nombre, escenario, descripcion, JSON.stringify(premisas), value.user.id],
    ));
    if (row) res.status(201).json(row.rows[0]);
  });

  router.post("/presupuestos/sugerencia", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.body?.anio);
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const premisas = premisasDeBody(req.body ?? {});
    if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
    const rows = await run(res, value, (tx) => tx.query(`
      SELECT p.mes, p.sucursal_id AS "sucursalId", s.nombre AS sucursal, p.unidad_negocio_id AS "unidadNegocioId", u.nombre AS unidad,
        SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas)::numeric AS historico,
        SUM(p.monto)::numeric AS "presupuestoOficial"
      FROM presupuestos p LEFT JOIN sucursales s ON s.id = p.sucursal_id LEFT JOIN unidades_negocio u ON u.id = p.unidad_negocio_id
      WHERE p.anio = $1 GROUP BY p.mes, p.sucursal_id, s.nombre, p.unidad_negocio_id, u.nombre ORDER BY p.mes, sucursal, unidad`, [anio]));
    if (!rows) return;
    const conSugerido = rows.rows.map((r) => {
      const fila: FilaBase = { mes: r.mes, sucursalId: r.sucursalId, unidadNegocioId: r.unidadNegocioId, base: Number(r.historico ?? 0) };
      return { ...r, sugerido: aplicarPremisas(fila, premisas) };
    });
    res.json({ anio, premisas, rows: conSugerido });
  });

  router.post("/presupuestos/versiones/:id/generar", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const anio = Number(req.body?.anio);
    const id = req.params.id;
    if (!anioValido(anio)) { res.status(400).json({ message: "El año no es válido." }); return; }
    const premisas = premisasDeBody(req.body ?? {});
    if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
    const result = await run(res, value, async (tx) => {
      const exists = await tx.query("SELECT id FROM presupuestos_versiones WHERE id = $1::uuid", [id]);
      if (!exists.rows[0]) throw new Error("NOT_FOUND");
      const rows = await tx.query(`
        SELECT p.mes, p.sucursal_id AS "sucursalId", p.unidad_negocio_id AS "unidadNegocioId",
          SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas)::numeric AS historico
        FROM presupuestos p WHERE p.anio = $1 GROUP BY p.mes, p.sucursal_id, p.unidad_negocio_id`, [anio]);
      await tx.query("DELETE FROM presupuestos_versiones_lineas WHERE version_id = $1::uuid", [id]);
      for (const row of rows.rows) {
        const fila: FilaBase = { mes: row.mes, sucursalId: row.sucursalId, unidadNegocioId: row.unidadNegocioId, base: Number(row.historico ?? 0) };
        const sugerido = aplicarPremisas(fila, premisas);
        await tx.query(
          `INSERT INTO presupuestos_versiones_lineas (version_id, mes, sucursal_id, unidad_negocio_id, historico, sugerido, monto, fuente)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $6, 'premisas')`,
          [id, row.mes, row.sucursalId, row.unidadNegocioId, row.historico, sugerido],
        );
      }
      await tx.query(
        "UPDATE presupuestos_versiones SET premisas = $1::jsonb, estado = 'propuesto', updated_at = now() WHERE id = $2::uuid",
        [JSON.stringify(premisas), id],
      );
      return { id, lineas: rows.rows.length, premisas };
    });
    if (result) res.json(result);
  });

  router.post("/presupuestos/versiones/:id/aprobar", async (req, res) => {
    const value = await scopedSession(req, res); if (!value) return;
    const result = await run(res, value, async (tx) => {
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
      // Aplica la versión aprobada a los presupuestos oficiales del año objetivo:
      // actualiza si ya existe la combinación mes/sucursal/unidad, inserta si no —
      // sin esto "aprobar" solo cambiaba de estado sin que el resto del dashboard
      // (Resumen, Gerencia Nacional) viera la nueva meta.
      for (const linea of lineas.rows) {
        const updated = await tx.query(
          `UPDATE presupuestos SET monto = $5
           WHERE anio = $1 AND mes = $2 AND sucursal_id IS NOT DISTINCT FROM $3::uuid AND unidad_negocio_id IS NOT DISTINCT FROM $4::uuid
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
    const premisas = premisasDeBody(req.body ?? {});
    if (!premisas) { res.status(400).json({ message: "Las premisas no son válidas." }); return; }
    const result = await run(res, value, (tx) => tx.query(`
      SELECT p.mes, p.sucursal_id AS "sucursalId", s.nombre AS sucursal, p.unidad_negocio_id AS "unidadNegocioId", u.nombre AS unidad,
        SUM(p.monto)::numeric AS "basePresupuesto", SUM(p.ventas_ccv + p.ventas_xibi + p.ventas_estrategicas)::numeric AS "realBase"
      FROM presupuestos p LEFT JOIN sucursales s ON s.id = p.sucursal_id LEFT JOIN unidades_negocio u ON u.id = p.unidad_negocio_id
      WHERE p.anio = $1 GROUP BY p.mes, p.sucursal_id, s.nombre, p.unidad_negocio_id, u.nombre ORDER BY p.mes, sucursal, unidad`, [baseAnio]));
    if (!result) return;
    const conSugerido = result.rows.map((r) => {
      const fila: FilaBase = { mes: r.mes, sucursalId: r.sucursalId, unidadNegocioId: r.unidadNegocioId, base: Number(r.basePresupuesto ?? 0) };
      return { ...r, sugerido: aplicarPremisas(fila, premisas) };
    });
    res.json({ baseAnio, targetAnio, premisas, rows: conSugerido });
  });

  return router;
}
