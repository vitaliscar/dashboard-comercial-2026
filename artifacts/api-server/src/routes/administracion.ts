import { Router, type Request, type Response } from "express";
import { hash } from "@node-rs/argon2";
import type { SessionPayload } from "./auth";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
type SessionLoader = (req: Request) => Promise<SessionPayload | null>;
type Transaction = <T>(session: SessionPayload, fn: (tx: Queryable) => Promise<T>) => Promise<T>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(["gerencia", "gerente_comercial", "coordinador", "asesor"]);

function id(value: unknown) { return typeof value === "string" && UUID.test(value) ? value : null; }
function optionalId(value: unknown) { return value == null || value === "" ? null : id(value); }
function string(value: unknown, max = 255) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

export default function administracionRouter(currentSession: SessionLoader, withScopedTransaction: Transaction) {
  const router = Router();
  async function gerencia(req: Request, res: Response, admin = false) {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
    if (session.role !== "gerencia" || (admin && !session.profile.isAdmin)) {
      res.status(403).json({ message: admin ? "Solo Gerencia administradora puede administrar ajustes manuales." : "Solo Gerencia puede administrar usuarios y carga." });
      return null;
    }
    return session;
  }
  async function run<T>(res: Response, session: SessionPayload, fn: (tx: Queryable) => Promise<T>) {
    try { return await withScopedTransaction(session, fn); }
    catch (error) { res.status(500).json({ message: "No se pudo completar la operación." }); reqLog(res, error); return undefined; }
  }
  function reqLog(res: Response, error: unknown) { res.req?.log?.error?.({ error }, "administracion failed"); }

  router.get("/usuarios", async (req, res) => {
    const session = await gerencia(req, res); if (!session) return;
    const result = await run(res, session, async (tx) => {
      const [profiles, roles, profileUnidades, profileSucursales, users] = await Promise.all([
        tx.query(`SELECT id, email, nombre_completo AS "nombreCompleto", sucursal_id AS "sucursalId", unidad_negocio_id AS "unidadNegocioId", is_admin AS "isAdmin", created_at AS "createdAt" FROM profiles ORDER BY nombre_completo`),
        tx.query(`SELECT user_id AS "userId", role FROM user_roles`),
        tx.query(`SELECT profile_id AS "profileId", unidad_negocio_id AS "unidadNegocioId" FROM profile_unidades_negocio`),
        tx.query(`SELECT profile_id AS "profileId", sucursal_id AS "sucursalId" FROM profile_sucursales`),
        tx.query(`SELECT id, email, is_active AS "isActive" FROM users`),
      ]);
      return { profiles: profiles.rows, roles: roles.rows, profileUnidades: profileUnidades.rows, profileSucursales: profileSucursales.rows, users: users.rows };
    }); if (result) res.json(result);
  });

  router.post("/usuarios", async (req, res) => {
    const session = await gerencia(req, res); if (!session) return;
    const email = string(req.body?.email)?.toLowerCase(), password = req.body?.password;
    const nombre = string(req.body?.nombreCompleto), role = req.body?.role;
    const sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8 || password.length > 128 || !nombre || !ROLES.has(role) || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId)) { res.status(400).json({ message: "Los datos del usuario no son válidos." }); return; }
    try {
      const result = await withScopedTransaction(session, async (tx) => {
        if ((await tx.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email])).rows[0]) throw new Error("DUPLICATE");
        const passwordHash = await hash(password);
        const user = (await tx.query("INSERT INTO users (email, password_hash, is_active) VALUES ($1, $2, true) RETURNING id", [email, passwordHash])).rows[0];
        await tx.query("INSERT INTO profiles (id, email, nombre_completo, sucursal_id, unidad_negocio_id) VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid)", [user.id, email, nombre, sucursalId, unidadId]);
        await tx.query("INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, $2::app_role)", [user.id, role]);
        if (sucursalId) await tx.query("INSERT INTO profile_sucursales (profile_id, sucursal_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING", [user.id, sucursalId]);
        return { success: true, userId: user.id };
      }); res.status(201).json(result);
    } catch (error) { res.status((error as Error).message === "DUPLICATE" ? 409 : 500).json({ message: (error as Error).message === "DUPLICATE" ? "Ya existe un usuario con ese correo." : "No se pudo crear el usuario." }); }
  });

  router.patch("/usuarios/:id", async (req, res) => {
    const session = await gerencia(req, res); const userId = id(req.params.id); if (!session) return;
    if (!userId) { res.status(400).json({ message: "Usuario no válido." }); return; }
    const role = req.body?.role, isAdmin = req.body?.isAdmin, isActive = req.body?.isActive;
    const sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    if ((role !== undefined && !ROLES.has(role)) || (isAdmin !== undefined && typeof isAdmin !== "boolean") || (isActive !== undefined && typeof isActive !== "boolean") || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId)) { res.status(400).json({ message: "Actualización no válida." }); return; }
    const result = await run(res, session, async (tx) => {
      if (role !== undefined) { await tx.query("DELETE FROM user_roles WHERE user_id = $1::uuid", [userId]); await tx.query("INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, $2::app_role)", [userId, role]); }
      if (isActive !== undefined) { await tx.query("UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2::uuid", [isActive, userId]); if (!isActive) await tx.query("DELETE FROM sessions WHERE user_id = $1::uuid", [userId]); }
      if (isAdmin !== undefined || req.body?.sucursalId !== undefined || req.body?.unidadNegocioId !== undefined) await tx.query("UPDATE profiles SET is_admin = COALESCE($1, is_admin), sucursal_id = CASE WHEN $2 THEN $3::uuid ELSE sucursal_id END, unidad_negocio_id = CASE WHEN $4 THEN $5::uuid ELSE unidad_negocio_id END, updated_at = now() WHERE id = $6::uuid", [isAdmin ?? null, req.body?.sucursalId !== undefined, sucursalId, req.body?.unidadNegocioId !== undefined, unidadId, userId]);
      return { success: true };
    }); if (result) res.json(result);
  });

  router.post("/usuarios/:id/password", async (req, res) => {
    const session = await gerencia(req, res); const userId = id(req.params.id), password = req.body?.newPassword;
    if (!session) return; if (!userId || typeof password !== "string" || password.length < 8 || password.length > 128) { res.status(400).json({ message: "La contraseña debe tener entre 8 y 128 caracteres." }); return; }
    const result = await run(res, session, async (tx) => { await tx.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2::uuid", [await hash(password), userId]); await tx.query("DELETE FROM sessions WHERE user_id = $1::uuid", [userId]); return { success: true }; }); if (result) res.json(result);
  });

  router.delete("/usuarios/:id", async (req, res) => {
    const session = await gerencia(req, res); const userId = id(req.params.id); if (!session) return;
    if (!userId || userId === session.user.id) { res.status(400).json({ message: "No puedes eliminar este usuario." }); return; }
    const result = await run(res, session, async (tx) => { await tx.query("DELETE FROM users WHERE id = $1::uuid", [userId]); return { success: true }; }); if (result) res.json(result);
  });

  router.get("/ajustes-manuales", async (req, res) => {
    const session = await gerencia(req, res, true); if (!session) return; const anio = Number(req.query.anio);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) { res.status(400).json({ message: "El año no es válido." }); return; }
    const rows = await run(res, session, async (tx) => (await tx.query(`SELECT a.id, a.anio, a.mes, a.monto, a.motivo, a.created_at AS "createdAt", a.sucursal_id AS "sucursalId", a.unidad_negocio_id AS "unidadNegocioId", COALESCE(s.nombre, 'Todas') AS sucursal, COALESCE(u.nombre, 'Todas') AS unidad, COALESCE(p.nombre_completo, '—') AS "creadoPor" FROM ajustes_manuales a LEFT JOIN sucursales s ON s.id = a.sucursal_id LEFT JOIN unidades_negocio u ON u.id = a.unidad_negocio_id LEFT JOIN profiles p ON p.id = a.creado_por WHERE a.anio = $1 ORDER BY a.created_at DESC`, [anio])).rows); if (rows) res.json(rows);
  });
  router.post("/ajustes-manuales", async (req, res) => {
    const session = await gerencia(req, res, true); if (!session) return; const anio = Number(req.body?.anio), mes = Number(req.body?.mes), monto = Number(req.body?.monto), motivo = string(req.body?.motivo, 2000), sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isFinite(monto) || !motivo || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId)) { res.status(400).json({ message: "Los datos del ajuste no son válidos." }); return; }
    const row = await run(res, session, async (tx) => (await tx.query("INSERT INTO ajustes_manuales (anio, mes, sucursal_id, unidad_negocio_id, monto, motivo, creado_por) VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7::uuid) RETURNING id", [anio, mes, sucursalId, unidadId, monto, motivo, session.user.id])).rows[0]); if (row) res.status(201).json(row);
  });
  router.delete("/ajustes-manuales/:id", async (req, res) => {
    const session = await gerencia(req, res, true); const adjustmentId = id(req.params.id); if (!session) return; if (!adjustmentId) { res.status(400).json({ message: "Ajuste no válido." }); return; }
    const result = await run(res, session, async (tx) => { await tx.query("DELETE FROM ajustes_manuales WHERE id = $1::uuid", [adjustmentId]); return { success: true }; }); if (result) res.json(result);
  });
  return router;
}