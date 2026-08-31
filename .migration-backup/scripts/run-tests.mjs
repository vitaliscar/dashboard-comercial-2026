#!/usr/bin/env node

/**
 * Script de ejecución de tests - Compatible con Node.js directo
 * Ejecuta: node run-tests.mjs
 */

import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  static section(title) {
    console.log(`\n${colors.bright}${colors.cyan}${"=".repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${"=".repeat(80)}${colors.reset}\n`);
  }

  static subsection(title) {
    console.log(`\n${colors.bright}--- ${title} ---${colors.reset}`);
  }

  static success(msg) {
    console.log(`${colors.green}✓ ${msg}${colors.reset}`);
  }

  static error(msg) {
    console.log(`${colors.red}✗ ${msg}${colors.reset}`);
  }

  static warning(msg) {
    console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
  }

  static info(msg) {
    console.log(`  ${msg}`);
  }

  static log(msg) {
    console.log(msg);
  }
}

/**
 * Parser Excel simplificado
 */
class ExcelParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.workbook = XLSX.readFile(filePath, { cellDates: true });
  }

  normalizarSucursal(sucursal) {
    if (!sucursal) return "";
    const lower = sucursal.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const mapeo = {
      "los ruices": "Caracas",
      caracas: "Caracas",
      "fmo piar": "FMO Piar",
      "puerto ordaz": "Puerto Ordaz",
      "puerto la cruz": "Puerto La Cruz",
      barquisimeto: "Barquisimeto",
      valencia: "Valencia",
      maracaibo: "Maracaibo",
      "punto fijo": "Punto Fijo",
      maturin: "Maturín",
      maturín: "Maturín",
      "direccion general": "Dirección General",
    };
    return mapeo[lower] || sucursal.trim();
  }

  debeExcluir(sucursal) {
    if (!sucursal) return false;
    return sucursal.trim().toLowerCase() === "machine shop";
  }

  leerHoja(nombreHoja) {
    const sheet = this.workbook.Sheets[nombreHoja];
    if (!sheet) {
      console.warn(`⚠️ Hoja "${nombreHoja}" no encontrada`);
      return [];
    }
    return XLSX.utils.sheet_to_json(sheet);
  }

  parseNumber(value) {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return value;

    let str = String(value).trim();
    if (str === "") return 0;

    const lastDotIndex = str.lastIndexOf(".");
    const lastCommaIndex = str.lastIndexOf(",");

    if (lastCommaIndex >= 0 && lastDotIndex >= 0) {
      if (lastCommaIndex > lastDotIndex) {
        // Formato europeo
        str = str.replace(/\./g, "").replace(/,/g, ".");
      } else {
        // Formato inglés
        str = str.replace(/,/g, "");
      }
    } else if (lastCommaIndex >= 0) {
      // Solo comas
      str = str.replace(/,/g, ".");
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  parsePeriodo(row, colFecha, colMes, colAnio) {
    let fechaStr = null;
    let mes = 0;
    let anio = 0;

    const valFecha = row[colFecha];
    const valMes = row[colMes];
    const valAnio = row[colAnio];

    if (valFecha) {
      if (valFecha instanceof Date && !isNaN(valFecha.getTime())) {
        fechaStr = valFecha.toISOString().slice(0, 10);
        mes = valFecha.getMonth() + 1;
        anio = valFecha.getFullYear();
      } else {
        const s = String(valFecha).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
          const [, d, mo, y] = m;
          const day = parseInt(d, 10);
          const month = parseInt(mo, 10);
          const year = parseInt(y, 10);
          fechaStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          mes = month;
          anio = year;
        } else {
          const d2 = new Date(s);
          if (!isNaN(d2.getTime())) {
            fechaStr = d2.toISOString().slice(0, 10);
            mes = d2.getMonth() + 1;
            anio = d2.getFullYear();
          }
        }
      }
    }

    if (mes === 0 && valMes !== undefined && valMes !== null) {
      const parsedMes = parseInt(String(valMes).trim(), 10);
      if (!isNaN(parsedMes) && parsedMes >= 1 && parsedMes <= 12) {
        mes = parsedMes;
      }
    }

    if (anio === 0 && valAnio !== undefined && valAnio !== null) {
      const parsedAnio = parseInt(String(valAnio).trim(), 10);
      if (!isNaN(parsedAnio) && parsedAnio > 0) {
        anio = parsedAnio;
      }
    }

    if (anio === 0) {
      anio = 2026;
    }

    if (!fechaStr && mes >= 1 && mes <= 12 && anio > 0) {
      fechaStr = `${anio}-${String(mes).padStart(2, "0")}-01`;
    }

    return { fecha: fechaStr, mes, anio };
  }

  getUsuarios() {
    const datos = this.leerHoja("Usuarios");
    return datos.map((row) => ({
      nombre: row["Nombre"] || "",
      rol: row["Rol"] || "",
      email: row["Email"] || "",
      codigo: row["Codigo"] || "",
      sucursal: this.normalizarSucursal(row["Sucursal"]),
      asesoresAsignados: (row["AsesoresAsignados"] || "")
        .toString()
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      contraseña: row["Contraseña"] || "",
    }));
  }

  getOportunidades(meses, anio) {
    const datos = this.leerHoja("Oportunidades");
    return datos
      .filter((row) => {
        const { mes, anio: anioRow } = this.parsePeriodo(
          row,
          "Fecha Detectada",
          "Mes Detectada",
          "Año Detectada",
        );
        const sucursal = row["Sucursal"] || "";
        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => ({
        compania: row["Compañia"] || "CCV",
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        codigoAsesor: row["Código Asesor"] || "",
        etapa: row["Etapa de Ventas"] || "",
        monto: this.parseNumber(row["Ingresos Esperados Base"]),
        montoFacturado: this.parseNumber(row["Monto Total Facturado Base"]),
        cliente: row["Nombre de Cuenta"] || row["Nombre de Cliente Potencial"] || "Cliente S/N",
      }));
  }

  getCumplimientoBase(meses, anio) {
    const datos = this.leerHoja("CumplimientoBase");
    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes"], 10);
        const anioRow = parseInt(row["Año"], 10);
        const sucursal = row["Sucursal"] || "";
        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        mes: parseInt(row["Mes"], 10),
        presupuesto: this.parseNumber(row["Presupuesto"]),
        unNegocio: row["U/N"] || "",
        ventaReal:
          this.parseNumber(row["Ventas CCV"]) +
          this.parseNumber(row["Ventas Xibi"]) +
          this.parseNumber(row["Ventas Estrategicas"]),
      }));
  }

  getVentasPerdidas(meses, anio) {
    const datos = this.leerHoja("Ventas Perdidas");
    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes VP"], 10);
        const anioRow = parseInt(row["Año VP"], 10);
        const sucursal = row["Nombre Sucursal"] || "";
        const monto = this.parseNumber(row["Monto Venta Perdidas"]);
        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal) && monto > 0;
      })
      .map((row) => ({
        asesor: row["Asesor"] || row["Nombre Asesor"] || "",
        cliente: row["Nombre Cliente"] || "",
        razon: row["Nombre de Razón"] || "",
        monto: this.parseNumber(row["Monto Venta Perdidas"]),
      }));
  }

  getFacturacion(meses, anio) {
    const datos = this.leerHoja("Facturacion");
    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes Cierre"], 10);
        return meses.includes(mes);
      })
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        cliente: row["Nombre de Cuenta"] || "",
        codigoAsesor: row["Código Asesor"] || "",
        tipoNegocio: row["Tipo de Negocio"] || "",
      }));
  }

  getCumplimientoAsesores(meses, anio) {
    const datos = this.leerHoja("CumplimientoAsesoresBase");
    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes"], 10);
        const anioRow = parseInt(row["Año"], 10);
        const sucursal = row["Sucursal"] || "";
        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => ({
        codigoAsesor: row["Cod. Asesor"] || "",
        asesor: row["Asesor"] || "",
        unNegocio: row["U/N"] || "",
        presupuesto: this.parseNumber(row["Monto"]),
        venta: this.parseNumber(row["CUMPLIMIENTO"]),
      }));
  }
}

