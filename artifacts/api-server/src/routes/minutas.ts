import { Router, type Request, type Response } from "express";
import { currentSession, withScopedTransaction, type SessionPayload } from "./auth";

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = new Set(["pendiente", "en_proceso", "cumplido"]);
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

function uuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}
function date(value: unknown) {
  return typeof value === "string" && DATE_RE.test(value) ? value : null;
}
function text(value: unknown, max = 10000) {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}
function scopes(session: SessionPayload) {
  return {
    branches: session.profile.sucursalesIds?.length
      ? session.profile.sucursalesIds
      : session.profile.sucursalId ? [session.profile.sucursalId] : [],
    units: session.profile.unidadesNegocioIds?.length
      ? session.profile.unidadesNegocioIds
      : session.profile.unidadNegocioId ? [session.profile.unidadNegocioId] : [],
  };
}
function scopeClause(session: SessionPayload, alias: string, start = 1) {
  const { branches, units } = scopes(session);
  if (session.role === "asesor") return { sql: `${alias}.destinatario_id = $${start}::uuid`, values: [session.user.id] };
  if (session.role === "coordinador") return { sql: `${alias}.sucursal_id = ANY($${start}::uuid[])`, values: [branches] };
  if (session.role === "gerente_comercial") return { sql: `${alias}.unidad_negocio_id = ANY($${start}::uuid[])`, values: [units] };
  return { sql: "TRUE", values: [] as unknown[] };
}
async function sessionOr401(req: Request, res: Response) {
  const session = await currentSession(req);
  if (!session) res.status(401).json({ message: "Sesión no válida." });
  else if (!session.role) res.status(403).json({ message: "El usuario no tiene un rol comercial asignado." });
  return session?.role ? session : null;
}
async function accessibleMinuta(tx: Queryable, session: SessionPayload, id: string) {
  const scope = scopeClause(session, "m", 2);
  const result = await tx.query(`SELECT m.id, m.destinatario_id AS "destinatarioId"
    FROM minutas m WHERE m.id = $1::uuid AND ${scope.sql} LIMIT 1`, [id, ...scope.values]);
  return result.rows[0] ?? null;
}
async function recipient(tx: Queryable, id: string) {
  const result = await tx.query(`SELECT p.id, p.sucursal_id AS "sucursalId", p.unidad_negocio_id AS "unidadNegocioId",
    ur.role FROM profiles p INNER JOIN user_roles ur ON ur.user_id = p.id WHERE p.id = $1::uuid`, [id]);
  return result.rows;
}
function allowedRecipient(session: SessionPayload, candidates: Record<string, any>[]) {
  const { branches, units } = scopes(session);
  if (session.role === "gerencia") return candidates.find((row) => ["gerente_comercial", "coordinador", "asesor"].includes(row.role)) ?? null;
  if (session.role === "coordinador") return candidates.find((row) => row.role === "asesor" && branches.includes(row.sucursalId)) ?? null;
  if (session.role === "gerente_comercial") return candidates.find((row) => row.role === "coordinador" && units.includes(row.unidadNegocioId)) ?? null;
  return null;
}

router.get("/minutas", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  try {
    const rows = await withScopedTransaction(session, async (tx) => {
      const scope = scopeClause(session, "m");
      const minutes = await tx.query(`SELECT m.id, m.fecha, m.cliente, m.descripcion, m.fecha_limite AS "fechaLimite",
        m.estado, m.sucursal_id AS "sucursalId", m.unidad_negocio_id AS "unidadNegocioId",
        m.destinatario_id AS "destinatarioId", p.nombre_completo AS "destinatarioNombre",
        m.created_by AS "createdBy", m.created_at AS "createdAt"
        FROM minutas m LEFT JOIN profiles p ON p.id = m.destinatario_id WHERE ${scope.sql} ORDER BY m.fecha DESC`, scope.values);
      if (!minutes.rows.length) return [];
      const ids = minutes.rows.map((row) => row.id);
      const [comments, links] = await Promise.all([
        tx.query(`SELECT id, minuta_id AS "minutaId", autor_id AS "autorId", texto, created_at AS "createdAt"
          FROM minuta_comentarios WHERE minuta_id = ANY($1::uuid[]) ORDER BY created_at`, [ids]),
        tx.query(`SELECT ma.minuta_id AS "minutaId", a.id AS "alertaId", a.tipo, a.severidad, a.titulo, a.estado
          FROM minuta_alertas ma INNER JOIN alertas a ON a.id = ma.alerta_id WHERE ma.minuta_id = ANY($1::uuid[])`, [ids]),
      ]);
      return minutes.rows.map((m) => ({ ...m, comentarios: comments.rows.filter((c) => c.minutaId === m.id), alertas: links.rows.filter((a) => a.minutaId === m.id) }));
    });
    res.json(rows);
  } catch (error) { req.log?.error?.(error); res.status(500).json({ message: "No se pudieron cargar las minutas." }); }
});

