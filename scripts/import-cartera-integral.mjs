import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = process.argv[2];
if (!dataPath) throw new Error("Uso: node scripts/import-cartera-integral.mjs <cartera.json>");
if (!process.env.DATABASE_ADMIN_URL) throw new Error("DATABASE_ADMIN_URL es obligatorio para cargar la cartera.");

const require = createRequire(path.join(root, "lib/db/package.json"));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });

const branchNames = new Map([
  [1, "Puerto Ordaz"],
  [2, "Puerto La Cruz"],
  [3, "Barquisimeto"],
  [4, "Valencia"],
  [5, "Caracas"],
  [7, "Maracaibo"],
  [8, "Punto Fijo"],
]);
const advisorNames = new Map([
  ["57995", "FELIX CONDE"], ["44711", "ONESIMO RODRIGUEZ"], ["46128", "CARLOS BOOM"],
  ["46125", "CESAR RAMIREZ"], ["80068", "ABEL BRICEÑO"], ["45499", "JOSE MARTINEZ"],
  ["81459", "MELVIN RAMIREZ"], ["45497", "HENRRY URDANETA"], ["49935", "JOHN HERNANDEZ"],
  ["78297", "JESUS CHAVEZ"], ["81300", "ANJJEL TELLERIA"], ["45511", "OMER GALBAN"],
  ["60493", "JOSE URDANETA"], ["93031", "ELSIO ROMERO"], ["45501", "LEONEL AVILA"],
]);

const records = JSON.parse(await readFile(path.resolve(dataPath), "utf8"));
if (!Array.isArray(records) || records.length !== 253) throw new Error(`Esperaba 253 asignaciones de la hoja de cartera; recibí ${records?.length ?? "un valor inválido"}.`);
const keys = new Set();
for (const row of records) {
  const advisorCode = String(row.advisorCode ?? "");
  const branchCode = Number(row.branchCode);
  const clientCode = String(row.clientCode ?? "").trim();
  const clientName = String(row.clientName ?? "").trim();
  if (!advisorNames.has(advisorCode) || !branchNames.has(branchCode) || !clientCode || !clientName) {
    throw new Error(`Asignación inválida o fuera de la nómina vigente: ${JSON.stringify(row)}`);
  }
  if (advisorCode === "81300") throw new Error("Anjjel Telleria debe permanecer sin cartera asignada.");
  keys.add(`${clientCode}:${branchCode}:${advisorCode}`);
}
if (keys.size !== records.length) throw new Error("El archivo contiene asignaciones repetidas; no se cargó ningún dato.");
if (!records.some((row) => String(row.clientCode) === "71025" && String(row.advisorCode) === "45501")) {
  throw new Error("Falta CARDON IV (71025) asignado a Leonel Ávila (45501).");
}

const migration = await readFile(path.join(root, "artifacts/dashboard-comercial/src/db/migrations-manual/0040_cartera_integral.sql"), "utf8");
const client = await pool.connect();
try {
  await client.query(migration);
  await client.query("BEGIN");
  const branchesResult = await client.query("SELECT id, lower(trim(nombre)) AS nombre FROM sucursales");
  const branches = new Map(branchesResult.rows.map((row) => [row.nombre, row.id]));
  const branchIds = new Map();
  for (const [code, name] of branchNames) {
    const id = branches.get(name.toLocaleLowerCase("es"));
    if (records.some((row) => Number(row.branchCode) === code) && !id) throw new Error(`No existe en Postgres la sucursal ${name} (código ${code}).`);
    if (id) branchIds.set(code, id);
  }

  await client.query("DELETE FROM cartera_integral WHERE compania_codigo = 32");
  await client.query("DELETE FROM clientes_integrales WHERE compania_codigo = 32");
  for (const row of records) {
    await client.query(
      `INSERT INTO clientes_integrales (compania_codigo, codigo_cliente, nombre)
       VALUES (32, $1, $2)
       ON CONFLICT (compania_codigo, codigo_cliente)
       DO UPDATE SET nombre = EXCLUDED.nombre, actualizado_at = now()`,
      [String(row.clientCode).trim(), String(row.clientName).trim()],
    );
  }
  for (const row of records) {
    const advisorCode = String(row.advisorCode);
    await client.query(
      `INSERT INTO cartera_integral
         (compania_codigo, codigo_cliente, sucursal_id, codigo_asesor, asesor)
       VALUES (32, $1, $2::uuid, $3, $4)
       ON CONFLICT (compania_codigo, codigo_cliente, sucursal_id, codigo_asesor)
       DO UPDATE SET asesor = EXCLUDED.asesor`,
      [String(row.clientCode).trim(), branchIds.get(Number(row.branchCode)), advisorCode, advisorNames.get(advisorCode)],
    );
  }
  await client.query("COMMIT");
  const result = await client.query(
    `SELECT count(DISTINCT codigo_cliente)::int AS clientes,
            count(*)::int AS asignaciones,
            count(DISTINCT codigo_asesor)::int AS asesores
     FROM cartera_integral WHERE compania_codigo = 32`,
  );
  console.log(JSON.stringify(result.rows[0]));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
