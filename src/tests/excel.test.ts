/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExcelParser } from "@/lib/excel-parser";
import * as path from "path";

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

/**
 * Logger personalizado
 */
class Logger {
  static section(title: string) {
    console.log(`\n${colors.bright}${colors.cyan}${"=".repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${"=".repeat(80)}${colors.reset}\n`);
  }

  static subsection(title: string) {
    console.log(`\n${colors.bright}--- ${title} ---${colors.reset}`);
  }

  static success(msg: string) {
    console.log(`${colors.green}✓ ${msg}${colors.reset}`);
  }

  static error(msg: string) {
    console.log(`${colors.red}✗ ${msg}${colors.reset}`);
  }

  static warning(msg: string) {
    console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
  }

  static info(msg: string) {
    console.log(`  ${msg}`);
  }

  static log(msg: string) {
    console.log(msg);
  }
}

/**
 * SUITE DE TESTS PARA EXCEL PARSER
 */
async function runAllTests() {
  const excelPath = path.resolve(__dirname, "../../CCV Rendimiento.xlsx");

  Logger.section("INICIALIZANDO PARSER EXCEL");
  let parser: ExcelParser;

  try {
    parser = new ExcelParser(excelPath);
    Logger.success(`Parser inicializado: ${excelPath}`);
    parser.obtenerNombresHojas();
  } catch (error: any) {
    Logger.error(`No se pudo cargar el archivo Excel: ${error.message}`);
    process.exit(1);
  }

  // Tests
  await testLogin(parser);
  await testContarRoles(parser);
  await testValidUsuarioRoles(parser);
  await testExclusionMachineShop(parser);
  await testOportunidades(parser);
  await testOportunidadesLubFiltros(parser);
  await testCumplimientoBase(parser);
  await testCuentasPorCobrar(parser);
  await testVentasPerdidas(parser);
  await testFacturacion(parser);
  await testServicios(parser);
  await testLubricantesFiltos(parser);
  await testCumplimientoAsesores(parser);

  Logger.section("RESUMEN DE TESTS");
  Logger.success("Todos los tests completados");
}

/**
 * Test 1: LOGIN
 */
async function testLogin(parser: ExcelParser) {
  Logger.section("TEST 1: LOGIN Y USUARIOS");

  const usuarios = parser.getUsuarios();
  Logger.info(`Total de usuarios cargados: ${usuarios.length}`);

  if (usuarios.length === 0) {
    Logger.warning("No se encontraron usuarios en la hoja");
    return;
  }

  Logger.subsection("Primeros 3 usuarios");
  usuarios.slice(0, 3).forEach((u, i) => {
    Logger.info(`${i + 1}. ${u.nombre}`);
    Logger.info(`   Rol: ${u.rol}`);
    Logger.info(`   Email: ${u.email}`);
    Logger.info(`   Código: ${u.codigo || "(sin código)"}`);
    Logger.info(`   Sucursal: ${u.sucursal}`);
    Logger.info(`   Asesores: ${u.asesoresAsignados.join(", ") || "ninguno"}`);
    Logger.info(`   Contraseña: ${u.contraseña}`);
  });

  Logger.subsection("Verificación de roles");
  const rolCounts: { [key: string]: number } = {};
  usuarios.forEach((u) => {
    rolCounts[u.rol] = (rolCounts[u.rol] || 0) + 1;
  });

  Object.entries(rolCounts).forEach(([rol, count]) => {
    Logger.info(`  ${rol}: ${count}`);
  });

  Logger.success("Test de login completado");
}

/**
 * Test 2: CONTAR ROLES
 */
