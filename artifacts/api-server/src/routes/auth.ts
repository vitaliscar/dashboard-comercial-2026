import { Router, type Request, type Response } from "express";
import { verify } from "@node-rs/argon2";
import { clearSessionCookie, setSessionCookie } from "../lib/session-cookie";

const router = Router();
const SESSION_COOKIE_NAME = "ccv_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";
export type QueryResult = { rows: any[] };
export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};
type TransactionClient = Queryable & { release: () => void };

const failures = new Map<string, { count: number; lockedUntil: number }>();
const dummyHash =
  process.env.AUTH_DUMMY_PASSWORD_HASH ??
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function clientKey(req: Request, email: string) {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return `${email}|${forwarded ?? req.ip ?? "unknown"}`;
}

function checkRateLimit(key: string) {
  const entry = failures.get(key);
  if (!entry) return { limited: false };
  if (entry.lockedUntil > Date.now()) return { limited: true };
  failures.delete(key);
  return { limited: false };
}

function recordFailure(key: string) {
  const current = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  current.count += 1;
  if (current.count >= MAX_ATTEMPTS) current.lockedUntil = Date.now() + LOCK_MS;
  failures.set(key, current);
}

function clearFailures(key: string) {
  failures.delete(key);
}

export async function getPool(): Promise<Queryable | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const database = await import("@workspace/db");
    return database.pool;
  } catch {
    return null;
  }
}

async function getAdminPool(): Promise<Queryable | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const database = await import("@workspace/db");
    return database.adminPool;
  } catch {
    return null;
  }
}

export async function loadPayload(pool: Queryable, userId: string) {
  const profileResult = await pool.query(
    `SELECT id, email, nombre_completo, sucursal_id, unidad_negocio_id, is_admin
     FROM profiles WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const profile = profileResult.rows[0];
  if (!profile) return null;

  const [rolesResult, unitsResult, branchesResult] = await Promise.all([
    pool.query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]),
    pool.query(`SELECT unidad_negocio_id FROM profile_unidades_negocio WHERE profile_id = $1`, [userId]),
    pool.query(`SELECT sucursal_id FROM profile_sucursales WHERE profile_id = $1`, [userId]),
  ]);

  const rolePriority: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];
  const assignedRoles = rolesResult.rows.map((row) => row.role as AppRole);
  const role = profile.is_admin
    ? "gerencia"
    : rolePriority.find((candidate) => assignedRoles.includes(candidate)) ?? null;
  const unidadesNegocioIds = unitsResult.rows.length
    ? unitsResult.rows.map((row) => row.unidad_negocio_id)
    : profile.unidad_negocio_id
      ? [profile.unidad_negocio_id]
      : [];
  const sucursalesIds = branchesResult.rows.length
    ? branchesResult.rows.map((row) => row.sucursal_id)
    : profile.sucursal_id
      ? [profile.sucursal_id]
      : [];

  return {
    user: { id: userId, email: profile.email },
    profile: {
      id: profile.id,
      email: profile.email,
      nombreCompleto: profile.nombre_completo,
      sucursalId: profile.sucursal_id,
      unidadNegocioId: profile.unidad_negocio_id,
      isAdmin: profile.is_admin,
      unidadesNegocioIds,
      sucursalesIds,
    },
    role,
  };
}

export async function currentSession(req: Request) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return null;
  const pool = await getAdminPool();
  if (!pool) return null;

  const result = await pool.query(
    `SELECT s.user_id
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now() AND u.is_active = true
     LIMIT 1`,
    [sessionId],
  );
  const userId = result.rows[0]?.user_id;
  if (!userId) return null;
  return loadPayload(pool, userId);
}

export type SessionPayload = NonNullable<Awaited<ReturnType<typeof currentSession>>>;

export async function withScopedTransaction<T>(
  session: SessionPayload,
  fn: (tx: Queryable) => Promise<T>,
): Promise<T> {
  const pool = await getPool();
  if (!pool || typeof (pool as { connect?: unknown }).connect !== "function") {
    throw new Error("Application database pool is not configured.");
  }

  const client = await (
    pool as unknown as { connect: () => Promise<TransactionClient> }
  ).connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_role', $1, true)", [session.role ?? ""]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [session.user.id]);
    await client.query(
      "SELECT set_config('app.current_sucursal_id', $1, true)",
      [session.profile.sucursalId ?? ""],
    );

    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

router.post("/auth/login", async (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) {
    res.status(400).json({ message: "Correo y contraseña son obligatorios." });
    return;
  }

  const key = clientKey(req, email);
  if (checkRateLimit(key).limited) {
    res.status(429).json({ message: "Demasiados intentos de inicio de sesión. Intenta más tarde." });
    return;
  }

  const pool = await getAdminPool();
  if (!pool) {
    res.status(503).json({ message: "El servicio de autenticación no está configurado." });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, is_active FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    let valid = false;
    try {
      valid = await verify(user?.password_hash ?? dummyHash, password);
    } catch {
      valid = false;
    }

    if (!user || !user.is_active || !valid) {
      recordFailure(key);
      res.status(401).json({ message: "Correo o contraseña incorrectos." });
      return;
    }

    const payload = await loadPayload(pool, user.id);
    if (!payload) {
      res.status(500).json({ message: "No se pudo cargar el perfil del usuario." });
      return;
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const sessionResult = await pool.query(
      `INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id`,
      [user.id, expiresAt],
    );
    const sessionId = sessionResult.rows[0]?.id;
    if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
      res.status(500).json({ message: "No se pudo crear una sesión segura." });
      return;
    }
    clearFailures(key);
    setSessionCookie(res, sessionId, expiresAt);
    res.json(payload);
  } catch {
    res.status(500).json({ message: "No se pudo iniciar sesión." });
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  try {
    const payload = await currentSession(req);
    if (!payload) {
      res.status(401).json({ message: "Sesión no válida." });
      return;
    }
    res.json(payload);
  } catch {
    res.status(500).json({ message: "No se pudo validar la sesión." });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  try {
    const pool = await getAdminPool();
    if (pool && typeof sessionId === "string" && SESSION_ID_RE.test(sessionId)) {
      await pool.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
    }
  } finally {
    clearSessionCookie(res);
    res.json({ success: true });
  }
});

export default router;