router.get("/minutas/destinatarios", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  if (session.role === "asesor") { res.json([]); return; }
  try {
    const rows = await withScopedTransaction(session, async (tx) => {
      const { branches, units } = scopes(session);
      const condition = session.role === "gerencia" ? `ur.role IN ('gerente_comercial','coordinador','asesor')`
        : session.role === "coordinador" ? `ur.role = 'asesor' AND p.sucursal_id = ANY($1::uuid[])`
        : `ur.role = 'coordinador' AND p.unidad_negocio_id = ANY($1::uuid[])`;
      const values = session.role === "gerencia" ? [] : [session.role === "coordinador" ? branches : units];
      return (await tx.query(`SELECT DISTINCT p.id, p.nombre_completo AS "nombreCompleto", ur.role,
        p.sucursal_id AS "sucursalId", p.unidad_negocio_id AS "unidadNegocioId"
        FROM profiles p INNER JOIN user_roles ur ON ur.user_id = p.id WHERE ${condition} ORDER BY p.nombre_completo`, values)).rows;
    });
    res.json(rows);
  } catch (error) { req.log?.error?.(error); res.status(500).json({ message: "No se pudieron cargar los destinatarios." }); }
});

router.get("/minutas/clientes", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const q = text(req.query.q, 120); if (!q || q.length < 2) { res.json([]); return; }
  try {
    const rows = await withScopedTransaction(session, async (tx) => (await tx.query(
      `SELECT cliente FROM (SELECT DISTINCT cliente FROM facturas WHERE cliente ILIKE $1
       UNION SELECT DISTINCT cliente FROM cotizaciones WHERE cliente ILIKE $1
       UNION SELECT DISTINCT cliente FROM ventas_perdidas WHERE cliente ILIKE $1
       UNION SELECT DISTINCT cliente FROM cobranzas WHERE cliente ILIKE $1) clients
       WHERE cliente IS NOT NULL LIMIT 15`, [`%${q}%`])).rows);
    res.json(rows.map((row) => row.cliente));
  } catch (error) { req.log?.error?.(error); res.status(500).json({ message: "No se pudieron buscar clientes." }); }
});

router.get("/minutas/alertas-abiertas", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  try {
    const rows = await withScopedTransaction(session, async (tx) => {
      const { branches, units } = scopes(session);
      const clause = session.role === "asesor" ? "a.asesor_id = $1::uuid" : session.role === "coordinador" ? "a.sucursal_id = ANY($1::uuid[])" : session.role === "gerente_comercial" ? "a.unidad_negocio_id = ANY($1::uuid[])" : "TRUE";
      const values = session.role === "asesor" ? [session.user.id] : session.role === "coordinador" ? [branches] : session.role === "gerente_comercial" ? [units] : [];
      return (await tx.query(`SELECT id, tipo, severidad, titulo, contexto, sucursal_id AS "sucursalId",
        unidad_negocio_id AS "unidadNegocioId", asesor_id AS "asesorId", estado
        FROM alertas a WHERE a.estado = 'abierta' AND ${clause}
        ORDER BY CASE a.severidad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, a.created_at DESC`, values)).rows;
    });
    res.json(rows);
  } catch (error) { req.log?.error?.(error); res.status(500).json({ message: "No se pudieron cargar las alertas." }); }
});

router.post("/minutas", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const fecha = date(req.body?.fecha), destinatarioId = uuid(req.body?.destinatarioId), descripcion = text(req.body?.descripcion);
  const fechaLimite = req.body?.fechaLimite == null || req.body.fechaLimite === "" ? null : date(req.body.fechaLimite);
  const alertaIds: Array<string | null> | null = Array.isArray(req.body?.alertaIds) ? req.body.alertaIds.map(uuid) : null;
  if (!fecha || !destinatarioId || !descripcion || (req.body?.fechaLimite && !fechaLimite) || !alertaIds || alertaIds.some((id: string | null) => !id)) { res.status(400).json({ message: "Los datos de la minuta no son válidos." }); return; }
  if (session.role === "asesor") { res.status(403).json({ message: "No autorizado para crear minutas." }); return; }
  try {
    const row = await withScopedTransaction(session, async (tx) => {
      const target = allowedRecipient(session, await recipient(tx, destinatarioId));
      if (!target) { const error = new Error("FORBIDDEN"); throw error; }
      const inserted = await tx.query(`INSERT INTO minutas (fecha, destinatario_id, cliente, descripcion, fecha_limite, sucursal_id, unidad_negocio_id, estado, created_by, updated_by)
        VALUES ($1::date, $2::uuid, $3, $4, $5::date, $6::uuid, $7::uuid, 'pendiente', $8::uuid, $8::uuid) RETURNING *`,
        [fecha, destinatarioId, typeof req.body?.cliente === "string" ? req.body.cliente.trim() || null : null, descripcion, fechaLimite, target.sucursalId, target.unidadNegocioId, session.user.id]);
      if (alertaIds.length) await tx.query(`INSERT INTO minuta_alertas (minuta_id, alerta_id)
        SELECT $1::uuid, a.id FROM alertas a WHERE a.id = ANY($2::uuid[])`, [inserted.rows[0].id, alertaIds as string[]]);
      return inserted.rows[0];
    });
    res.status(201).json(row);
  } catch (error) { if ((error as Error).message === "FORBIDDEN") res.status(403).json({ message: "Destinatario fuera de tu alcance." }); else { req.log?.error?.(error); res.status(500).json({ message: "No se pudo crear la minuta." }); } }
});