async function testContarRoles(parser: ExcelParser) {
  Logger.section("TEST 2: DISTRIBUCIÓN DE ROLES");

  const usuarios = parser.getUsuarios();
  const roles: { [key: string]: number } = {};

  usuarios.forEach((u) => {
    const rol = u.rol || "Sin rol";
    roles[rol] = (roles[rol] || 0) + 1;
  });

  Logger.info(`Total de usuarios: ${usuarios.length}\n`);
  Logger.subsection("Desglose por rol");

  Object.entries(roles).forEach(([rol, count]) => {
    Logger.info(`  ${rol}: ${count}`);
  });

  Logger.subsection("Coordinadores y sus asesores");
  usuarios.forEach((u) => {
    if (u.rol.includes("Coordinador")) {
      Logger.info(`${u.nombre} (${u.rol})`);
      Logger.info(`  Asesores: ${u.asesoresAsignados.join(", ") || "ninguno"}`);
    }
  });

  Logger.success("Test de roles completado");
}

/**
 * Test 2b: VALIDAR ROLES DE USUARIOS
 */
async function testValidUsuarioRoles(parser: ExcelParser) {
  Logger.section("TEST 2b: VALIDAR ROLES DE USUARIOS");

  const usuarios = parser.getUsuarios();
  const rolesInvalidos: string[] = [];
  const rolesValidos = new Set([
    "Gerencia",
    "Asesor",
    "Coordinador de Operaciones",
    "Coordinador Integral de Ventas",
    "GC Equi/Alqui",
    "GC Lub/Fil",
    "GC Servicios",
    "GC Repuestos",
  ]);

  usuarios.forEach((u) => {
    if (!rolesValidos.has(u.rol) && u.rol !== "") {
      rolesInvalidos.push(`${u.nombre} -> ${u.rol}`);
    }
  });

  if (rolesInvalidos.length > 0) {
    Logger.error(`Roles inválidos detectados (${rolesInvalidos.length}):`);
    rolesInvalidos.slice(0, 20).forEach((r) => Logger.error(`  ${r}`));
    if (rolesInvalidos.length > 20) {
      Logger.error(`  ... y ${rolesInvalidos.length - 20} más`);
    }
    throw new Error("Se detectaron roles de usuario inválidos en el Excel");
  }

  Logger.success("Todos los roles de usuarios son válidos y están normalizados");
}

/**
 * Test 3: EXCLUSIÓN MACHINE SHOP
 */
async function testExclusionMachineShop(parser: ExcelParser) {
  Logger.section('TEST 3: EXCLUSIÓN DE "Machine Shop"');

  const meses = [5];
  const anio = 2026;

  const oportunidades = parser.getOportunidades(meses, anio);
  const conMachineShop = oportunidades.filter((o) => o.sucursal.toLowerCase() === "machine shop");

  Logger.info(`Filas de Oportunidades con Machine Shop (debe ser 0): ${conMachineShop.length}`);

  if (conMachineShop.length === 0) {
    Logger.success("✓ Machine Shop fue excluido correctamente");
  } else {
    Logger.error("✗ Se encontraron filas de Machine Shop que deberían estar excluidas");
  }

  const sucursalesUnicas = [...new Set(oportunidades.map((o) => o.sucursal))];
  Logger.subsection("Sucursales únicas en Oportunidades");
  sucursalesUnicas.forEach((s) => Logger.info(`  - "${s}"`));
}

/**
 * Test 4: OPORTUNIDADES
 */
async function testOportunidades(parser: ExcelParser) {
  Logger.section("TEST 4: OPORTUNIDADES");

  const meses = [5];
  const anio = 2026;

  const oportunidades = parser.getOportunidades(meses, anio);
  Logger.info(
    `Total de oportunidades cargadas (mes ${meses}, año ${anio}): ${oportunidades.length}`,
  );

  if (oportunidades.length === 0) {
    Logger.warning("No se encontraron oportunidades para este mes/año");
    return;
  }

  Logger.subsection("Primeras 5 oportunidades");
  oportunidades.slice(0, 5).forEach((o, i) => {
    Logger.info(`${i + 1}. ${o.sucursal} | ${o.cliente} | ${o.etapa} | $${o.monto}`);
  });

  Logger.subsection("Desglose por Unidad de Negocio");
  const porUnidad: { [key: string]: number } = {};
  oportunidades.forEach((o) => {
    porUnidad[o.unNegocio] = (porUnidad[o.unNegocio] || 0) + 1;
  });

  Object.entries(porUnidad).forEach(([un, count]) => {
    Logger.info(`  ${un}: ${count} oportunidades`);
  });

  Logger.success("Test de oportunidades completado");
}

