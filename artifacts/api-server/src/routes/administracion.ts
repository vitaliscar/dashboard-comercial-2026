import { Router, type Request, type Response } from "express";
import { hash } from "@node-rs/argon2";
import { isFullAccessRole, type SessionPayload } from "./auth";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };
type SessionLoader = (req: Request) => Promise<SessionPayload | null>;
type Transaction = <T>(session: SessionPayload, fn: (tx: Queryable) => Promise<T>) => Promise<T>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(["administrador", "gerencia", "gerente_comercial", "coordinador", "asesor"]);

function id(value: unknown) { return typeof value === "string" && UUID.test(value) ? value : null; }
function optionalId(value: unknown) { return value == null || value === "" ? null : id(value); }
function idList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const items = value.map(id);
  if (items.some((item) => item === null) || new Set(items).size !== items.length) return null;
  return items as string[];
}
function scopeRequired(role: string, unidadIds: string[], sucursalIds: string[]) {
  return (role === "gerente_comercial" && unidadIds.length === 0) ||
    ((role === "coordinador" || role === "asesor") && sucursalIds.length === 0);
}
function string(value: unknown, max = 255) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}

export default function administracionRouter(currentSession: SessionLoader, withScopedTransaction: Transaction) {
  const router = Router();

  /** Listar/editar usuarios: administrador o gerencia. */
  async function fullAccess(req: Request, res: Response) {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
    if (!isFullAccessRole(session.role)) {
      res.status(403).json({ message: "Solo Gerencia Nacional o Administrador puede administrar usuarios." });
      return null;
    }
    return session;
  }

  /** Crear/eliminar usuarios: solo administrador. */
  async function adminOnly(req: Request, res: Response) {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
    if (session.role !== "administrador") {
      res.status(403).json({ message: "Solo Administrador puede crear o eliminar usuarios." });
      return null;
    }
    return session;
  }

  /** Ajustes manuales: administrador, o gerencia con is_admin. */
  async function ajustesAccess(req: Request, res: Response) {
    const session = await currentSession(req);
    if (!session) { res.status(401).json({ message: "Sesión no válida." }); return null; }
    if (session.role === "administrador" || (session.role === "gerencia" && session.profile.isAdmin)) {
      return session;
    }
    res.status(403).json({ message: "Solo Gerencia administradora puede administrar ajustes manuales." });
    return null;
  }

  async function run<T>(res: Response, session: SessionPayload, fn: (tx: Queryable) => Promise<T>) {
    try { return await withScopedTransaction(session, fn); }
    catch (error) {
      const code = error instanceof Error ? error.message : "";
      const known: Record<string, { status: number; message: string }> = {
        SCOPE_REQUIRED: { status: 400, message: "Asigna al menos una unidad para Gerencia Comercial o una sucursal para Coordinación y Asesoría." },
        ADJUSTMENT_SCOPE_INVALID: { status: 400, message: "La sucursal o unidad seleccionada no existe, está inactiva o no está disponible." },
        USER_NOT_FOUND: { status: 404, message: "No se encontró el usuario." },
        ADMIN_TARGET: { status: 403, message: "Gerencia Nacional no puede modificar una cuenta Administrador." },
      };
      if (known[code]) { res.status(known[code].status).json({ message: known[code].message }); return undefined; }
      res.status(500).json({ message: "No se pudo completar la operación." }); reqLog(res, error); return undefined;
    }
  }
  function reqLog(res: Response, error: unknown) { res.req?.log?.error?.({ error }, "administracion failed"); }

  router.get("/usuarios", async (req, res) => {
    const session = await fullAccess(req, res); if (!session) return;
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
    const session = await adminOnly(req, res); if (!session) return;
    const email = string(req.body?.email)?.toLowerCase(), password = req.body?.password;
    const nombre = string(req.body?.nombreCompleto), role = req.body?.role;
    const sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    const sucursalIds = req.body?.sucursalIds === undefined ? (sucursalId ? [sucursalId] : []) : idList(req.body.sucursalIds);
    const unidadIds = req.body?.unidadNegocioIds === undefined ? (unidadId ? [unidadId] : []) : idList(req.body.unidadNegocioIds);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 8 || password.length > 128 || !nombre || !ROLES.has(role) || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId) || !sucursalIds || !unidadIds || scopeRequired(role, unidadIds, sucursalIds)) { res.status(400).json({ message: "Completa una asignación válida: Gerencia Comercial requiere al menos una unidad; Coordinación y Asesoría requieren al menos una sucursal." }); return; }
    // Solo administrador puede asignar el rol administrador.
    if (role === "administrador" && session.role !== "administrador") {
      res.status(403).json({ message: "Solo Administrador puede asignar el rol administrador." });
      return;
    }
    try {
      const result = await withScopedTransaction(session, async (tx) => {
        if ((await tx.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email])).rows[0]) throw new Error("DUPLICATE");
        const passwordHash = await hash(password);
        const user = (await tx.query("INSERT INTO users (email, password_hash, is_active, must_change_password) VALUES ($1, $2, true, true) RETURNING id", [email, passwordHash])).rows[0];
        await tx.query("INSERT INTO profiles (id, email, nombre_completo, sucursal_id, unidad_negocio_id) VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid)", [user.id, email, nombre, sucursalIds[0] ?? null, unidadIds[0] ?? null]);
        await tx.query("INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, $2::app_role)", [user.id, role]);
        for (const branchId of sucursalIds) await tx.query("INSERT INTO profile_sucursales (profile_id, sucursal_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING", [user.id, branchId]);
        for (const unitId of unidadIds) await tx.query("INSERT INTO profile_unidades_negocio (profile_id, unidad_negocio_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING", [user.id, unitId]);
        return { success: true, userId: user.id };
      }); res.status(201).json(result);
    } catch (error) { res.status((error as Error).message === "DUPLICATE" ? 409 : 500).json({ message: (error as Error).message === "DUPLICATE" ? "Ya existe un usuario con ese correo." : "No se pudo crear el usuario." }); }
  });

  router.patch("/usuarios/:id", async (req, res) => {
    const session = await fullAccess(req, res); const userId = id(req.params.id); if (!session) return;
    if (!userId) { res.status(400).json({ message: "Usuario no válido." }); return; }
    const role = req.body?.role, isAdmin = req.body?.isAdmin, isActive = req.body?.isActive;
    const sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    const sucursalIds = req.body?.sucursalIds === undefined ? undefined : idList(req.body.sucursalIds);
    const unidadIds = req.body?.unidadNegocioIds === undefined ? undefined : idList(req.body.unidadNegocioIds);
    if ((role !== undefined && !ROLES.has(role)) || (isAdmin !== undefined && typeof isAdmin !== "boolean") || (isActive !== undefined && typeof isActive !== "boolean") || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId) || (req.body?.sucursalIds !== undefined && !sucursalIds) || (req.body?.unidadNegocioIds !== undefined && !unidadIds)) { res.status(400).json({ message: "Actualización no válida." }); return; }
    if (isAdmin !== undefined && session.role !== "administrador") { res.status(403).json({ message: "Solo Administrador puede cambiar el permiso de administración." }); return; }
    if (isActive === false && userId === session.user.id) { res.status(400).json({ message: "No puedes desactivar tu propio usuario." }); return; }
    if (role === "administrador" && session.role !== "administrador") {
      res.status(403).json({ message: "Solo Administrador puede asignar el rol administrador." });
      return;
    }
    const result = await run(res, session, async (tx) => {
      const current = await tx.query("SELECT role FROM user_roles WHERE user_id = $1::uuid ORDER BY CASE role WHEN 'administrador' THEN 0 WHEN 'gerencia' THEN 1 WHEN 'gerente_comercial' THEN 2 WHEN 'coordinador' THEN 3 ELSE 4 END LIMIT 5", [userId]);
      if (!current.rows.length) throw new Error("USER_NOT_FOUND");
      const hasAdminRole = current.rows.some((row) => row.role === "administrador");
      const currentRole = String(current.rows[0].role);
      const nextRole = role ?? currentRole;
      const [currentUnits, currentBranches, legacyProfile] = await Promise.all([
        tx.query("SELECT unidad_negocio_id AS id FROM profile_unidades_negocio WHERE profile_id = $1::uuid", [userId]),
        tx.query("SELECT sucursal_id AS id FROM profile_sucursales WHERE profile_id = $1::uuid", [userId]),
        tx.query("SELECT unidad_negocio_id AS \"unidadId\", sucursal_id AS \"sucursalId\" FROM profiles WHERE id = $1::uuid", [userId]),
      ]);
      const legacy = legacyProfile.rows[0] ?? {};
      const resolvedUnits = unidadIds ?? (req.body?.unidadNegocioId !== undefined ? (unidadId ? [unidadId] : []) : currentUnits.rows.map((row) => String(row.id)).concat(currentUnits.rows.length ? [] : legacy.unidadId ? [String(legacy.unidadId)] : []));
      const resolvedBranches = sucursalIds ?? (req.body?.sucursalId !== undefined ? (sucursalId ? [sucursalId] : []) : currentBranches.rows.map((row) => String(row.id)).concat(currentBranches.rows.length ? [] : legacy.sucursalId ? [String(legacy.sucursalId)] : []));
      if (scopeRequired(nextRole, resolvedUnits, resolvedBranches)) throw new Error("SCOPE_REQUIRED");
      if (session.role === "gerencia" && hasAdminRole) throw new Error("ADMIN_TARGET");
      if (role !== undefined) { await tx.query("DELETE FROM user_roles WHERE user_id = $1::uuid", [userId]); await tx.query("INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, $2::app_role)", [userId, role]); }
      if (isActive !== undefined) { await tx.query("UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2::uuid", [isActive, userId]); if (!isActive) await tx.query("DELETE FROM sessions WHERE user_id = $1::uuid", [userId]); }
      if (isAdmin !== undefined || sucursalIds !== undefined || unidadIds !== undefined || req.body?.sucursalId !== undefined || req.body?.unidadNegocioId !== undefined) await tx.query("UPDATE profiles SET is_admin = COALESCE($1, is_admin), sucursal_id = CASE WHEN $2 THEN $3::uuid ELSE sucursal_id END, unidad_negocio_id = CASE WHEN $4 THEN $5::uuid ELSE unidad_negocio_id END, updated_at = now() WHERE id = $6::uuid", [isAdmin ?? null, sucursalIds !== undefined || req.body?.sucursalId !== undefined, resolvedBranches[0] ?? null, unidadIds !== undefined || req.body?.unidadNegocioId !== undefined, resolvedUnits[0] ?? null, userId]);
      if (sucursalIds !== undefined || req.body?.sucursalId !== undefined) {
        await tx.query("DELETE FROM profile_sucursales WHERE profile_id = $1::uuid", [userId]);
        for (const branchId of resolvedBranches) await tx.query("INSERT INTO profile_sucursales (profile_id, sucursal_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING", [userId, branchId]);
      }
      if (unidadIds !== undefined || req.body?.unidadNegocioId !== undefined) {
        await tx.query("DELETE FROM profile_unidades_negocio WHERE profile_id = $1::uuid", [userId]);
        for (const unitId of resolvedUnits) await tx.query("INSERT INTO profile_unidades_negocio (profile_id, unidad_negocio_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING", [userId, unitId]);
      }
      return { success: true };
    }); if (result) res.json(result);
  });

  router.post("/usuarios/:id/password", async (req, res) => {
    const session = await fullAccess(req, res); const userId = id(req.params.id), password = req.body?.newPassword;
    if (!session) return; if (!userId || typeof password !== "string" || password.length < 8 || password.length > 128) { res.status(400).json({ message: "La contraseña debe tener entre 8 y 128 caracteres." }); return; }
    const result = await run(res, session, async (tx) => {
      const targetRoles = await tx.query("SELECT role FROM user_roles WHERE user_id = $1::uuid", [userId]);
      if (!targetRoles.rows.length) throw new Error("USER_NOT_FOUND");
      if (session.role === "gerencia" && targetRoles.rows.some((row) => row.role === "administrador")) throw new Error("ADMIN_TARGET");
      await tx.query("UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now() WHERE id = $2::uuid", [await hash(password), userId]);
      await tx.query("DELETE FROM sessions WHERE user_id = $1::uuid", [userId]);
      return { success: true };
    }); if (result) res.json(result);
  });

  router.delete("/usuarios/:id", async (req, res) => {
    const session = await adminOnly(req, res); const userId = id(req.params.id); if (!session) return;
    if (!userId || userId === session.user.id) { res.status(400).json({ message: "No puedes eliminar este usuario." }); return; }
    const result = await run(res, session, async (tx) => { await tx.query("DELETE FROM users WHERE id = $1::uuid", [userId]); return { success: true }; }); if (result) res.json(result);
  });

  router.get("/ajustes-manuales", async (req, res) => {
    const session = await ajustesAccess(req, res); if (!session) return; const anio = Number(req.query.anio);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) { res.status(400).json({ message: "El año no es válido." }); return; }
    const rows = await run(res, session, async (tx) => (await tx.query(`SELECT a.id, a.anio, a.mes, a.columna, a.monto, a.motivo, a.created_at AS "createdAt", a.sucursal_id AS "sucursalId", a.unidad_negocio_id AS "unidadNegocioId", COALESCE(s.nombre, 'Todas') AS sucursal, COALESCE(u.nombre, 'Todas') AS unidad, COALESCE(p.nombre_completo, '—') AS "creadoPor" FROM ajustes_manuales a LEFT JOIN sucursales s ON s.id = a.sucursal_id LEFT JOIN unidades_negocio u ON u.id = a.unidad_negocio_id LEFT JOIN profiles p ON p.id = a.creado_por WHERE a.anio = $1 ORDER BY a.created_at DESC`, [anio])).rows); if (rows) res.json(rows);
  });
  router.post("/ajustes-manuales", async (req, res) => {
    const session = await ajustesAccess(req, res); if (!session) return; const anio = Number(req.body?.anio), mes = Number(req.body?.mes), monto = Number(req.body?.monto), motivo = string(req.body?.motivo, 2000), sucursalId = optionalId(req.body?.sucursalId), unidadId = optionalId(req.body?.unidadNegocioId);
    const columnasValidas = ["ccv", "xibi", "estrategico", "total"];
    const columna = columnasValidas.includes(req.body?.columna) ? req.body.columna : "total";
    if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isFinite(monto) || !motivo || (req.body?.sucursalId != null && !sucursalId) || (req.body?.unidadNegocioId != null && !unidadId)) { res.status(400).json({ message: "Los datos del ajuste no son válidos." }); return; }
    const row = await run(res, session, async (tx) => {
      if (sucursalId) {
        const branch = await tx.query("SELECT id FROM sucursales WHERE id = $1::uuid AND activa = true AND visible_general = true", [sucursalId]);
        if (!branch.rows.length) throw new Error("ADJUSTMENT_SCOPE_INVALID");
      }
      if (unidadId) {
        const unit = await tx.query("SELECT id FROM unidades_negocio WHERE id = $1::uuid AND activa = true", [unidadId]);
        if (!unit.rows.length) throw new Error("ADJUSTMENT_SCOPE_INVALID");
      }
      return (await tx.query("INSERT INTO ajustes_manuales (anio, mes, sucursal_id, unidad_negocio_id, columna, monto, motivo, creado_por) VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid) RETURNING id", [anio, mes, sucursalId, unidadId, columna, monto, motivo, session.user.id])).rows[0];
    }); if (row) res.status(201).json(row);
  });
  router.delete("/ajustes-manuales/:id", async (req, res) => {
    const session = await ajustesAccess(req, res); const adjustmentId = id(req.params.id); if (!session) return; if (!adjustmentId) { res.status(400).json({ message: "Ajuste no válido." }); return; }
    const result = await run(res, session, async (tx) => { await tx.query("DELETE FROM ajustes_manuales WHERE id = $1::uuid", [adjustmentId]); return { success: true }; }); if (result) res.json(result);
  });
  return router;
}
