#!/usr/bin/env node

/**
 * Dashboard Setup Automatizado
 * Ejecuta: bun setup-dashboard.mjs
 *
 * Pasos:
 * 1. Valida configuración Supabase
 * 2. Ejecuta migraciones SQL
 * 3. Carga datos desde Excel
 * 4. Inicia servidor dev
 * 5. Abre dashboard en navegador
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Colores para consola
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
};

class Logger {
  static header(title) {
    console.log(
      `\n${colors.bright}${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`,
    );
    console.log(`${colors.bright}${colors.cyan}║  ${title.padEnd(36)}  ║${colors.reset}`);
    console.log(
      `${colors.bright}${colors.cyan}╚════════════════════════════════════════╝${colors.reset}\n`,
    );
  }

  static step(num, title) {
    console.log(`${colors.bright}${colors.blue}[${num}]${colors.reset} ${title}`);
  }

  static success(msg) {
    console.log(`${colors.green}✅ ${msg}${colors.reset}`);
  }

  static error(msg) {
    console.log(`${colors.red}❌ ${msg}${colors.reset}`);
  }

  static warning(msg) {
    console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
  }

  static info(msg) {
    console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`);
  }

  static log(msg) {
    console.log(msg);
  }
}

/**
 * Valida que las variables de entorno estén configuradas
 */
function validarEntorno() {
  Logger.step("1", "Validando variables de entorno");

  const envFile = path.join(__dirname, ".env.local");

  if (!fs.existsSync(envFile)) {
    Logger.error("Archivo .env.local no encontrado");
    Logger.info("Crear .env.local con:");
    console.log(`
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...
    `);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envFile, "utf-8");
  const hasUrl = envContent.includes("VITE_SUPABASE_URL");
  const hasAnonKey = envContent.includes("VITE_SUPABASE_ANON_KEY");
  const hasServiceKey = envContent.includes("SUPABASE_SERVICE_KEY");

  if (!hasUrl || !hasAnonKey || !hasServiceKey) {
    Logger.error("Falta alguna variable en .env.local");
    Logger.warning("Requiere: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  Logger.success("Variables de entorno configuradas ✓");
}

/**
 * Valida que los archivos necesarios existan
 */
function validarArchivos() {
  Logger.step("2", "Validando archivos del proyecto");

  const archivosRequeridos = [
    "docs/supabase-schema.sql",
    "docs/supabase-rls-policies.sql",
    "CCV Rendimiento.xlsx",
    "src/integrations/supabase/load-excel.ts",
    "src/lib/kpi-calculations.ts",
    "src/routes/_app/dashboard.tsx",
  ];

  let faltantes = [];
  archivosRequeridos.forEach((archivo) => {
    const ruta = path.join(__dirname, archivo);
    if (!fs.existsSync(ruta)) {
      faltantes.push(archivo);
    }
  });

  if (faltantes.length > 0) {
    Logger.error(`Faltan ${faltantes.length} archivos:`);
    faltantes.forEach((f) => Logger.info(`  - ${f}`));
    process.exit(1);
  }

  Logger.success("Todos los archivos presentes ✓");
}

/**
 * Muestra instrucciones para ejecutar migraciones manualmente
 */
function instruirMigraciones() {
  Logger.step("3", "Migraciones Supabase (MANUAL)");

  Logger.warning("Las migraciones deben ejecutarse manualmente en Supabase");
  console.log(`
${colors.bright}PASOS:${colors.reset}
1. Abre https://supabase.com y entra a tu proyecto
2. Ve a SQL Editor → New Query
3. Copia todo el contenido de:
   ${colors.cyan}docs/supabase-schema.sql${colors.reset}
4. Ejecuta la query
5. Crea una nueva query y copia:
   ${colors.cyan}docs/supabase-rls-policies.sql${colors.reset}
6. Ejecuta

${colors.green}✅ Una vez completo, presiona ENTER para continuar${colors.reset}
  `);

  // Esperar enter
  return new Promise((resolve) => {
    process.stdin.once("data", () => {
      Logger.success("Migraciones completadas ✓");
      resolve();
    });
  });
}

/**
 * Carga datos desde Excel a Supabase
 */
async function cargarDatos() {
  Logger.step("4", "Cargando datos desde Excel");

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["src/integrations/supabase/load-excel.ts"], {
      cwd: __dirname,
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        Logger.success("Datos cargados exitosamente ✓");
        resolve();
      } else {
        Logger.error(`Carga de datos falló (código ${code})`);
        reject(new Error("Load data failed"));
      }
    });

    proc.on("error", (err) => {
      Logger.error(`Error al cargar datos: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Inicia el servidor de desarrollo
 */
function iniciarServidor() {
  Logger.step("5", "Iniciando servidor de desarrollo");

  console.log(`
${colors.green}✅ Setup completado exitosamente${colors.reset}

${colors.bright}${colors.blue}Iniciando servidor en puerto 3000...${colors.reset}
Abre: ${colors.cyan}http://localhost:3000${colors.reset}

${colors.yellow}Para testear, usa estas credenciales de prueba:${colors.reset}
  - Email: gerencia@ccvenequip.com (Gerencia Nacional)
  - Email: coordinador@ccvenequip.com (Coordinador de U/N)
  - Email: asesor@ccvenequip.com (Asesor)

${colors.red}CTRL+C para detener${colors.reset}
  `);

  const proc = spawn("bun", ["run", "dev"], {
    cwd: __dirname,
    stdio: "inherit",
    shell: true,
  });

  proc.on("error", (err) => {
    Logger.error(`Error al iniciar servidor: ${err.message}`);
    process.exit(1);
  });
}

/**
 * Main
 */
async function main() {
  Logger.header("DASHBOARD SETUP 2026");

  try {
    // Validar entorno
    validarEntorno();
    console.log("");

    // Validar archivos
    validarArchivos();
    console.log("");

    // Instruir migraciones
    process.stdin.setRawMode(true);
    process.stdin.resume();
    await instruirMigraciones();
    process.stdin.setRawMode(false);
    console.log("");

    // Cargar datos
    await cargarDatos();
    console.log("");

    // Iniciar servidor
    iniciarServidor();
  } catch (error) {
    Logger.error(`Setup falló: ${error.message}`);
    process.exit(1);
  }
}

main();