/**
 * Test 5: OPORTUNIDADES LUB/FILTROS
 */
async function testOportunidadesLubFiltros(parser: ExcelParser) {
  Logger.section("TEST 5: OPORTUNIDADES LUB/FILTROS (AGRUPADAS)");

  const meses = [5];
  const anio = 2026;

  const grupos = parser.getOportunidadesLubFiltros(meses, anio);
  Logger.info(`Cotizaciones agrupadas (mes ${meses}, año ${anio}): ${grupos.length}`);

  if (grupos.length === 0) {
    Logger.warning("No se encontraron cotizaciones de Lub/Filtros para este mes/año");
    return;
  }

  Logger.subsection("Primeras 5 cotizaciones agrupadas");
  grupos.slice(0, 5).forEach((g, i) => {
    const etapa = parser.normalizarEtapaLubFiltros(g.estatus);
    Logger.info(`${i + 1}. ${g.sucursal} | ${g.cliente} | "${g.estatus}" → ${etapa} | $${g.monto}`);
  });

  Logger.subsection("Mapeo de Estatus a Etapa");
  const estatusUnicos = [...new Set(grupos.map((g) => g.estatus))];
  estatusUnicos.forEach((estatus) => {
    const etapa = parser.normalizarEtapaLubFiltros(estatus);
    Logger.info(`  "${estatus}" → ${etapa || "❌ SIN MAPEO"}`);
  });

  Logger.success("Test de Lub/Filtros completado");
}

/**
 * Test 6: CUMPLIMIENTO BASE
 */
async function testCumplimientoBase(parser: ExcelParser) {
  Logger.section("TEST 6: CUMPLIMIENTO BASE");

  const meses = [5];
  const anio = 2026;

  const cumplimiento = parser.getCumplimientoBase(meses, anio);
  Logger.info(
    `Filas de CumplimientoBase cargadas (mes ${meses}, año ${anio}): ${cumplimiento.length}`,
  );

  if (cumplimiento.length === 0) {
    Logger.warning("No se encontraron datos de CumplimientoBase para este mes/año");
    return;
  }

  Logger.subsection("Primeras 5 filas");
  cumplimiento.slice(0, 5).forEach((c, i) => {
    Logger.info(
      `${i + 1}. ${c.sucursal} | ${c.unNegocio} | Presupuesto: $${c.presupuesto} | Venta Real: $${c.ventaReal}`,
    );
  });

  Logger.subsection("Desglose por Unidad de Negocio");
  const porUnidad: { [key: string]: { presupuesto: number; ventaReal: number } } = {};
  cumplimiento.forEach((c) => {
    if (!porUnidad[c.unNegocio]) {
      porUnidad[c.unNegocio] = { presupuesto: 0, ventaReal: 0 };
    }
    porUnidad[c.unNegocio].presupuesto += c.presupuesto;
    porUnidad[c.unNegocio].ventaReal += c.ventaReal;
  });

  Object.entries(porUnidad).forEach(([un, data]) => {
    const pct = data.presupuesto > 0 ? Math.round((data.ventaReal / data.presupuesto) * 100) : 0;
    Logger.info(`  ${un}: Presupuesto $${data.presupuesto} | Venta $${data.ventaReal} | ${pct}%`);
  });

  Logger.success("Test de Cumplimiento Base completado");
}

/**
 * Test 7: CUENTAS POR COBRAR
 */