/**
 * Ejecutar tests
 */
async function runAllTests() {
  const excelPath = path.join(__dirname, "CCV Rendimiento.xlsx");

  Logger.section("INICIALIZANDO PARSER EXCEL");

  let parser;
  try {
    parser = new ExcelParser(excelPath);
    Logger.success(`Parser inicializado desde: ${excelPath}`);
  } catch (error) {
    Logger.error(`Error al cargar Excel: ${error.message}`);
    process.exit(1);
  }

  // Test 1: Usuarios
  Logger.section("TEST 1: USUARIOS Y ROLES");
  const usuarios = parser.getUsuarios();
  Logger.info(`Total de usuarios: ${usuarios.length}`);

  if (usuarios.length > 0) {
    Logger.subsection("Primeros 3 usuarios");
    usuarios.slice(0, 3).forEach((u, i) => {
      Logger.info(`${i + 1}. ${u.nombre} | ${u.rol} | ${u.sucursal}`);
    });

    Logger.subsection("Distribución de roles");
    const roles = {};
    usuarios.forEach((u) => {
      roles[u.rol] = (roles[u.rol] || 0) + 1;
    });
    Object.entries(roles).forEach(([rol, count]) => {
      Logger.info(`  ${rol}: ${count}`);
    });
    Logger.success("✓ Test de usuarios completado");
  } else {
    Logger.warning("No se encontraron usuarios");
  }

  // Test 2: Oportunidades
  Logger.section("TEST 2: OPORTUNIDADES");
  const oportunidades = parser.getOportunidades([5], 2026);
  Logger.info(`Total de oportunidades (mes 5, 2026): ${oportunidades.length}`);

  if (oportunidades.length > 0) {
    Logger.subsection("Primeras 5 oportunidades");
    oportunidades.slice(0, 5).forEach((o, i) => {
      Logger.info(`${i + 1}. ${o.sucursal} | ${o.cliente} | $${o.monto}`);
    });
    Logger.success("✓ Test de oportunidades completado");
  } else {
    Logger.warning("No se encontraron oportunidades para este mes");
  }

  // Test 3: Cumplimiento Base
  Logger.section("TEST 3: CUMPLIMIENTO BASE");
  const cumplimiento = parser.getCumplimientoBase([5], 2026);
  Logger.info(`Total de registros (mes 5, 2026): ${cumplimiento.length}`);

  if (cumplimiento.length > 0) {
    Logger.subsection("Primeros 5 registros");
    cumplimiento.slice(0, 5).forEach((c, i) => {
      Logger.info(
        `${i + 1}. ${c.sucursal} | ${c.unNegocio} | Presupuesto: $${c.presupuesto} | Venta: $${c.ventaReal}`,
      );
    });
    Logger.success("✓ Test de cumplimiento completado");
  } else {
    Logger.warning("No se encontraron datos de cumplimiento");
  }

  // Test 4: Ventas Perdidas
  Logger.section("TEST 4: VENTAS PERDIDAS");
  const ventasPerdidas = parser.getVentasPerdidas([5], 2026);
  Logger.info(`Total de ventas perdidas (mes 5, 2026): ${ventasPerdidas.length}`);

  if (ventasPerdidas.length > 0) {
    Logger.subsection("Primeras 5");
    ventasPerdidas.slice(0, 5).forEach((vp, i) => {
      Logger.info(`${i + 1}. ${vp.cliente} | $${vp.monto} | ${vp.razon}`);
    });
    Logger.success("✓ Test de ventas perdidas completado");
  } else {
    Logger.warning("No se encontraron ventas perdidas");
  }

  // Test 5: Facturación
  Logger.section("TEST 5: FACTURACIÓN");
  const facturacion = parser.getFacturacion([5], 2026);
  Logger.info(`Total de facturas (mes 5, 2026): ${facturacion.length}`);

  if (facturacion.length > 0) {
    Logger.subsection("Primeras 5 facturas");
    facturacion.slice(0, 5).forEach((f, i) => {
      Logger.info(`${i + 1}. ${f.sucursal} | ${f.cliente} | ${f.tipoNegocio}`);
    });
    Logger.success("✓ Test de facturación completado");
  } else {
    Logger.warning("No se encontraron facturas");
  }

  // Test 6: Cumplimiento de Asesores
  Logger.section("TEST 6: CUMPLIMIENTO DE ASESORES");
  const cumplAsesores = parser.getCumplimientoAsesores([5], 2026);
  Logger.info(`Total de asesores (mes 5, 2026): ${cumplAsesores.length}`);

  if (cumplAsesores.length > 0) {
    Logger.subsection("Primeros 5 asesores");
    cumplAsesores.slice(0, 5).forEach((c, i) => {
      Logger.info(
        `${i + 1}. ${c.asesor} | ${c.unNegocio} | Presupuesto: $${c.presupuesto} | Venta: $${c.venta}`,
      );
    });
    Logger.success("✓ Test de asesores completado");
  } else {
    Logger.warning("No se encontraron datos de asesores");
  }

  // Resumen
  Logger.section("RESUMEN FINAL");
  Logger.success("Todos los tests ejecutados correctamente");
  Logger.info(`Usuarios cargados: ${usuarios.length}`);
  Logger.info(`Oportunidades: ${oportunidades.length}`);
  Logger.info(`Cumplimiento: ${cumplimiento.length}`);
  Logger.info(`Ventas Perdidas: ${ventasPerdidas.length}`);
  Logger.info(`Facturas: ${facturacion.length}`);
  Logger.info(`Asesores: ${cumplAsesores.length}`);
}

// Encabezado
console.log(
  `${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`,
);
console.log(
  `${colors.bright}${colors.blue}║          SUITE DE TESTS - PARSER EXCEL CCV RENDIMIENTO                           ║${colors.reset}`,
);
console.log(
  `${colors.bright}${colors.blue}╚════════════════════════════════════════════════════════════════════════════════╝${colors.reset}`,
);

runAllTests().catch((error) => {
  Logger.error(`Error: ${error.message}`);
  process.exit(1);
});