router.patch("/minutas/:id", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const id = uuid(req.params.id), descripcion = text(req.body?.descripcion), fechaLimite = req.body?.fechaLimite == null || req.body.fechaLimite === "" ? null : date(req.body.fechaLimite);
  if (!id || !descripcion || (req.body?.fechaLimite && !fechaLimite) || !ESTADOS.has(req.body?.estado)) { res.status(400).json({ message: "Los datos de actualización no son válidos." }); return; }
  if (session.role === "asesor") { res.status(403).json({ message: "No autorizado para actualizar minutas." }); return; }
  try {
    const row = await withScopedTransaction(session, async (tx) => {
      const existing = await accessibleMinuta(tx, session, id);
      if (!existing || existing.destinatarioId === session.user.id) throw new Error("FORBIDDEN");
      return (await tx.query(`UPDATE minutas SET descripcion = $1, fecha_limite = $2::date, estado = $3, updated_by = $4::uuid, updated_at = now() WHERE id = $5::uuid RETURNING *`, [descripcion, fechaLimite, req.body.estado, session.user.id, id])).rows[0];
    }); res.json(row);
  } catch (error) { if ((error as Error).message === "FORBIDDEN") res.status(403).json({ message: "La minuta está fuera de tu alcance o sos su destinatario." }); else { req.log?.error?.(error); res.status(500).json({ message: "No se pudo actualizar la minuta." }); } }
});

router.delete("/minutas/:id", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const id = uuid(req.params.id); if (!id) { res.status(400).json({ message: "La minuta no es válida." }); return; }
  if (session.role !== "gerencia") { res.status(403).json({ message: "Solo gerencia puede eliminar minutas." }); return; }
  try { await withScopedTransaction(session, async (tx) => { if (!await accessibleMinuta(tx, session, id)) throw new Error("FORBIDDEN"); await tx.query("DELETE FROM minutas WHERE id = $1::uuid", [id]); }); res.status(204).send(); }
  catch (error) { if ((error as Error).message === "FORBIDDEN") res.status(403).json({ message: "La minuta está fuera de tu alcance." }); else { req.log?.error?.(error); res.status(500).json({ message: "No se pudo eliminar la minuta." }); } }
});

router.post("/minutas/:id/comentarios", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const id = uuid(req.params.id), comentario = text(req.body?.texto); if (!id || !comentario) { res.status(400).json({ message: "El comentario no es válido." }); return; }
  try { const row = await withScopedTransaction(session, async (tx) => { const existing = await accessibleMinuta(tx, session, id); if (!existing || existing.destinatarioId !== session.user.id) throw new Error("FORBIDDEN"); return (await tx.query("INSERT INTO minuta_comentarios (minuta_id, autor_id, texto) VALUES ($1::uuid, $2::uuid, $3) RETURNING id, minuta_id AS \"minutaId\", autor_id AS \"autorId\", texto, created_at AS \"createdAt\"", [id, session.user.id, comentario])).rows[0]; }); res.status(201).json(row); }
  catch (error) { if ((error as Error).message === "FORBIDDEN") res.status(403).json({ message: "Solo el destinatario puede comentar esta minuta." }); else { req.log?.error?.(error); res.status(500).json({ message: "No se pudo agregar el comentario." }); } }
});

router.post("/minutas/alertas/:id/resolver", async (req, res) => {
  const session = await sessionOr401(req, res); if (!session) return;
  const id = uuid(req.params.id); if (!id) { res.status(400).json({ message: "La alerta no es válida." }); return; }
  if (session.role === "asesor") { res.status(403).json({ message: "No autorizado para resolver alertas." }); return; }
  try { const row = await withScopedTransaction(session, async (tx) => { const { branches, units } = scopes(session); const clause = session.role === "coordinador" ? "sucursal_id = ANY($2::uuid[])" : session.role === "gerente_comercial" ? "unidad_negocio_id = ANY($2::uuid[])" : "TRUE"; const values = session.role === "coordinador" ? [id, branches] : session.role === "gerente_comercial" ? [id, units] : [id]; const found = await tx.query(`SELECT id FROM alertas WHERE id = $1::uuid AND ${clause}`, values); if (!found.rows[0]) throw new Error("FORBIDDEN"); return (await tx.query("UPDATE alertas SET estado = 'resuelta', resuelta_manualmente = true, resuelta_por = $1::uuid, resuelta_en = now(), updated_at = now() WHERE id = $2::uuid RETURNING *", [session.user.id, id])).rows[0]; }); res.json(row); }
  catch (error) { if ((error as Error).message === "FORBIDDEN") res.status(403).json({ message: "La alerta está fuera de tu alcance." }); else { req.log?.error?.(error); res.status(500).json({ message: "No se pudo resolver la alerta." }); } }
});

export default router;