async function testCuentasPorCobrar(parser: ExcelParser) {
  Logger.section("TEST 7: CUENTAS POR COBRAR");

  const cuentas = parser.getCuentasPorCobrar(2026);
  Logger.info(`Total de cuentas por cobrar: ${cuentas.length}`);

  if (cuentas.length === 0) {
    Logger.warning("No se encontraron cuentas por cobrar");
    return;
  }

  Logger.subsection("Primeras 5 cuentas");
  cuentas.slice(0, 5).forEach((c, i) => {
    Logger.info(`${i + 1}. ${c.cliente} | ${c.sucursal} | $${c.monto} | ${c.diasVencido} días`);
  });

  Logger.subsection("Desglose por Unidad de Negocio");
  const porUnidad: { [key: string]: number } = {};
  cuentas.forEach((c) => {
    porUnidad[c.unNegocio] = (porUnidad[c.unNegocio] || 0) + 1;
  });

  Object.entries(porUnidad).forEach(([un, count]) => {
    Logger.info(`  ${un}: ${count} cuentas`);
  });

  Logger.success("Test de Cuentas por Cobrar completado");
}

/**
 * Test 8: VENTAS PERDIDAS
 */
async function testVentasPerdidas(parser: ExcelParser) {
  Logger.section("TEST 8: VENTAS PERDIDAS");

  const meses = [6];
  const anio = 2026;

  const ventasPerdidas = parser.getVentasPerdidas(meses, anio);
  Logger.info(`Ventas perdidas cargadas (mes ${meses}, año ${anio}): ${ventasPerdidas.length}`);

  if (ventasPerdidas.length === 0) {
    Logger.warning("No se encontraron ventas perdidas para este mes/año");
    return;
  }

  Logger.subsection("Primeras 5 ventas perdidas");
  ventasPerdidas.slice(0, 5).forEach((vp, i) => {
    Logger.info(`${i + 1}. ${vp.cliente} | $${vp.monto} | Razón: ${vp.razon}`);
  });

  Logger.subsection("Desglose por Unidad de Negocio");
  const porUnidad: { [key: string]: number } = {};
  ventasPerdidas.forEach((vp) => {
    const un = parser.clasificarUnidadVentaPerdida(vp.area, vp.suplidor);
    if (un) {
      porUnidad[un] = (porUnidad[un] || 0) + vp.monto;
    }
  });

  Object.entries(porUnidad).forEach(([un, monto]) => {
    Logger.info(`  ${un}: $${monto}`);
  });

  Logger.subsection("Top 5 razones de ventas perdidas");
  const razonesConteo: { [key: string]: number } = {};
  ventasPerdidas.forEach((vp) => {
    razonesConteo[vp.razon] = (razonesConteo[vp.razon] || 0) + vp.monto;
  });

  Object.entries(razonesConteo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([razon, monto], i) => {
      Logger.info(`${i + 1}. ${razon}: $${monto}`);
    });

  Logger.success("Test de Ventas Perdidas completado");
}

/**
 * Test 9: FACTURACIÓN
 */
async function testFacturacion(parser: ExcelParser) {
  Logger.section("TEST 9: FACTURACIÓN");

  const meses = [5];
  const anio = 2026;

  const facturacion = parser.getFacturacion(meses, anio);
  Logger.info(`Facturas cargadas (mes ${meses}, año ${anio}): ${facturacion.length}`);

  if (facturacion.length === 0) {
    Logger.warning("No se encontraron facturas para este mes/año");
    return;
  }

  Logger.subsection("Primeras 5 facturas");
  facturacion.slice(0, 5).forEach((f, i) => {
    Logger.info(`${i + 1}. ${f.sucursal} | ${f.cliente} | ${f.tipoNegocio} | BR: $${f.montoBR}`);
  });

  Logger.subsection("Desglose por Tipo de Negocio");
  const porTipo: { [key: string]: { count: number; monto: number } } = {};
  facturacion.forEach((f) => {
    if (!porTipo[f.tipoNegocio]) {
      porTipo[f.tipoNegocio] = { count: 0, monto: 0 };
    }
    porTipo[f.tipoNegocio].count++;
    porTipo[f.tipoNegocio].monto += f.montoBR;
  });

  Object.entries(porTipo).forEach(([tipo, data]) => {
    Logger.info(`  ${tipo}: ${data.count} facturas | $${data.monto}`);
  });

  Logger.success("Test de Facturación completado");
}

/**
 * Test 10: SERVICIOS
 */
async function testServicios(parser: ExcelParser) {
  Logger.section("TEST 10: SERVICIOS");

  const meses = [5];
  const anio = 2026;

  const servicios = parser.getServicios(meses, anio);
  Logger.info(`Servicios cargados (mes ${meses}, año ${anio}): ${servicios.length}`);

  if (servicios.length === 0) {
    Logger.warning("No se encontraron servicios para este mes/año");
    return;
  }

  Logger.subsection("Primeros 5 servicios");
  servicios.slice(0, 5).forEach((s, i) => {
    Logger.info(`${i + 1}. ${s.sucursal} | ${s.cliente} | $${s.monto}`);
  });

  const totalServicios = servicios.reduce((sum, s) => sum + s.monto, 0);
  Logger.info(`\nTotal de servicios: $${totalServicios}`);

  Logger.success("Test de Servicios completado");
}

/**
 * Test 11: LUBRICANTES/FILTROS
 */
async function testLubricantesFiltos(parser: ExcelParser) {
  Logger.section("TEST 11: LUBRICANTES/FILTROS");

  const meses = [5];
  const anio = 2026;

  const lubFiltros = parser.getLubricantesFiltos(meses, anio);
  Logger.info(`Lubricantes/Filtros cargados (mes ${meses}, año ${anio}): ${lubFiltros.length}`);

  if (lubFiltros.length === 0) {
    Logger.warning("No se encontraron Lubricantes/Filtros para este mes/año");
    return;
  }

  Logger.subsection("Primeros 5 registros");
  lubFiltros.slice(0, 5).forEach((l, i) => {
    Logger.info(`${i + 1}. ${l.sucursal} | ${l.cliente} | ${l.nombreVendedor} | $${l.monto}`);
  });

  const totalLub = lubFiltros.reduce((sum, l) => sum + l.monto, 0);
  Logger.info(`\nTotal Lubricantes/Filtros: $${totalLub}`);

  Logger.success("Test de Lubricantes/Filtros completado");
}

/**
 * Test 12: CUMPLIMIENTO ASESORES
 */
async function testCumplimientoAsesores(parser: ExcelParser) {
  Logger.section("TEST 12: CUMPLIMIENTO POR ASESORES");

  const meses = [5];
  const anio = 2026;

  const cumplimiento = parser.getCumplimientoAsesores(meses, anio);
  Logger.info(
    `Registros de CumplimientoAsesoresBase (mes ${meses}, año ${anio}): ${cumplimiento.length}`,
  );

  if (cumplimiento.length === 0) {
    Logger.warning("No se encontraron datos de CumplimientoAsesoresBase para este mes/año");
    return;
  }

  Logger.subsection("Primeros 5 asesores");
  cumplimiento.slice(0, 5).forEach((c, i) => {
    Logger.info(`${i + 1}. ${c.asesor} (${c.codigoAsesor}) | ${c.sucursal} | ${c.unNegocio}`);
    Logger.info(
      `   Presupuesto: $${c.presupuesto} | Venta: $${c.venta} | Cumplimiento: ${c.pctCumplimiento}%`,
    );
  });

  Logger.subsection("Top 5 asesores por venta");
  cumplimiento
    .sort((a, b) => b.venta - a.venta)
    .slice(0, 5)
    .forEach((c, i) => {
      Logger.info(`${i + 1}. ${c.asesor}: $${c.venta}`);
    });

  Logger.success("Test de Cumplimiento por Asesores completado");
}

// Ejecutar todos los tests
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
  Logger.error(`Error durante la ejecución de tests: ${error.message}`);
  process.exit(1);
});
