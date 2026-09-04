/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import * as path from "path";

/**
 * Parser para leer y procesar datos del archivo Excel CCV Rendimiento.xlsx
 * Implementa todas las reglas del PRD
 */

// Interfaces
export interface Usuario {
  nombre: string;
  rol: string;
  email: string;
  codigo: string;
  sucursal: string;
  asesoresAsignados: string[];
  unidadesNegocio?: string[];
  contraseña?: string;
}

export interface Oportunidad {
  compania: string;
  sucursal: string;
  codigoAsesor: string;
  etapa: string;
  monto: number;
  montoFacturado: number;
  montoPerdida: number;
  unNegocio: string;
  cliente: string;
}

export interface Factura {
  sucursal: string;
  cliente: string;
  codigoAsesor: string;
  nombreAsesor: string;
  tipoNegocio: string;
  montoBR: number;
  montoN: number;
  montoBC: number;
  esOtraEmpresa: boolean;
  cotizacion: string;
}

export interface ClientePotencialItem {
  idClientePotencial: number | null;
  sucursal: string;
  tipoNegocio: string | null;
  razonSocial: string | null;
  nombreContacto: string | null;
  correo: string | null;
  telefono: string | null;
  identificacionFiscal: string | null;
  fechaDetectada: string | null; // ISO "YYYY-MM-DD"
  estatusBis: string | null;
  etapaOportunidad: string | null;
  tomaContacto: string | null;
  campana: string | null;
  usuarioAsignado: string | null;
  ingresosEsperados: number;
  montoFacturadoBase: number;
}

export interface RawRowData {
  [key: string]: any;
}

// Constantes de normalización
const SUCURSAL_CANONICA: { [key: string]: string } = {
  "los ruices": "Caracas",
  caracas: "Caracas",
  "fmo piar": "FMO Piar",
  "proy.fmo ciudad piar": "FMO Piar",
  "proyecto fmo ciudad piar": "FMO Piar",
  "puerto ordaz": "Puerto Ordaz",
  "puerto la cruz": "Puerto La Cruz",
  barquisimeto: "Barquisimeto",
  valencia: "Valencia",
  maracaibo: "Maracaibo",
  "punto fijo": "Punto Fijo",
  maturin: "Maturín",
  maturín: "Maturín",
  "san cristobal": "San Cristóbal",
  "san cristóbal": "San Cristóbal",
  "direccion general": "Dirección General",
  // Código AS400 46. No es sucursal comercial regular — se excluye de
  // cotizaciones/ventas_perdidas (ver debeExcluir), pero SÍ factura en
  // Oportunidades Detallado y el cuadro real la contabiliza ahí (confirmado
  // con el usuario 2026-09-01). Necesita FK propia para no perderse en
  // getFacturasPrincipales(), que no la excluye.
  "machine shop": "Machine Shop",
};

export const SUCURSALES_CANONICAS: string[] = Array.from(new Set(Object.values(SUCURSAL_CANONICA)));

// Clientes con variantes de nombre inconsistentes entre fuentes AS400/CRM.
// Diccionario creciente por caso detectado (confirmado con el usuario
// 2026-09-01) — no una heurística general de sufijos "C.A."/"CA", porque
// reescribir mal un nombre de cliente real es peor que dejar pasar una
// variante nueva sin normalizar.
// Match por PREFIJO (no exacto): el AS400/CRM trunca o duplica el nombre de
// formas impredecibles (ej. "CARDON IV, S.A. (CARDON IV, S." truncado a mitad
// del paréntesis) — exigir match exacto dejaría pasar variantes nuevas sin
// normalizar. El prefijo es lo suficientemente distintivo para no confundir
// con otro cliente real.
const CLIENTE_CANONICO_POR_PREFIJO: Array<{ prefijo: string; canonico: string }> = [
  { prefijo: "visco orinoco", canonico: "VISCO ORINOCO, C.A" },
  { prefijo: "cardon iv", canonico: "CARDON IV, S.A." },
];

// Clientes cuya sucursal real es fija sin importar qué diga el reporte de
// origen — clave en minúsculas del nombre YA canonicalizado (CLIENTE_CANONICO).
const CLIENTE_SUCURSAL_FIJA: { [clienteCanonicoLower: string]: string } = {
  "cardon iv, s.a.": "Punto Fijo",
  // Pedido del usuario 2026-09-04: Visco no tiene sucursal real en el
  // crudo (Cod.Suc/Sucursal vienen inconsistentes) -- se fija a FMO Piar
  // en Tradicionales, Lubricantes/Filtros y Oportunidades Detallado.
  "visco orinoco, c.a": "FMO Piar",
};

// Clientes "venta casa": nunca tienen asesor asignado, aunque el reporte de
// origen traiga uno relacionado — clave en minúsculas del nombre canónico.
const CLIENTES_SIN_ASESOR = new Set<string>(["visco orinoco, c.a"]);
export const UNIDADES_CANONICAS: string[] = [
  "Repuestos",
  "Lubricantes/Filtros",
  "Servicios",
  "Equipos",
  "Alquiler",
];

// Tokens informales de la columna "UnidadesNegocio" (hoja Usuarios) → nombre
// canónico real en unidades_negocio. La mayoría ya coincide en minúsculas,
// salvo "lubFiltros"/"lub/fil", que no tiene ningún caracter en común con
// "Lubricantes/Filtros" y por eso necesita mapeo explícito.
const UNIDAD_TOKEN_CANONICA: { [token: string]: string } = {
  repuestos: "Repuestos",
  lubfiltros: "Lubricantes/Filtros",
  "lub/fil": "Lubricantes/Filtros",
  "lubricantes/filtros": "Lubricantes/Filtros",
  servicios: "Servicios",
  equipos: "Equipos",
  alquiler: "Alquiler",
};

/** Normaliza un token informal de unidad de negocio (columna "UnidadesNegocio") a su nombre canónico. */
export function normalizarUnidadNegocioToken(token: string): string | null {
  const key = token.trim().toLowerCase().replace(/\s+/g, "");
  return UNIDAD_TOKEN_CANONICA[key] ?? null;
}

/**
 * "31-07-2026" → "2026-07-31". Devuelve null si el valor no encaja. Acepta
 * también un Date real por si Excel llega a tipar la celda como fecha.
 */
export function parseFechaDDMMYYYY(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }
  const texto = (valor ?? "").toString().trim();
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(texto);
  if (!match) return null;
  const [, dia, mes, anio] = match;
  return `${anio}-${mes}-${dia}`;
}

const ROLES_USUARIO_CANONICAS: { [key: string]: string } = {
  gerencia: "Gerencia",
  asesor: "Asesor",
  "coordinador de operaciones": "Coordinador de Operaciones",
  "coordinador integral de ventas": "Coordinador Integral de Ventas",
  "gc equi/alqui": "GC Equi/Alqui",
  "gc equi alqui": "GC Equi/Alqui",
  "gc lub/fil": "GC Lub/Fil",
  "gc lub fil": "GC Lub/Fil",
  "gc servicios": "GC Servicios",
  "gc repuestos": "GC Repuestos",
};

const ROLES_USUARIO_VALIDOS = new Set(Object.values(ROLES_USUARIO_CANONICAS));

export type AppRole = "gerencia" | "gerente_comercial" | "coordinador" | "asesor";

/**
 * Mapea la etiqueta de rol de la hoja Usuarios (8 valores) al enum app_role
 * (4 valores) del esquema real, más la unidad_negocio implícita para los
 * roles "GC *".
 */
export function mapRolToAppRole(rolLabel: string): { role: AppRole; unidadNegocio: string | null } {
  switch (rolLabel) {
    case "Gerencia":
      return { role: "gerencia", unidadNegocio: null };
    case "Coordinador de Operaciones":
    case "Coordinador Integral de Ventas":
      return { role: "coordinador", unidadNegocio: null };
    case "GC Repuestos":
      return { role: "gerente_comercial", unidadNegocio: "Repuestos" };
    case "GC Lub/Fil":
      return { role: "gerente_comercial", unidadNegocio: "Lubricantes/Filtros" };
    case "GC Servicios":
      return { role: "gerente_comercial", unidadNegocio: "Servicios" };
    case "GC Equi/Alqui":
      return { role: "gerente_comercial", unidadNegocio: "Equipos" };
    case "Asesor":
    default:
      return { role: "asesor", unidadNegocio: null };
  }
}

// Nombres canónicos de unidades_negocio en el esquema real (supabase/migrations).
export const UNIDAD_REPUESTOS = "Repuestos";
export const UNIDAD_LUBFILTROS = "Lubricantes/Filtros";
export const UNIDAD_SERVICIOS = "Servicios";
export const UNIDAD_EQUIPOS = "Equipos";
export const UNIDAD_ALQUILER = "Alquiler";
/** @deprecated Usar UNIDAD_EQUIPOS o UNIDAD_ALQUILER según corresponda */
export const UNIDAD_EQUIPOS_ALQUILER = "Equipos/Alquiler";

/**
 * Palabras clave que clasifican el texto libre de "Unidad de Negocio" /
 * "Tipo de Negocio" / "U/N" en una de las 5 unidades reales. ÚNICO lugar a
 * tocar si el Excel introduce una categoría de producto nueva que hoy cae en
 * "no reconocida" (ver getUnidadesNegocioNoReconocidas / el warning que
 * imprime `bun run load-excel`). El orden importa: se evalúa de arriba hacia
 * abajo y gana la primera unidad cuyas keywords matcheen (ej. "equipo" antes
 * que "alquiler" para no confundir "alquiler de equipos").
 */
const UNIDAD_NEGOCIO_KEYWORDS: { unidad: string; keywords: string[] }[] = [
  { unidad: UNIDAD_EQUIPOS, keywords: ["equipo"] },
  {
    unidad: UNIDAD_ALQUILER,
    // Categorías de producto de alquiler que no traen la palabra "alquiler"
    // en la hoja "Cuentas por Cobrar" (montacargas, módulo de potencia,
    // planta eléctrica) — es texto libre de negocio, no un typo de "alquiler".
    keywords: ["alquiler", "montacargas", "modulo de potencia", "planta electrica"],
  },
  { unidad: UNIDAD_SERVICIOS, keywords: ["servicio"] },
  { unidad: UNIDAD_LUBFILTROS, keywords: ["lubricante", "filtro", "lub"] },
  { unidad: UNIDAD_REPUESTOS, keywords: ["repuesto"] },
];

/**
 * Categorías de negocio que existen en el Excel pero deliberadamente no se
 * mapean a ninguna de las 5 unidades (fuera de alcance del dashboard) — se
 * excluyen del warning de "no reconocidos" para no generar ruido en cada
 * carga. Agregar aquí, no en UNIDAD_NEGOCIO_KEYWORDS, cualquier categoría que
 * el negocio decida ignorar en vez de clasificar.
 */
const UNIDAD_NEGOCIO_IGNORADOS = new Set(["entrenamiento tecnico"]);

/** Distancia de edición (Levenshtein) — para tolerar typos de la fuente sin listarlos uno a uno. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * true si `keyword` aparece en `text` literalmente, o como un typo cercano
 * (una palabra de `text` de longitud similar dentro de distancia de edición
 * tolerable). Cubre variantes como "aquiler"/"alkiler" sin necesidad de
 * agregar cada typo a mano.
 */
function fuzzyIncludes(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true;
  const maxDistance = keyword.length <= 6 ? 1 : 2;
  const words = text.split(/\s+/);
  return words.some(
    (w) =>
      Math.abs(w.length - keyword.length) <= maxDistance && levenshtein(w, keyword) <= maxDistance,
  );
}

// Mapeo de valores raw del Excel → enum cotizacion_etapa (4 valores)
const ETAPA_CANONICA: {
  [key: string]: "desarrollo" | "propuesta_negociacion" | "venta_perdida" | "desconocido";
} = {
  // Valores raw de hoja Oportunidades (Etapa de Ventas)
  "re-impresa": "desarrollo",
  activa: "desarrollo",
  impresa: "desarrollo",
  "convertida en orden": "propuesta_negociacion",
  "venta perdida": "venta_perdida",
  cerrada: "venta_perdida",
  expirada: "desconocido",
  // Valores intermedios devueltos por normalizarEtapaLubFiltros
  desarrollo: "desarrollo",
  propuesta_negociacion: "propuesta_negociacion",
  desconocido: "desconocido",
};

export interface Cotizacion {
  fecha: string | null;
  cliente: string;
  asesor: string; // Nombre completo (para FK lookup en load-excel)
  asesorCodigo?: string; // Código del asesor → columna asesor_codigo en DB
  nroCotizacion?: string;
  sucursal: string;
  unidadNegocio: string | null;
  monto: number;
  montoFacturado?: number;
  montoPerdido?: number;
  etapa: string;
  descripcion?: string;
}

export interface FacturaNueva {
  fecha: string | null;
  numero: string;
  cliente: string;
  asesor: string;
  codigoAsesor?: string;
  sucursal: string;
  unidadNegocio: string | null;
  monto: number;
}

export interface VentaPerdidaNueva {
  fecha: string | null;
  cliente: string;
  asesor: string;
  sucursal: string;
  unidadNegocio: string | null;
  monto: number;
  razon: string;
}

export interface PresupuestoNuevo {
  anio: number;
  mes: number;
  sucursal: string;
  unidadNegocio: string | null;
  monto: number;
  ventasCCV: number;
  ventasXibi: number;
  ventasEstrategicas: number;
}

export interface CumplimientoAsesorNuevo {
  anio: number;
  mes: number;
  codigoAsesor: string;
  asesor: string;
  sucursal: string;
  unidadNegocio: string | null;
  presupuesto: number;
  venta: number;
  pctCumplimiento: number;
  pctParticipacion: number;
}

export interface CobranzaNueva {
  cliente: string;
  facturaNumero: string;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  monto: number;
  saldo: number;
  diasVencidos?: number;
  sucursal: string;
  unidadNegocio: string | null;
}

export interface ServicioNuevo {
  fecha: string | null;
  cliente: string;
  monto: number;
  tipoServicio: string;
  categoriaVenta: string;
  compania: string;
  asesor: string;
  taller?: string;
  csa?: string;
  sucursal: string;
  unidadNegocio: string | null;
}

export interface DetalleServicioEstrategico {
  sucursal: string;
  mes: number;
  tipoServicio: string;
  monto: number;
}

export interface EquipoInventarioItem {
  marca: string;
  tipoEquipo: string;
  disponible: number;
  transito: number;
  stockDisponible: number;
  stockTransito: number;
}

export interface EquipoDetalleVenta {
  sucursal: string;
  marca: string;
  monto: number;
  mes: number;
  anio: number;
}

export interface DetalleVentaLubfiltros {
  marca: string;
  mes: number;
  ventasCcv: number;
  ventasXibi: number;
  ventasEstrategicas: number;
  montoTotal: number;
}

export interface DetalleVentaRepuestos {
  marca: string;
  mes: number;
  ventasCcv: number;
  ventasXibi: number;
  montoTotal: number;
}

export interface InventarioLubfiltrosItem {
  tipo: "Lubricantes" | "Filtros";
  proveedorCodigo: string;
  sucursal: string;
  monto: number;
}

import * as fs from "fs";

export class ExcelParser {
  private workbook: XLSX.WorkBook;
  // Varios métodos leen la misma hoja (p.ej. el neteo de cotizaciones vs.
  // Lub/Filtros documentado en CLAUDE.md) — cachear evita re-parsear hojas
  // grandes de miles de filas con sheet_to_json() más de una vez por carga.
  private hojaCache = new Map<string, RawRowData[]>();
  // Valores de "Unidad de Negocio"/"Tipo de Negocio" que no matchearon ninguna
  // keyword — se reportan al final de la carga (ver getUnidadesNegocioNoReconocidas)
  // en vez de descartarse en silencio.
  private unidadesNoReconocidas = new Map<string, number>();
  // Hojas pedidas por leerHoja() que no existen en el workbook — antes se
  // devolvía [] en silencio, indistinguible de "la hoja existe pero está
  // vacía". Se reportan al final de la carga (ver getHojasFaltantes()).
  private hojasFaltantes = new Set<string>();
  // Valores no vacíos que parseNumber() no pudo interpretar como número —
  // antes se devolvían como 0, indistinguible de un cero real. Se reportan
  // al final de la carga (ver getValoresNumericosInvalidos()).
  private valoresNumericosInvalidos = new Map<string, number>();

  /**
   * `preParsed` permite saltarse XLSX.read()/sheet_to_json() aquí (trabajo
   * síncrono pesado que bloquea el event loop) cuando esas hojas ya fueron
   * extraídas en un worker thread — ver parseExcelInWorker() y su uso en
   * src/lib/actions/carga.ts. Uso normal (CLI, scripts): solo pasar `source`.
   */
  constructor(
    source: string | Buffer,
    preParsed?: { sheetNames: string[]; sheets: Record<string, RawRowData[]> },
  ) {
    if (preParsed) {
      this.workbook = { SheetNames: preParsed.sheetNames, Sheets: {} } as XLSX.WorkBook;
      for (const [nombre, datos] of Object.entries(preParsed.sheets)) {
        this.hojaCache.set(nombre, datos);
      }
      console.log("\n🔍 HOJAS DETECTADAS EN EL EXCEL (pre-parseadas):", preParsed.sheetNames, "\n");
      return;
    }
    const fileBuffer = typeof source === "string" ? fs.readFileSync(source) : source;
    this.workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    console.log("\n🔍 HOJAS DETECTADAS EN EL EXCEL:", this.workbook.SheetNames, "\n");
  }

  /**
   * Obtiene todos los nombres de las hojas del archivo Excel y los imprime en el log
   */
  obtenerNombresHojas(): string[] {
    const hojas = this.workbook.SheetNames;
    console.log("\n📋 HOJAS ENCONTRADAS EN EL ARCHIVO:");
    hojas.forEach((hoja, index) => {
      console.log(`  ${index + 1}. "${hoja}"`);
    });
    console.log("");
    return hojas;
  }

  /**
   * Normaliza nombre de sucursal según reglas del PRD
   */
  private normalizarSucursal(sucursal: string): string {
    if (!sucursal) return "";

    const lower = sucursal
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ");
    return SUCURSAL_CANONICA[lower] || sucursal.toString().trim();
  }

  private normalizarRol(rol: any): string {
    if (!rol) return "";

    const value = rol.toString().trim();
    const lower = value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ");
    return ROLES_USUARIO_CANONICAS[lower] || value;
  }

  private normalizarTexto(value: any): string {
    if (!value) return "";
    return value.toString().trim();
  }

  /**
   * Excluye Machine Shop de cualquier fila
   */
  private debeExcluir(sucursal: string): boolean {
    if (!sucursal) return false;
    return sucursal.trim().toLowerCase() === "machine shop";
  }

  /**
   * Machine Shop y Maturín son sucursales sin cumplimiento regular — la mayoría
   * de sus filas en CumplimientoBase son placeholders en cero. Pero si un mes
   * concreto trae movimiento real (presupuesto o alguna venta != 0), esa fila
   * debe contarse — de lo contrario el total de cumplimiento queda subestimado
   * en los meses donde sí operaron.
   */
  private debeExcluirCumplimiento(sucursal: string, montos: number[]): boolean {
    const normalizada = this.normalizarSucursal(sucursal).trim().toLowerCase();
    const esSucursalSinCumplimientoRegular =
      normalizada === "machine shop" || normalizada === "maturín";
    if (!esSucursalSinCumplimientoRegular) return false;
    return montos.every((m) => m === 0);
  }

  /**
   * Lee una hoja del workbook y retorna los datos
   */
  private leerHoja(nombreHoja: string): RawRowData[] {
    const cached = this.hojaCache.get(nombreHoja);
    if (cached) return cached;

    const sheet = this.workbook.Sheets[nombreHoja];
    if (!sheet) {
      this.hojasFaltantes.add(nombreHoja);
      return [];
    }

    const datos = XLSX.utils.sheet_to_json<RawRowData>(sheet);
    this.hojaCache.set(nombreHoja, datos);
    return datos;
  }

  /**
   * Hoja: Usuarios
   */
  getUsuarios(): Usuario[] {
    const datos = this.leerHoja("Usuarios");

    return datos.map((row) => ({
      nombre: this.normalizarTexto(row["Nombre"]),
      rol: this.normalizarRol(row["Rol"]),
      email: this.normalizarTexto(row["Email"]),
      codigo: this.normalizarTexto(row["Codigo"]),
      sucursal: this.normalizarSucursal(row["Sucursal"]),
      asesoresAsignados: (row["AsesoresAsignados"] || "")
        .toString()
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0),
      unidadesNegocio: (row["UnidadesNegocio"] || "")
        .toString()
        .split(",")
        .map((s: string) => normalizarUnidadNegocioToken(s))
        .filter((s: string | null): s is string => s !== null),
      contraseña: this.normalizarTexto(row["Contraseña"]),
    }));
  }

  /**
   * Hoja: Oportunidades
   */
  getOportunidades(meses: number[], anio: number): Oportunidad[] {
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
        montoPerdida: this.parseNumber(row["Monto Venta Perdida Base"]),
        unNegocio: row["Tipo de Negocio"] || "",
        cliente: this.determinarCliente(row),
      }));
  }

  /**
   * Hoja: Oportunidades LubFiltros (agrupadas por Nro. Cotización)
   */
  getOportunidadesLubFiltros(meses: number[], anio: number): any[] {
    const datos = this.leerHoja("Oportunidades LubFiltros");

    const filtradas = datos.filter((row) => {
      const { mes, anio: anioRow } = this.parsePeriodo(
        row,
        "Fecha Cotización",
        "Mes Detectado",
        "Año Detectado",
      );
      const sucursal = row["Nom. Sucursal"] || "";

      return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
    });

    // Agrupar por Nro. Cotización
    const grupos: { [key: string]: any } = {};

    filtradas.forEach((row) => {
      const nroCot = row["Nro. Cotización"];
      const monto = this.parseNumber(row["Monto Cotizado"]);

      if (!grupos[nroCot]) {
        grupos[nroCot] = {
          nroCotizacion: nroCot,
          cliente: row["Nombre del Cliente"] || `Cliente Rapido ${row["Cliente Rápido"]}`,
          sucursal: this.normalizarSucursal(row["Nom. Sucursal"]),
          estatus: row["Estatus Cotización"],
          monto: 0,
        };
      }
      grupos[nroCot].monto += monto;
    });

    return Object.values(grupos);
  }

  getCumplimientoBase(meses: number[], anio: number): any[] {
    const datos = this.leerHoja("CumplimientoBase");

    return datos
      .filter((row) => {
        const mes = this.parseMonth(row["Mes"]);
        const anioRow = this.parseYear(row["Año"]);
        const sucursal = row["Sucursal"] || "";

        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        mes: parseInt(row["Mes"], 10),
        anio: parseInt(row["Año"], 10),
        presupuesto: this.parseNumber(row["Presupuesto"]),
        unNegocio: row["U/N"] || "",
        ventasCCV: this.parseNumber(row["Ventas CCV"]),
        ventasXibi: this.parseNumber(row["Ventas Xibi"]),
        ventasEstrategicas: this.parseNumber(row["Ventas Estrategicas"]),
        ventaReal:
          this.parseNumber(row["Ventas CCV"]) +
          this.parseNumber(row["Ventas Xibi"]) +
          this.parseNumber(row["Ventas Estrategicas"]),
      }));
  }

  /**
   * Hoja: Cuentas por Cobrar
   */
  getCuentasPorCobrar(anio: number): any[] {
    const datos = this.leerHoja("Cuentas por Cobrar");

    return datos
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal Venta"]),
        cliente: row["Nombre Cliente"] || "",
        monto: this.parseNumber(row["TOTAL $"]),
        diasVencido: parseInt(row["Dias Vencidos"] || row["DIAS VENCIDO"], 10) || 0,
        unNegocio: this.clasificarUnidadNegocio(row["Unidad de Negocio"]),
      }))
      .filter((row) => row.unNegocio !== null);
  }

  /**
   * Hoja: Ventas Perdidas
   */
  getVentasPerdidas(meses: number[], anio: number): any[] {
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
        documento: row["Nro. Documento"] || "",
        area: row["Área"] || "",
        suplidor: row["Supl"] || "",
      }));
  }

  /**
   * Hoja: Facturación
   */
  getFacturacion(meses: number[], anio: number): Factura[] {
    const datos = this.leerHoja("Facturacion");

    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes Cierre"], 10);
        return meses.includes(mes);
      })
      .map((row) => {
        const unidadNegocio = this.clasificarUnidadNegocio(row["Tipo de Negocio"]);
        const esOtraEmpresa = (row["Compañia"] || "").toString().trim() === "Otra Empresa";
        let monto: number;
        if (unidadNegocio === UNIDAD_REPUESTOS) {
          if (esOtraEmpresa) {
            monto = this.parseNumber(row["Ingresos Esperados Base"]);
          } else {
            monto = this.parseNumber(row["Monto Efectivo Ventas detallado (Tasa Neg.)"]);
          }
        } else if (unidadNegocio === UNIDAD_ALQUILER || unidadNegocio === UNIDAD_EQUIPOS) {
          monto = this.parseNumber(row["Ingresos Esperados Base"]);
        } else if (esOtraEmpresa) {
          monto = this.parseNumber(row["Ingresos Esperados Base"]);
        } else {
          monto = this.parseNumber(row["Monto Efectivo Ventas detallado (Tasa Neg.)"]);
        }
        return {
          sucursal: this.normalizarSucursal(row["Sucursal"]),
          cliente: row["Nombre de Cuenta"] || "",
          codigoAsesor: row["Código Asesor"] || "",
          nombreAsesor: row["Nombre Asesor"] || "",
          tipoNegocio: row["Tipo de Negocio"] || "",
          monto,
          montoBR: this.parseNumber(row["Monto Efectivo Ventas detallado"]),
          montoN: this.parseNumber(row["Ingresos Esperados Base"]),
          montoBC: this.parseNumber(row["Total Facturado Rptos Base"]),
          esOtraEmpresa,
          cotizacion: row["Nro. Documento"] || "",
        };
      });
  }

  /**
   * Hoja: Servicios
   */
  getServicios(meses: number[], anio: number): any[] {
    const datos = this.leerHoja("Servicios");

    const filtrados = datos.filter((row) => {
      const mes = parseInt(row["Mes Contable"], 10);
      const tipoCliente = row["Tipo Cliente"] || "";
      const sucursal = row["Nombre Sucursal"] || "";

      return meses.includes(mes) && tipoCliente === "EXTERNO" && !this.debeExcluir(sucursal);
    });

    // Agrupar por Numero Factura
    const grupos: { [key: string]: any } = {};

    filtrados.forEach((row) => {
      const nroFactura = row["Numero Factura"];
      const monto = this.parseNumber(row["Monto Venta $"]);

      if (!grupos[nroFactura]) {
        grupos[nroFactura] = {
          nroFactura,
          sucursal: this.normalizarSucursal(row["Nombre Sucursal"]),
          cliente: row["Nombre Cliente"] || "",
          monto: 0,
        };
      }
      grupos[nroFactura].monto += monto;
    });

    return Object.values(grupos);
  }

  /**
   * Hoja: LubricantesFiltros
   */
  getLubricantesFiltos(meses: number[], anio: number): any[] {
    const datos = this.leerHoja("LubricantesFiltros");

    return datos
      .filter((row) => {
        const mes = parseInt(row["Mes"], 10);
        const anioRow = parseInt(row["Año"], 10);
        const sucursal = row["Sucursal"] || "";

        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => {
        let codigoVendedor = row["Cód. Vendedor"];
        let nombreVendedor = row["Vendedor"];

        if (codigoVendedor === "99999") {
          codigoVendedor = row["Cód.Vend.OV"];
          nombreVendedor = row["Nombre Vendedor OV"];
        }

        return {
          sucursal: this.normalizarSucursal(row["Sucursal"]),
          cliente: row["Cliente VNQ"] || "",
          codigoVendedor,
          nombreVendedor,
          monto: this.parseNumber(row["P.V.P. Total $ Extendido"]),
          nroCotizacion: row["Cód. Cliente"] || "",
        };
      });
  }

  /**
   * Hoja: CumplimientoAsesoresBase
   */
  getCumplimientoAsesores(meses: number[], anio: number): any[] {
    const datos = this.leerHoja("CumplimientoAsesoresBase");

    return datos
      .filter((row) => {
        const mes = this.parseMonth(row["Mes"]);
        const anioRow = this.parseYear(row["Año"]);
        const sucursal = row["Sucursal"] || "";

        return meses.includes(mes) && anioRow === anio && !this.debeExcluir(sucursal);
      })
      .map((row) => ({
        codigoAsesor: row["Cod. Asesor"] || "",
        asesor: row["Asesor"] || "",
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        unNegocio: row["U/N"] || "",
        presupuesto: this.parseNumber(row["Monto"]),
        venta: this.parseNumber(row["CUMPLIMIENTO"]),
        pctCumplimiento: this.calcularPorcentaje(
          this.parseNumber(row["CUMPLIMIENTO"]),
          this.parseNumber(row["Monto"]),
        ),
      }));
  }

  /**
   * Determina el cliente según las reglas del PRD
   */
  private determinarCliente(row: RawRowData): string {
    const codCuenta = row["Cód. Cuenta"];
    const nombreCuenta = row["Nombre de Cuenta"];
    const nombrePotencial = row["Nombre de Cliente Potencial"];

    if (!codCuenta && !nombreCuenta) {
      return this.normalizarNombreCliente(
        nombrePotencial ? nombrePotencial.toString() : "Cliente S/N",
      );
    }

    return this.normalizarNombreCliente(
      nombreCuenta ? nombreCuenta.toString() : codCuenta.toString(),
    );
  }

  /**
   * Normaliza nombres de cliente con variantes inconsistentes entre fuentes
   * AS400/CRM ("VISCO ORINOCO, C.A" / "VISCO ORINOCO, CA" / "VISCO ORINOCO" →
   * una sola forma) — confirmado con el usuario 2026-09-01. Diccionario
   * creciente por caso detectado, no una heurística general: reescribir mal
   * un nombre de cliente real es peor que dejar pasar una variante nueva sin
   * normalizar.
   */
  private normalizarNombreCliente(nombre: string): string {
    if (!nombre) return nombre;
    const key = nombre.trim().toLowerCase().replace(/\s+/g, " ");
    const match = CLIENTE_CANONICO_POR_PREFIJO.find((c) => key.startsWith(c.prefijo));
    return match?.canonico ?? nombre.trim();
  }

  /** Sucursal real de clientes cuya sucursal en el reporte de origen no es confiable. */
  private sucursalFijaPorCliente(clienteNormalizado: string): string | null {
    return CLIENTE_SUCURSAL_FIJA[clienteNormalizado.trim().toLowerCase()] ?? null;
  }

  /** true si este cliente es venta "casa": nunca tiene asesor asignado, aunque el reporte traiga uno. */
  private clienteSinAsesor(clienteNormalizado: string): boolean {
    return CLIENTES_SIN_ASESOR.has(clienteNormalizado.trim().toLowerCase());
  }

  /**
   * Clasifica unidad de negocio según texto
   */
  private clasificarUnidadNegocio(texto: string): string | null {
    if (!texto) return null;

    const lower = texto.toLowerCase();
    if (lower.includes("equipo")) return UNIDAD_EQUIPOS;
    if (lower.includes("alquiler")) return UNIDAD_ALQUILER;
    if (lower.includes("servicio")) return UNIDAD_SERVICIOS;
    if (lower.includes("lubricante") || lower.includes("filtro") || lower.includes("lub"))
      return UNIDAD_LUBFILTROS;
    if (lower.includes("repuesto")) return UNIDAD_REPUESTOS;

    return null;
  }

  /**
   * Clasifica unidad de venta perdida según Área y Suplidor
   */
  clasificarUnidadVentaPerdida(area: string, suplidor: string): string | null {
    if (!area) return null;

    const lower = area.toLowerCase();

    if (lower.includes("repuesto")) {
      const codigosLubFiltros = ["CO", "DN", "D1", "NC", "GF"];
      if (suplidor && codigosLubFiltros.includes(suplidor.toUpperCase())) {
        return UNIDAD_LUBFILTROS;
      }
      return UNIDAD_REPUESTOS;
    }

    if (lower.includes("servicio")) return UNIDAD_SERVICIOS;
    if (lower.includes("equipo")) return UNIDAD_EQUIPOS;
    if (lower.includes("alquiler")) return UNIDAD_ALQUILER;

    return null;
  }

  /**
   * Obtiene de forma segura el número de mes (1-12)
   */
  private parseMonth(value: any): number {
    if (value instanceof Date) {
      return value.getMonth() + 1;
    }
    if (typeof value === "number") {
      return value;
    }
    if (!value) return 0;

    const strVal = value.toString().trim();
    if (strVal.includes("-") || strVal.includes("/")) {
      const d = new Date(strVal);
      if (!isNaN(d.getTime())) {
        return d.getMonth() + 1;
      }
    }

    const parsed = parseInt(strVal, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Obtiene de forma segura el año
   */
  private parseYear(value: any): number {
    if (value instanceof Date) {
      return value.getFullYear();
    }
    if (typeof value === "number") {
      return value;
    }
    if (!value) return 0;

    const strVal = value.toString().trim();
    if (strVal.includes("-") || strVal.includes("/")) {
      const d = new Date(strVal);
      if (!isNaN(d.getTime())) {
        return d.getFullYear();
      }
    }

    const parsed = parseInt(strVal, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Convierte a número de forma segura. Excel usa formato europeo: . para miles, , para decimales
   * Ej: 2.083,92 = dos mil ochenta y tres coma noventa y dos
   */
  private registrarValorNumericoInvalido(original: string): void {
    if (
      this.valoresNumericosInvalidos.size >= 20 &&
      !this.valoresNumericosInvalidos.has(original)
    ) {
      return; // tope de 20 ejemplos distintos, no inundar memoria en cargas grandes
    }
    this.valoresNumericosInvalidos.set(
      original,
      (this.valoresNumericosInvalidos.get(original) ?? 0) + 1,
    );
  }

  private parseNumber(value: any): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return value;

    const original = String(value).trim();
    let str = original;
    if (str === "") return 0;

    const lastDotIndex = str.lastIndexOf(".");
    const lastCommaIndex = str.lastIndexOf(",");
    const cantidadPuntos = (str.match(/\./g) ?? []).length;

    if (lastCommaIndex >= 0 && lastDotIndex >= 0) {
      if (lastCommaIndex > lastDotIndex) {
        // Formato europeo: 2.083,92 -> remover puntos, reemplazar coma por punto
        str = str.replace(/\./g, "").replace(/,/g, ".");
      } else {
        // Formato inglés: 2,083.92 -> remover comas
        str = str.replace(/,/g, "");
      }
    } else if (lastCommaIndex >= 0) {
      // Solo comas, sin puntos: 2083,92 -> reemplazar coma por punto
      str = str.replace(/,/g, ".");
    } else if (cantidadPuntos >= 2) {
      // Solo puntos, 2 o más: 1.234.567 -> son separadores de millar (locale
      // venezolano), no decimales — un número real casi nunca trae 2+ puntos
      // literales. parseFloat() sin este fix trunca en el segundo punto
      // (1.234.567 -> 1.234), subestimando el monto ~1000x en silencio.
      str = str.replace(/\./g, "");
    }
    // Un solo punto sin coma (ej. "12.5") se deja tal cual: es ambiguo entre
    // decimal y millar, pero la lectura como decimal es la que ya asumía el
    // resto del código y cambiarla rompería valores hoy correctos.

    // Validación estricta: la cadena completa (tras la normalización de
    // separadores) debe ser un número, no un prefijo aceptado por parseFloat
    // (que hoy convierte silenciosamente "1200 USD" en 1200, o "abc" en 0
    // indistinguible de un cero real).
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
      this.registrarValorNumericoInvalido(original);
      return 0;
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Parsea números con formato de paréntesis contable: (N) -> -N.
   */
  private parseAccountingNumber(value: any): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return value;

    const str = String(value).trim();
    if (!str) return 0;

    const isParentheses = /^\s*\((.+)\)\s*$/.test(str);
    const cleanStr = isParentheses ? str.replace(/^\s*\((.+)\)\s*$/, "$1") : str;
    const num = this.parseNumber(cleanStr);
    return isParentheses ? -Math.abs(num) : num;
  }

  private parseAccountingInt(value: any): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === "number") return Math.round(value);

    const str = String(value).trim();
    if (!str) return 0;

    const isParentheses = /^\s*\((.+)\)\s*$/.test(str);
    const cleanStr = isParentheses ? str.replace(/^\s*\((.+)\)\s*$/, "$1") : str;
    const num = this.parseNumber(cleanStr);
    const intVal = Math.round(num);
    return isParentheses ? -Math.abs(intVal) : intVal;
  }

  /**
   * Calcula porcentaje
   */
  private calcularPorcentaje(numerador: number, denominador: number): number {
    if (denominador === 0) return 0;
    return Math.round((numerador / denominador) * 100);
  }

  /**
   * Normaliza etapa de Lub/Filtros
   */
  normalizarEtapaLubFiltros(estatus: string): string | null {
    if (!estatus) return null;

    const lower = estatus.toLowerCase().trim();

    if (["re-impresa", "impresa", "activa"].includes(lower)) return "desarrollo";
    if (lower === "convertida en orden") return "propuesta_negociacion";
    if (["venta perdida", "cerrada"].includes(lower)) return "venta_perdida";
    if (lower === "expirada") return "desconocido";

    return null;
  }

  /**
   * Normaliza cualquier texto de etapa/estatus de venta al enum cotizacion_etapa
   * ('desarrollo' | 'propuesta_negociacion' | 'venta_perdida' | 'desconocido').
   */
  private normalizarEtapa(texto: string | number | undefined | null): string {
    if (!texto) return "desconocido";
    const lower = texto.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return ETAPA_CANONICA[lower] || "desconocido";
  }

  /**
   * Normaliza "Tipo de Negocio" / "U/N" / "U_N" / el texto libre de
   * "Unidad de Negocio" (Cuentas por Cobrar) a una de las 5 unidades_negocio
   * reales, usando UNIDAD_NEGOCIO_KEYWORDS (match literal + typo-tolerante).
   * Lo que no matchea se registra en `unidadesNoReconocidas` en vez de
   * descartarse en silencio — ver getUnidadesNegocioNoReconocidas().
   */
  private normalizarUnidadNegocio(texto: string | number | undefined | null): string | null {
    if (!texto) return null;
    const original = texto.toString().trim();
    const lower = original.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

    for (const { unidad, keywords } of UNIDAD_NEGOCIO_KEYWORDS) {
      if (keywords.some((k) => fuzzyIncludes(lower, k))) return unidad;
    }

    if (!UNIDAD_NEGOCIO_IGNORADOS.has(lower)) {
      this.unidadesNoReconocidas.set(original, (this.unidadesNoReconocidas.get(original) ?? 0) + 1);
    }
    return null;
  }

  /**
   * Valores de "Unidad de Negocio"/"Tipo de Negocio" vistos durante el parseo
   * que no matchearon ninguna keyword de UNIDAD_NEGOCIO_KEYWORDS, con su
   * conteo de filas. Llamar tras cargar todas las hojas — el loader imprime
   * un warning con esto para que un valor nuevo/typo del Excel se note de
   * inmediato en `bun run load-excel`, en vez de perderse en silencio.
   */
  getUnidadesNegocioNoReconocidas(): { texto: string; filas: number }[] {
    return Array.from(this.unidadesNoReconocidas.entries())
      .map(([texto, filas]) => ({ texto, filas }))
      .sort((a, b) => b.filas - a.filas);
  }

  /**
   * Hojas pedidas durante el parseo que no existen en el workbook — antes
   * `leerHoja()` devolvía [] en silencio. Llamar tras cargar todas las hojas,
   * igual patrón que getUnidadesNegocioNoReconocidas().
   */
  getHojasFaltantes(): string[] {
    return Array.from(this.hojasFaltantes).sort();
  }

  /**
   * Valores no vacíos que parseNumber() no pudo interpretar como número
   * (texto libre, unidades pegadas al monto, etc.) — antes se devolvían como
   * 0, indistinguible de un cero real. Máximo 20 ejemplos distintos para no
   * inundar el log si el problema es sistemático (ej. columna equivocada).
   */
  getValoresNumericosInvalidos(): { texto: string; veces: number }[] {
    return Array.from(this.valoresNumericosInvalidos.entries())
      .map(([texto, veces]) => ({ texto, veces }))
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 20);
  }

  /**
   * Convierte fechas de Excel (Date, dd/mm/yyyy, dd-mm-yyyy, ISO) a 'YYYY-MM-DD'.
   */
  /**
   * Celdas corruptas o mal interpretadas por XLSX (ej. un número de serie de
   * fecha absurdo) producen un Date con getTime() valido pero un año
   * disparatado (5+ digitos) — toISOString() en ese caso usa el formato ISO
   * 8601 extendido ("+046185-01-25T..."), que al recortarse a 10 caracteres
   * queda truncado a mitad de mes ("+046185-01") y rompe el INSERT completo
   * en Postgres. Cualquier año fuera de un rango de negocio razonable se
   * trata como fecha ausente en vez de propagar el dato corrupto.
   */
  private esAnioRazonable(anio: number): boolean {
    return anio >= 1990 && anio <= 2100;
  }

  private excelDateToISO(value: string | number | Date | undefined | null): string | null {
    if (!value) return null;
    if (value instanceof Date) {
      if (isNaN(value.getTime()) || !this.esAnioRazonable(value.getFullYear())) return null;
      return value.toISOString().slice(0, 10);
    }
    const s = value.toString().trim();
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return this.esAnioRazonable(Number(y))
        ? `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
        : null;
    }
    // Serial de fecha de Excel sin formato de fecha en la celda (cellDates:true no lo
    // detecta): "46055" en vez de un objeto Date. Epoch 1899-12-30 ya compensa el bug
    // del año bisiesto 1900 de Excel.
    if (/^\d{4,6}$/.test(s)) {
      const serial = Number(s);
      const fromSerial = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(fromSerial.getTime()) && this.esAnioRazonable(fromSerial.getUTCFullYear())) {
        return fromSerial.toISOString().slice(0, 10);
      }
    }
    const d2 = new Date(s);
    if (isNaN(d2.getTime()) || !this.esAnioRazonable(d2.getFullYear())) return null;
    return d2.toISOString().slice(0, 10);
  }

  /**
   * Extrae mes/año/fecha de una fila de Excel para agrupar por período de reporte.
   * PRIORIDAD: columnas numéricas de mes/año (confiables, reflejan el mes real de
   * la oportunidad/cotización) sobre la columna de fecha exacta (Fecha Detectada /
   * Fecha Cotización), que en este archivo suele ser la fecha de última sincronización
   * del CRM y NO el mes real — usarla como filtro primario agrupa casi todo en un
   * solo mes. La fecha exacta solo se usa como fallback si mes/año no están.
   */
  private parsePeriodo(
    row: any,
    colFecha: string,
    colMes: string,
    colAnio: string,
  ): { fecha: string | null; mes: number; anio: number } {
    let mes = 0;
    let anio = 0;

    const valMes = row[colMes];
    const valAnio = row[colAnio];

    // 1. Prioridad: columnas numéricas de mes/año
    if (valMes !== undefined && valMes !== null) {
      const parsedMes = parseInt(String(valMes).trim(), 10);
      if (!isNaN(parsedMes) && parsedMes >= 1 && parsedMes <= 12) {
        mes = parsedMes;
      }
    }

    if (valAnio !== undefined && valAnio !== null) {
      const parsedAnio = parseInt(String(valAnio).trim(), 10);
      if (!isNaN(parsedAnio) && parsedAnio > 0) {
        anio = parsedAnio;
      }
    }

    // 2. Fallback: fecha exacta, solo si mes/año no vinieron
    let fechaStr: string | null = null;
    const valFecha = row[colFecha];
    if ((mes === 0 || anio === 0) && valFecha) {
      if (valFecha instanceof Date && !isNaN(valFecha.getTime())) {
        if (mes === 0) mes = valFecha.getMonth() + 1;
        if (anio === 0) anio = valFecha.getFullYear();
      } else {
        const s = String(valFecha).trim();
        const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (m) {
          const [, , mo, y] = m;
          if (mes === 0) mes = parseInt(mo, 10);
          if (anio === 0) anio = parseInt(y, 10);
        } else {
          const d2 = new Date(s);
          if (!isNaN(d2.getTime())) {
            if (mes === 0) mes = d2.getMonth() + 1;
            if (anio === 0) anio = d2.getFullYear();
          }
        }
      }
    }

    if (mes >= 1 && mes <= 12 && anio > 0) {
      fechaStr = `${anio}-${String(mes).padStart(2, "0")}-01`;
    }

    return { fecha: fechaStr, mes, anio };
  }

  /**
   * Construye 'YYYY-MM-01' a partir de mes/año numéricos. Se usa para
   * cotizaciones porque las columnas de fecha exacta (Fecha Detectada,
   * Fecha Cotización) no son confiables para filtrar por mes de reporte;
   * Mes/Año Detectada(o) sí lo son.
   */
  private construirFechaDesdeMesAnio(
    mes: string | number | undefined | null,
    anio: string | number | undefined | null,
  ): string | null {
    const mesNum = parseInt(String(mes ?? ""), 10);
    const anioNum = parseInt(String(anio ?? ""), 10);
    if (!mesNum || mesNum < 1 || mesNum > 12 || !anioNum) return null;
    return `${anioNum}-${String(mesNum).padStart(2, "0")}-01`;
  }

  /**
   * Suma de "Monto Cotizado" en Oportunidades LubFiltros, agrupada por cliente
   * (Nombre del Cliente). Se usa para netear el bruto de repuestos cotizado en
   * Oportunidades, con el mismo principio que getFacturasPrincipales() aplica al
   * facturado: el monto bruto de Repuestos incluye líneas de lubricante que
   * también se cotizan por separado en Oportunidades LubFiltros → hay que
   * restarlas para no contar el lubricante dos veces.
   */
  private getLubCotizadoPorCliente(): { [cliente: string]: number } {
    const datos = this.leerHoja("Oportunidades LubFiltros");
    const map: { [cliente: string]: number } = {};
    datos.forEach((row) => {
      const cliente = this.normalizarNombreCliente(this.normalizarTexto(row["Nombre del Cliente"]));
      if (!cliente) return;
      map[cliente] = (map[cliente] || 0) + this.parseNumber(row["Monto Cotizado"]);
    });
    return map;
  }

  getCotizacionesPrincipales(): Cotizacion[] {
    const datos = this.leerHoja("Oportunidades").filter(
      (row) => !this.debeExcluir(row["Sucursal"] || ""),
    );

    const lubCotizadoPorCliente = this.getLubCotizadoPorCliente();

    // Bruto de repuestos cotizado por cliente, para distribuir la resta de
    // lubricante proporcionalmente entre las filas que comparten cliente.
    const esRepuestoCotizado = (row: RawRowData): boolean =>
      this.normalizarUnidadNegocio(row["Tipo de Negocio"]) === UNIDAD_REPUESTOS;

    const repBrutoPorCliente: { [cliente: string]: number } = {};
    datos.forEach((row) => {
      if (!esRepuestoCotizado(row)) return;
      const cliente = this.determinarCliente(row);
      if (!cliente) return;
      repBrutoPorCliente[cliente] =
        (repBrutoPorCliente[cliente] || 0) + this.parseNumber(row["Ingresos Esperados Base"]);
    });

    return datos.map((row) => {
      const { fecha } = this.parsePeriodo(row, "Fecha Detectada", "Mes Detectada", "Año Detectada");
      const unidadNegocio = this.normalizarUnidadNegocio(row["Tipo de Negocio"]);
      let cliente = this.determinarCliente(row);

      // Para REPUESTOS, SERVICIOS, EQUIPOS y ALQUILER: si cliente es vacío o "Cliente S/N",
      // buscar en columnas AX (Cod.Cliente Potencial) y AY (Nombre de Cliente Potencial)
      const isNotLubFiltros = unidadNegocio && ![UNIDAD_LUBFILTROS].includes(unidadNegocio);

      if (isNotLubFiltros && (!cliente || cliente === "Cliente S/N" || cliente.trim() === "")) {
        const nombreClientePotencial = this.normalizarTexto(row["Nombre de Cliente Potencial"]);
        cliente = nombreClientePotencial || "Cliente Potencial";
      }

      let monto = this.parseNumber(row["Ingresos Esperados Base"]);
      if (esRepuestoCotizado(row)) {
        const lub = lubCotizadoPorCliente[cliente] || 0;
        const brutoCliente = repBrutoPorCliente[cliente] || 0;
        if (lub > 0 && brutoCliente > 0) {
          monto = monto - lub * (monto / brutoCliente);
        }
      }

      return {
        fecha,
        cliente,
        asesor: this.clienteSinAsesor(cliente) ? "" : this.normalizarTexto(row["Nombre Asesor"]),
        asesorCodigo: this.clienteSinAsesor(cliente)
          ? undefined
          : this.normalizarTexto(row["Código Asesor"]) || undefined,
        sucursal: this.sucursalFijaPorCliente(cliente) ?? this.normalizarSucursal(row["Sucursal"]),
        unidadNegocio,
        monto,
        montoFacturado: this.parseNumber(row["Monto Total Facturado Base"]) || undefined,
        montoPerdido: this.parseNumber(row["Monto Venta Perdida Base"]) || undefined,
        etapa: this.normalizarEtapa(row["Etapa de Ventas"]),
        descripcion: this.normalizarTexto(row["Nombre"]) || undefined,
      };
    });
  }

  /**
   * Hoja: Oportunidades LubFiltros (líneas de cotización) agrupadas por
   * Nro. Cotización → una cotización por número, monto sumado.
   */
  getCotizacionesLubFiltros(): Cotizacion[] {
    const datos = this.leerHoja("Oportunidades LubFiltros");
    const grupos: { [key: string]: Cotizacion } = {};

    datos
      .filter((row) => !this.debeExcluir(row["Nom. Sucursal"] || ""))
      .forEach((row) => {
        const nroCot = String(row["Nro. Cotización"] ?? "");
        const monto = this.parseNumber(row["Monto Cotizado"]);
        if (!grupos[nroCot]) {
          const { fecha } = this.parsePeriodo(
            row,
            "Fecha Cotización",
            "Mes Detectado",
            "Año Detectado",
          );
          const clienteLub =
            this.normalizarNombreCliente(this.normalizarTexto(row["Nombre del Cliente"])) ||
            "Cliente S/N";
          grupos[nroCot] = {
            nroCotizacion: nroCot,
            fecha,
            cliente: clienteLub,
            asesor: this.clienteSinAsesor(clienteLub)
              ? ""
              : this.normalizarTexto(row["Nombre Vendedor Cot."]),
            asesorCodigo: this.clienteSinAsesor(clienteLub)
              ? undefined
              : this.normalizarTexto(row["Código Vendedor Cot."]) || undefined,
            sucursal:
              this.sucursalFijaPorCliente(clienteLub) ??
              this.normalizarSucursal(row["Nom. Sucursal"]),
            unidadNegocio: UNIDAD_LUBFILTROS,
            monto: 0,
            etapa: this.normalizarEtapa(
              this.normalizarEtapaLubFiltros(row["Estatus Cotización"]) ?? "",
            ),
          };
        }
        grupos[nroCot].monto += monto;
      });

    return Object.values(grupos);
  }

  /**
   * Lubricante vendido por sucursal (Consorcio), para netear el bruto de
   * Repuestos igual que lo hace el cuadro real: SUMIFS('Lubricantes/Filtros'
   * !$AJ:$AJ; mes; sucursal; compañía="CONSORCIO COGESTION VENEQUIP") — un
   * total agregado por sucursal+mes, NO por Nro.Factura(s) individual (el
   * método anterior). Confirmado 2026-09-02: neteando por factura
   * dejaba sin restar el lubricante de facturas sin Nro.Factura(s) coincidente,
   * inflando Repuestos hasta 11% en varias sucursales; con este método
   * agregado, Lub/Filtros ya cuadraba exacto en 5 de 6 sucursales contra el
   * cuadro fresco — el gap de Repuestos viene de este mismo lubricante sin
   * restar.
   */
  private getLubMontoPorSucursal(): { [claveSucursalMes: string]: number } {
    const datos = this.leerHoja("LubricantesFiltros");
    const map: { [claveSucursalMes: string]: number } = {};
    datos.forEach((row) => {
      const compania = (row["Compañía"] ?? row["Compañia"] ?? "").toString().trim().toUpperCase();
      if (compania !== "CONSORCIO COGESTION VENEQUIP") return;
      const sucursal = this.normalizarSucursal(row["Sucursal"]);
      if (!sucursal) return;
      // Clave por sucursal+mes+año: "LubricantesFiltros" puede traer varios
      // meses a la vez (el Excel manual acumula todo el histórico en una sola
      // hoja) — sin esto se restaría el lubricante de TODOS los meses contra
      // el bruto de un solo mes de Repuestos.
      const mes = parseInt(String(row["Mes"] ?? ""), 10);
      const anio = parseInt(String(row["Año"] ?? ""), 10);
      if (!mes || !anio) return;
      const clave = `${sucursal}|${anio}-${mes}`;
      map[clave] = (map[clave] || 0) + this.parseNumber(row["P.V.P. Total $ Extendido"]);
    });
    return map;
  }

  /**
   * Hoja: Facturacion → facturas (esquema nuevo)
   *
   * Regla de monto (verificada contra las tarjetas de CumplimientoBase y
   * confirmada con el usuario 2026-08-31):
   * - Repuestos (Compañia = Consorcio/Xibi): "Monto Efectivo Ventas detallado
   *   (Tasa Neg.)" (BR), MENOS el lubricante de esa factura (P.V.P. Total $
   *   Extendido de LubricantesFiltros, match por Nro.Factura(s) ↔ N° Factura),
   *   distribuido proporcionalmente entre las filas de la misma factura. Esto da
   *   el neto de repuestos (~360k vs tarjeta 352k) sin doble contar lubricante.
   * - Servicios de Consorcio/Xibi: el ingreso de Servicios en sí queda
   *   EXCLUIDO de esta hoja (viene de getServiciosNuevo() → tabla `servicios`;
   *   incluirlo aquí contaría el mismo ingreso dos veces). PERO el cuadro real
   *   (SUMIFS de la fila REPUESTOS, celda J28 de 'Cumplimiento Presupuesto')
   *   sí suma, dentro del total de Repuestos, "Total Facturado Rptos Base"
   *   (BC) de estas mismas filas: son repuestos consumidos dentro de un
   *   trabajo de servicio, que pertenecen al negocio de Repuestos aunque la
   *   oportunidad esté clasificada como Servicios. Verificado con la
   *   automatización 2026-08-31.
   * - Servicios de "Otra Empresa", y Equipos/Alquiler (cualquier compañía):
   *   "Ingresos Esperados Base" (N) — miden compromiso, no facturado. BR está
   *   en 0 para Equipos/Alquiler, y N cuadra EXACTO con sus tarjetas
   *   (136.848 / 556.083; también validado por la automatización para Equipos
   *   de julio: BR daba -2.141, N dio 11.719 = tarjeta real al peso).
   *
   * Fecha: el cuadro real agrupa por "Mes Cierre" (MONTH de "Fecha de
   * Cierre"), no por "Fecha Documento" — confirmado con el usuario 2026-09-01.
   *
   * Neteo de lubricante: agregado por sucursal+mes (getLubMontoPorSucursal),
   * igual que el cuadro real — no por Nro.Factura(s) individual. Cambiado
   * 2026-09-02: neteando por factura se perdía el lubricante de facturas sin
   * Nro.Factura(s) coincidente, inflando Repuestos hasta 11% en varias
   * sucursales. Verificado: Lub/Filtros ya cuadraba exacto en 5/6 sucursales
   * contra el cuadro fresco antes de este cambio, confirmando que el gap
   * estaba en el lado de Repuestos (el lubricante sin restar), no en el
   * cálculo de Lub/Filtros en sí.
   *
   * Ventas estratégicas de lubricante: 72 filas verificadas en el Excel real
   * vienen como Repuestos en el CRM (cualquier compañía) pero se reclasifican
   * a mano a Lubricantes/Filtros — $520K, nada despreciable. No hay campo que
   * lo marque; el 94% tiene "lubricante" (con typos) en "Decripción de
   * servicio"/"Nombre", el resto dice "estrategia"/"estratégica" explícito.
   * Detección por palabra clave (esVentaEstrategicaLubricante) — reclasifica
   * esas filas a Lub/Filtros con monto = Ingresos Esperados Base (N).
   *
   * HISTORIAL: esto se revirtió brevemente el 2026-09-02 al comparar contra
   * un volcado del cuadro que resultó estar DESACTUALIZADO (foto del 31-ago,
   * ver mensaje de la automatización). Con el volcado fresco confirmado en
   * vivo por el usuario, Puerto Ordaz Lub/Filtros da $447.797,22 en el cuadro
   * — coincide EXACTO con esta reclasificación aplicada ($251.424 vía esta
   * regla + $196.373 de ventasrepuesto). La regla es correcta; el revert fue
   * el error, causado por comparar contra datos viejos. No revertir de nuevo
   * sin verificar primero que el volcado del cuadro sea fresco.
   */
  getFacturasPrincipales(): FacturaNueva[] {
    // A diferencia de cotizaciones/ventas_perdidas, NO se excluye Machine
    // Shop aquí: sí factura en Oportunidades Detallado y el cuadro real la
    // contabiliza (confirmado con el usuario 2026-09-01). "Machine Shop" ya
    // es sucursal canónica (ver SUCURSAL_CANONICA) para que resuelva FK.
    const datos = this.leerHoja("Facturacion");

    const lubPorSucursalMes = this.getLubMontoPorSucursal();

    // Solo Repuestos (Consorcio/Xibi) usa el bruto detallado (BR) con neteo de
    // lubricante. Equipos/Alquiler y Servicios de "Otra Empresa" miden
    // compromiso (N), no facturado — no son intercambiables.
    // "lubr" tolera typos reales encontrados en el Excel ("LUBRUCANTES").
    const esVentaEstrategicaLubricante = (row: RawRowData): boolean => {
      if (this.normalizarUnidadNegocio(row["Tipo de Negocio"]) !== UNIDAD_REPUESTOS) return false;
      const texto = (
        (row["Decripción de servicio"] ?? "").toString() +
        " " +
        (row["Nombre"] ?? "").toString()
      ).toLowerCase();
      return texto.includes("lubr") || texto.includes("estrateg");
    };

    const esRepuestoBR = (row: RawRowData): boolean =>
      this.normalizarUnidadNegocio(row["Tipo de Negocio"]) === UNIDAD_REPUESTOS &&
      (row["Compañia"] || "").toString().trim() !== "Otra Empresa" &&
      !esVentaEstrategicaLubricante(row);

    // getLubMontoPorSucursal() solo trae lubricante de Consorcio (único que
    // aparece en el archivo ventasrepuesto de AS400) — restarlo también de
    // filas de Xibi con la misma sucursal+mes resta dos veces por el mismo
    // dinero y da montos negativos absurdos. Confirmado 2026-09-02 con
    // Puerto Ordaz Xibi dando -195K en vez de $888 verdadero.
    const esConsorcio = (row: RawRowData): boolean =>
      (row["Compañia"] || "").toString().trim().toLowerCase().includes("consorcio");

    // El cuadro real agrupa por "Mes Cierre" (columna CG de 'Oportunidades
    // Detallado'), que resulta ser el mes de Fecha Documento (fecha de
    // facturación) cuando existe, y solo cae a Fecha de Cierre si no hay
    // Fecha Documento — confirmado con el usuario 2026-09-02 encontrando una
    // factura (Puerto Ordaz #007932) con Fecha de Cierre en julio pero Fecha
    // Documento en agosto, que el cuadro real cuenta en agosto. El crudo no
    // trae una columna "Mes Cierre" ya calculada (a diferencia del Excel
    // manual armado a mano) — se deriva aquí directo de las fechas.
    const mesAnioCierre = (row: RawRowData): { mes: number; anio: number } | null => {
      const fecha =
        this.excelDateToISO(row["Fecha Documento"]) ??
        this.excelDateToISO(row["Fecha de Cierre"]);
      if (!fecha) return null;
      const mes = parseInt(fecha.slice(5, 7), 10);
      const anio = parseInt(fecha.slice(0, 4), 10);
      if (mes >= 1 && mes <= 12 && anio > 0) return { mes, anio };
      return null;
    };
    const fechaMesCierre = (row: RawRowData): string | null => {
      const ma = mesAnioCierre(row);
      if (ma) return `${ma.anio}-${String(ma.mes).padStart(2, "0")}-01`;
      return this.excelDateToISO(row["Fecha de Cierre"]);
    };

    // Bruto de repuestos (BR) por sucursal+mes, para distribuir la resta de
    // lubricante proporcionalmente — igual que el cuadro real, que netea un
    // total agregado por sucursal+mes (SUMIFS de 'Lubricantes/Filtros'), no
    // por Nro.Factura(s) individual. Confirmado 2026-09-02: el neteo por
    // factura dejaba lubricante sin restar cuando no había Nro.Factura(s)
    // coincidente, inflando Repuestos hasta 11% en varias sucursales.
    const repBrutoPorSucursalMes: { [claveSucursalMes: string]: number } = {};
    datos.forEach((row) => {
      if (!esRepuestoBR(row) || !esConsorcio(row)) return;
      const ma = mesAnioCierre(row);
      if (!ma) return;
      const sucursal = this.normalizarSucursal(row["Sucursal"]);
      const clave = `${sucursal}|${ma.anio}-${ma.mes}`;
      repBrutoPorSucursalMes[clave] =
        (repBrutoPorSucursalMes[clave] || 0) +
        this.parseNumber(row["Monto Efectivo Ventas detallado (Tasa Neg.)"]);
    });

    const resultados: FacturaNueva[] = [];
    for (const row of datos) {
      let unidad = this.normalizarUnidadNegocio(row["Tipo de Negocio"]);
      const esOtraEmpresa = (row["Compañia"] || "").toString().trim() === "Otra Empresa";
      if (esVentaEstrategicaLubricante(row)) unidad = UNIDAD_LUBFILTROS;
      const factura = this.normalizarTexto(row["Nro.Factura(s)"]);
      const clienteFactura = this.determinarCliente(row);
      const base = {
        fecha: fechaMesCierre(row) ?? this.excelDateToISO(row["Fecha Documento"]),
        numero: factura || this.normalizarTexto(row["Nro. Documento"]),
        cliente: clienteFactura,
        asesor: this.clienteSinAsesor(clienteFactura)
          ? ""
          : this.normalizarTexto(row["Nombre Asesor"]),
        codigoAsesor: this.clienteSinAsesor(clienteFactura)
          ? ""
          : this.normalizarTexto(row["Código Asesor"]),
        sucursal:
          this.sucursalFijaPorCliente(clienteFactura) ?? this.normalizarSucursal(row["Sucursal"]),
      };

      if (unidad === UNIDAD_SERVICIOS && !esOtraEmpresa) {
        const montoRepuestosEnServicio = this.parseNumber(row["Total Facturado Rptos Base"]);
        if (montoRepuestosEnServicio !== 0) {
          resultados.push({
            ...base,
            unidadNegocio: UNIDAD_REPUESTOS,
            monto: montoRepuestosEnServicio,
          });
        }
        continue;
      }

      let monto: number;
      if (esRepuestoBR(row)) {
        const brutoRow = this.parseNumber(row["Monto Efectivo Ventas detallado (Tasa Neg.)"]);
        monto = brutoRow;
        const ma = mesAnioCierre(row);
        if (ma && esConsorcio(row)) {
          const sucursalRow = this.normalizarSucursal(row["Sucursal"]);
          const clave = `${sucursalRow}|${ma.anio}-${ma.mes}`;
          const lub = lubPorSucursalMes[clave] || 0;
          const brutoSucursalMes = repBrutoPorSucursalMes[clave] || 0;
          if (lub > 0 && brutoSucursalMes > 0) {
            // Resta proporcional al peso de la fila dentro del bruto de la
            // sucursal+mes — mismo total que resta el cuadro real (-J43).
            monto = brutoRow - lub * (brutoRow / brutoSucursalMes);
          }
        }
      } else {
        monto = this.parseNumber(row["Ingresos Esperados Base"]);
      }

      resultados.push({ ...base, unidadNegocio: unidad, monto });
    }
    return this.netearMaturinDePuertoLaCruz(resultados);
  }

  /**
   * Puerto La Cruz y Maturín comparten back-office de facturación — las
   * transacciones de Maturín salen bajo la sucursal de Puerto La Cruz en
   * estos reportes, y SEPARADAMENTE el crudo también trae un grupo propio
   * para Maturín cuyo total coincide con el "Maturín" del cuadro real.
   * Confirmado con el usuario 2026-09-02 (mismo patrón en Servicios: el
   * monto de Maturín queda embebido en el bruto de Puerto La Cruz, inflándolo
   * en exactamente ese monto). Neteo por mes+unidadNegocio, distribuido
   * proporcionalmente entre las filas de La Cruz para no alterar el total.
   */
  private netearMaturinDePuertoLaCruz<T extends { sucursal: string; fecha: string | null; unidadNegocio: string | null; monto: number }>(
    filas: T[],
  ): T[] {
    const clave = (fecha: string, unidad: string) => `${fecha}|${unidad}`;
    const maturinPorClave: { [clave: string]: number } = {};
    filas.forEach((f) => {
      if (f.sucursal !== "Maturín" || !f.fecha || !f.unidadNegocio) return;
      const k = clave(f.fecha, f.unidadNegocio);
      maturinPorClave[k] = (maturinPorClave[k] || 0) + f.monto;
    });
    const laCruzBrutoPorClave: { [clave: string]: number } = {};
    filas.forEach((f) => {
      if (f.sucursal !== "Puerto La Cruz" || !f.fecha || !f.unidadNegocio) return;
      const k = clave(f.fecha, f.unidadNegocio);
      laCruzBrutoPorClave[k] = (laCruzBrutoPorClave[k] || 0) + f.monto;
    });
    return filas.map((f) => {
      if (f.sucursal !== "Puerto La Cruz" || !f.fecha || !f.unidadNegocio) return f;
      const k = clave(f.fecha, f.unidadNegocio);
      const maturin = maturinPorClave[k] || 0;
      const bruto = laCruzBrutoPorClave[k] || 0;
      if (maturin <= 0 || bruto <= 0) return f;
      return { ...f, monto: f.monto - maturin * (f.monto / bruto) };
    });
  }

  /**
   * Hoja: LubricantesFiltros → facturas (esquema nuevo), unidad fija a Lubricantes/Filtros
   *
   * Monto = "P.V.P. Total $ Extendido" (el mismo que se resta del bruto de Repuestos
   * en getFacturasPrincipales), para que el TOP de Lub/Filtros y la resta de Repuestos
   * usen exactamente la misma base y no haya desalineación.
   */
  getFacturasLubFiltros(): FacturaNueva[] {
    const datos = this.leerHoja("LubricantesFiltros");
    return datos
      .filter((row) => !this.debeExcluir(row["Sucursal"] || ""))
      .map((row) => {
        let nombreVendedor = row["Vendedor"];
        if (row["Cód. Vendedor"] === "99999" || row["Cód. Vendedor"] === 99999) {
          nombreVendedor = row["Nombre Vendedor OV"];
        }
        const clienteVnq =
          this.normalizarNombreCliente(this.normalizarTexto(row["Cliente VNQ"])) || "Cliente S/N";
        return {
          fecha: this.excelDateToISO(row["Fecha Factura"]),
          numero: this.normalizarTexto(row["N° Factura"]),
          cliente: clienteVnq,
          asesor: this.clienteSinAsesor(clienteVnq) ? "" : this.normalizarTexto(nombreVendedor),
          sucursal:
            this.sucursalFijaPorCliente(clienteVnq) ?? this.normalizarSucursal(row["Sucursal"]),
          unidadNegocio: UNIDAD_LUBFILTROS,
          monto: this.parseNumber(row["P.V.P. Total $ Extendido"]),
        };
      });
  }

  /**
   * Hoja: Ventas Perdidas → ventas_perdidas (esquema nuevo)
   *
   * Clasificación de unidad de negocio:
   * - Área Repuestos: se toma el bruto de "Monto Venta Perdidas" y se divide así:
   *   - Lub/Filtros: Suplidor en {CO, DN, D1, GF, NC}
   *   - Repuestos: resto (equivale a bruto - Lub/Filtros)
   * - Las demás (Servicios, Equipos, Alquiler) vienen de la hoja Oportunidades con estatus Cerrado Perdido
   */
  getVentasPerdidasNuevo(): VentaPerdidaNueva[] {
    const datos = this.leerHoja("Ventas Perdidas");
    return datos
      .filter((row) => {
        // Universo confirmado con el usuario 2026-08-31: TODAS las filas de
        // venta perdida, sin filtrar por monto — una fila con Cant VP=0 sigue
        // siendo una venta perdida real (antes se descartaba en silencio).
        const sucursal = row["Nombre Sucursal"] || "";
        return !this.debeExcluir(sucursal);
      })
      .map((row) => {
        const area = this.normalizarTexto(row["Área"]);
        const codigoSuplidor = this.normalizarTexto(row["Supl"]);

        // En Ventas Perdidas, el split Repuestos vs Lub/Filtros se define por
        // el código de suplidor dentro del área de repuestos.
        const unidadNegocio = this.clasificarUnidadVentaPerdida(area, codigoSuplidor);

        const cliente =
          this.normalizarNombreCliente(this.normalizarTexto(row["Nombre Cliente"])) ||
          "Cliente S/N";
        const sucursalFija = this.sucursalFijaPorCliente(cliente);

        return {
          fecha: this.excelDateToISO(row["Fecha VP"]),
          cliente,
          asesor: this.clienteSinAsesor(cliente) ? "" : this.normalizarTexto(row["Nombre Asesor"]),
          sucursal: sucursalFija ?? this.normalizarSucursal(row["Nombre Sucursal"]),
          unidadNegocio,
          monto: this.parseNumber(row["Monto Venta Perdidas"]),
          razon: this.normalizarTexto(row["Nombre de Razón"]) || "No especificada",
        };
      });
  }

  /**
   * true si "Etapa de Ventas" indica una oportunidad cerrada perdida.
   * Comparación case/acento-insensible: el Excel mezcla capitalización
   * ("Cerrado Perdido", "cerrado perdido", etc.) entre filas.
   */
  private normalizarEtapaVentaPerdida(texto: string | number | undefined | null): boolean {
    if (!texto) return false;
    const lower = texto.toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return lower === "cerrado perdido" || lower === "cerrado sin negocio";
  }

  /**
   * Hoja: Oportunidades → ventas_perdidas (esquema nuevo)
   *
   * Filtra por Estatus = "Cerrado Perdido" o "Cerrado sin negocio"
   * Columna I: Etapa de Ventas
   * Columna AH: Tipo de Negocio (Servicios, Equipos, Alquiler)
   * Columna O: Ingresos Esperados Base (monto)
   */
  getOportunidadesVentasPerdidasNuevo(): VentaPerdidaNueva[] {
    const datos = this.leerHoja("Oportunidades");
    return datos
      .filter((row) => {
        const etapa = this.normalizarEtapaVentaPerdida(row["Etapa de Ventas"]);
        const monto = this.parseNumber(row["Ingresos Esperados Base"]);
        return etapa && monto > 0;
      })
      .map((row) => {
        const cliente = this.determinarCliente(row);
        return {
          fecha: this.excelDateToISO(row["Fecha de Cierre"]),
          cliente,
          asesor: this.clienteSinAsesor(cliente) ? "" : this.normalizarTexto(row["Nombre Asesor"]),
          sucursal:
            this.sucursalFijaPorCliente(cliente) ?? this.normalizarSucursal(row["Sucursal"]),
          unidadNegocio: this.normalizarUnidadNegocio(row["Tipo de Negocio"]),
          monto: this.parseNumber(row["Ingresos Esperados Base"]),
          razon: "Oportunidad no ganada",
        };
      });
  }

  /**
   * Hoja: CumplimientoBase → presupuestos (esquema nuevo)
   */
  getPresupuestosNuevo(): PresupuestoNuevo[] {
    const datos = this.leerHoja("CumplimientoBase");
    return datos
      .map((row) => ({
        anio: this.parseYear(row["Año"]),
        mes: this.parseMonth(row["Mes"]),
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        unidadNegocio: this.normalizarUnidadNegocio(row["U_N"]),
        monto: this.parseNumber(row["Presupuesto"]),
        ventasCCV: this.parseNumber(row["Ventas_CCV"]) || this.parseNumber(row["Ventas CCV"]),
        ventasXibi: this.parseNumber(row["Ventas_Xibi"]) || this.parseNumber(row["Ventas Xibi"]),
        ventasEstrategicas:
          this.parseNumber(row["Ventas_Estrategicas"]) ||
          this.parseNumber(row["Ventas Estrategicas"]),
      }))
      .filter(
        (row) =>
          !this.debeExcluirCumplimiento(row.sucursal, [
            row.monto,
            row.ventasCCV,
            row.ventasXibi,
            row.ventasEstrategicas,
          ]),
      )
      .filter((row) => row.mes >= 1 && row.mes <= 12 && row.anio > 0);
  }

  /**
   * Hoja: CumplimientoAsesoresBase → cumplimiento_asesores (nueva tabla).
   * Carga histórico completo (todos los meses/años); el filtro de período
   * se aplica en el frontend, igual que getPresupuestosNuevo().
   */
  getCumplimientoAsesoresNuevo(): CumplimientoAsesorNuevo[] {
    const datos = this.leerHoja("CumplimientoAsesoresBase");
    return datos
      .filter((row) => !this.debeExcluir(row["Sucursal"] || ""))
      .map((row) => {
        const presupuesto = this.parseNumber(row["Monto"]);
        const venta = this.parseNumber(row["CUMPLIMIENTO"]);
        return {
          anio: this.parseYear(row["Año"]),
          mes: this.parseMonth(row["Mes"]),
          codigoAsesor: this.normalizarTexto(row["Cod. Asesor"]),
          asesor: this.normalizarTexto(row["Asesor"]),
          sucursal: this.normalizarSucursal(row["Sucursal"]),
          unidadNegocio: this.normalizarUnidadNegocio(row["U/N"]),
          presupuesto,
          venta,
          pctCumplimiento:
            this.parseNumber(row["% CUMPLIMIENTO"]) || this.calcularPorcentaje(venta, presupuesto),
          pctParticipacion: this.parseNumber(row["% PARTICIPACION"]),
        };
      })
      .filter((row) => row.mes >= 1 && row.mes <= 12 && row.anio > 0 && row.codigoAsesor);
  }

  /**
   * Hoja: Cuentas por Cobrar → cobranzas (esquema nuevo).
   * Agrupa filas por combinación (Sucursal Venta + Cliente/Nombre Cliente + Factura),
   * sumando "Total DO" de todas las líneas de Giro de esa factura.
   * La hoja no trae un saldo parcial separado del monto total, así que
   * saldo = monto (se asume la factura completa está pendiente).
   */
  getCobranzasNuevo(): CobranzaNueva[] {
    const datos = this.leerHoja("Cuentas por Cobrar");

    const datosFiltrados = datos.filter((row) => !this.debeExcluir(row["Sucursal Venta"] || ""));

    const grupos = new Map<
      string,
      {
        cliente: string;
        facturaNumero: string;
        fechaEmision: string | null;
        fechaVencimiento: string | null;
        monto: number;
        diasVencidos: number;
        sucursal: string;
        unidadNegocio: string | null;
      }
    >();

    for (const row of datosFiltrados) {
      const sucursal = this.normalizarSucursal(row["Sucursal Venta"]);
      const clienteCod = this.normalizarTexto(row["Cliente"]);
      const clienteNom = this.normalizarTexto(row["Nombre Cliente"]) || "Cliente S/N";
      const facturaNumero = this.normalizarTexto(row["Factura"]);
      const key = `${sucursal}|${clienteCod}|${clienteNom}|${facturaNumero}`;

      const montoDO = this.parseAccountingNumber(row["TOTAL $"]);

      if (!grupos.has(key)) {
        grupos.set(key, {
          cliente: clienteNom,
          facturaNumero,
          fechaEmision: this.excelDateToISO(row["Fecha Emisión"]),
          fechaVencimiento: this.excelDateToISO(row["Fecha Vencimiento"]),
          monto: 0,
          diasVencidos: this.parseAccountingInt(row["Dias Vencidos"] ?? row["DIAS VENCIDO"]),
          sucursal,
          unidadNegocio: this.normalizarUnidadNegocio(row["Unidad de Negocio"]),
        });
      }

      const item = grupos.get(key)!;
      item.monto += montoDO;
    }

    return Array.from(grupos.values()).map((g) => ({
      cliente: g.cliente,
      facturaNumero: g.facturaNumero,
      fechaEmision: g.fechaEmision,
      fechaVencimiento: g.fechaVencimiento,
      monto: g.monto,
      saldo: g.monto,
      diasVencidos: g.diasVencidos,
      sucursal: g.sucursal,
      unidadNegocio: g.unidadNegocio,
    }));
  }

  /**
   * Hoja: Servicios → tabla nueva `servicios`
   *
   * Machine Shop (Cod.Suc AS400 = 46) solo maneja servicios (confirmado con
   * el usuario 2026-09-01) y NO se excluye aquí — "Nombre Sucursal" trae texto
   * obsoleto/inconsistente para este código ("Barquisimeto" en el crudo AS400
   * sin limpiar, a veces "Machine Shop" ya corregido a mano en el Excel), así
   * que se identifica por Cod.Suc, la fuente confiable. Mismo criterio para
   * Cod.Suc=23 ("Proy.FMO Ciudad Piar" en el crudo → "FMO Piar").
   *
   * Para Machine Shop, "Tipo Cliente" no es confiable para Interno/Externo
   * (encontrado un caso real: $2.179 con Tipo Cliente=EXTERNO pero
   * "Descripción del Asiento" de facturación interna) — se usa esa
   * descripción en su lugar: "Facturacion Orden Trabajo" = EXTERNO (orden
   * real), cualquier otro formato ("Facturacion Interna de Orden de
   * trabajo", o movimientos con Cliente=00100=CCV) = INTERNO.
   */
  getServiciosNuevo(): ServicioNuevo[] {
    // Clas.Transaccion="REPUESTOS": repuestos consumidos dentro de un ticket
    // de servicio, no ingreso de Servicios — el cuadro real los excluye de
    // esta hoja (van a Repuestos por otra vía). Confirmado 2026-09-02: sin
    // excluirlos, Servicios EXTERNO quedaba inflado exacto en ese monto en
    // 6 de 7 sucursales contra el cuadro real.
    const datos = this.leerHoja("Servicios").filter(
      (row) => (row["Clas.Transaccion"] ?? "").toString().trim().toUpperCase() !== "REPUESTOS",
    );
    const resultados = datos.map((row, index) => {
      let fecha: string | null = null;
      const anioContable = parseInt(row["Año Contable"], 10);
      const mesContable = parseInt(row["Mes Contable"], 10);

      if (!isNaN(anioContable) && !isNaN(mesContable) && mesContable >= 1 && mesContable <= 12) {
        fecha = `${anioContable}-${String(mesContable).padStart(2, "0")}-01`;
      } else {
        const fechaApertura = this.excelDateToISO(row["Fecha Apertura Servicio"]);
        if (fechaApertura) {
          fecha = fechaApertura;
          console.warn(
            `[Servicios] Fila ${index + 2}: Año Contable/Mes Contable inválidos ("${row["Año Contable"]}" / "${row["Mes Contable"]}"). Usando Fecha Apertura Servicio: ${fechaApertura}`,
          );
        } else {
          console.warn(
            `[Servicios] Fila ${index + 2}: Sin Año/Mes Contable ni Fecha Apertura válidos ("${row["Año Contable"]}" / "${row["Mes Contable"]}").`,
          );
        }
      }

      const codSuc = (row["Cod.Suc"] ?? "").toString().trim();
      const sucursal =
        codSuc === "46"
          ? "Machine Shop"
          : codSuc === "23"
            ? "FMO Piar"
            : this.normalizarSucursal(row["Nombre Sucursal"]);

      let categoriaVenta = this.normalizarTexto(row["Tipo Cliente"]);
      if (sucursal === "Machine Shop") {
        const esOrdenExterna = this.normalizarTexto(row["Descripción del Asiento"])
          .toLowerCase()
          .startsWith("facturacion orden trabajo");
        categoriaVenta = esOrdenExterna ? "EXTERNO" : "INTERNO";
      }

      const cliente =
        this.normalizarNombreCliente(this.normalizarTexto(row["Nombre Cliente"])) || "Cliente S/N";

      return {
        fecha,
        cliente,
        monto: this.parseNumber(row["Monto Venta $"]),
        tipoServicio: this.normalizarTexto(row["Clas.Transaccion"]),
        categoriaVenta,
        compania: this.normalizarTexto(row["Nombre Compañia"]),
        asesor: "",
        taller: this.normalizarTexto(row["Taller"]),
        csa: this.normalizarTexto(row["CSA"]),
        sucursal,
        unidadNegocio: UNIDAD_SERVICIOS,
      };
    });

    // Puerto La Cruz y Maturín comparten back-office de facturación — las
    // transacciones de Maturín salen bajo Cod.Suc de Puerto La Cruz en este
    // reporte, y SEPARADAMENTE el reporte también trae un grupo con
    // Nombre Sucursal="Maturin" (Cod.Suc 13) cuyo total coincide con el
    // "Maturín" del cuadro real. Confirmado con el usuario 2026-09-02: el
    // monto de Maturín queda embebido en el bruto de Puerto La Cruz y hay que
    // restarlo (el mismo total ya viene aparte vía el grupo Maturín) —
    // agregado por mes+categoriaVenta (Externo/Interno cada uno con su propio
    // solape, verificado 2026-09-02), distribuido proporcionalmente entre las
    // filas de La Cruz de ese mes+categoría para no alterar el total.
    const clave = (mes: string, cat: string) => `${mes}|${cat}`;
    const maturinPorClave: { [clave: string]: number } = {};
    resultados.forEach((s) => {
      if (s.sucursal !== "Maturín" || !s.fecha) return;
      const k = clave(s.fecha, s.categoriaVenta);
      maturinPorClave[k] = (maturinPorClave[k] || 0) + s.monto;
    });
    const laCruzBrutoPorClave: { [clave: string]: number } = {};
    resultados.forEach((s) => {
      if (s.sucursal !== "Puerto La Cruz" || !s.fecha) return;
      const k = clave(s.fecha, s.categoriaVenta);
      laCruzBrutoPorClave[k] = (laCruzBrutoPorClave[k] || 0) + s.monto;
    });
    return resultados.map((s) => {
      if (s.sucursal !== "Puerto La Cruz" || !s.fecha) return s;
      const k = clave(s.fecha, s.categoriaVenta);
      const maturin = maturinPorClave[k] || 0;
      const bruto = laCruzBrutoPorClave[k] || 0;
      if (maturin <= 0 || bruto <= 0) return s;
      return { ...s, monto: s.monto - maturin * (s.monto / bruto) };
    });
  }

  /**
   * Hoja: Detalles Servicios Estrategicos → tabla nueva `detalles_servicios_estrategicos`
   */
  getDetallesServiciosEstrategicos(): DetalleServicioEstrategico[] {
    const datos = this.leerHoja("Detalles Servicios Estrategicos");
    return datos
      .filter((row) => !this.debeExcluir(row["Sucursal"] || ""))
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        mes: parseInt(row["Mes"], 10) || 1,
        tipoServicio: this.normalizarTexto(row["Tipo Servicio"]) || "Otro",
        monto: this.parseNumber(row["Monto"]),
      }));
  }

  /**
   * Hoja: Servicios Interno → tabla nueva `servicios_interno`. Solo tiene Mes + Monto.
   */
  getServiciosInterno(): { mes: number; monto: number }[] {
    const datos = this.leerHoja("Servicios Interno");
    return datos.map((row) => ({
      mes: parseInt(row["Mes"], 10) || 1,
      monto: this.parseNumber(row["Monto"]),
    }));
  }

  /**
   * Hoja: Ventas Casa → tabla nueva `ventas_casa`. Ventas de atención casa por
   * Sucursal/U-N/Mes, sin asesor asociado (no tienen asesor asignado).
   */
  getVentasCasa(): {
    sucursal: string;
    unidadNegocio: string | null;
    mes: number;
    monto: number;
  }[] {
    const datos = this.leerHoja("Ventas Casa");
    return datos
      .filter((row) => !this.debeExcluir(row["Sucursal"] || ""))
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        unidadNegocio: this.normalizarUnidadNegocio(row["U/N"]),
        mes: this.parseMonth(row["Mes"]),
        monto: this.parseNumber(row["Monto"]),
      }))
      .filter((row) => row.mes >= 1 && row.mes <= 12);
  }

  /**
   * Hojas: Inventario Disponible Equipos + Inventario Tránsito Equipos → equipos_inventario
   * Se combinan por marca + tipo de equipo. "Stock" = cantidad de unidades,
   * "Total USD$" = monto — no confundir (bug histórico: se usaba Stock como monto).
   */
  getEquiposInventario(): EquipoInventarioItem[] {
    const disponibles = this.leerHoja("Inventario Disponible Equipos");
    const transitos = this.leerHoja("Inventario Tránsito Equipos");

    const porMarcaTipo = new Map<string, EquipoInventarioItem>();
    const keyOf = (marca: string, tipoEquipo: string) => `${marca}|${tipoEquipo}`;
    const getOrCreate = (marca: string, tipoEquipo: string) => {
      const key = keyOf(marca, tipoEquipo);
      let item = porMarcaTipo.get(key);
      if (!item) {
        item = {
          marca,
          tipoEquipo,
          disponible: 0,
          transito: 0,
          stockDisponible: 0,
          stockTransito: 0,
        };
        porMarcaTipo.set(key, item);
      }
      return item;
    };

    disponibles.forEach((row) => {
      const marca = this.normalizarTexto(row["Marca"]) || "Sin marca";
      const tipoEquipo = this.normalizarTexto(row["Tipo de Equipo"]) || "Sin clasificar";
      const item = getOrCreate(marca, tipoEquipo);
      item.disponible += this.parseNumber(row["Total USD$"]);
      item.stockDisponible += this.parseNumber(row["Stock"]);
    });

    transitos.forEach((row) => {
      const marca = this.normalizarTexto(row["Marca"]) || "Sin marca";
      const tipoEquipo = this.normalizarTexto(row["Tipo de Equipo"]) || "Sin clasificar";
      const item = getOrCreate(marca, tipoEquipo);
      item.transito += this.parseNumber(row["Total USD$"]);
      item.stockTransito += this.parseNumber(row["Stock"]);
    });

    return Array.from(porMarcaTipo.values());
  }

  /**
   * Hoja: Detalles de Ventas Equipos → equipos_facturacion_sucursal / equipos_por_marca
   */
  getEquiposDetalleVentas(): EquipoDetalleVenta[] {
    // "Mes" es un entero 1-12 (no una fecha de Excel) — la hoja no trae año,
    // igual que el resto de las hojas "Detalles de Ventas *" (snapshot de un
    // solo año). Se usa el año en curso, mismo criterio que equipos_inventario.
    const anioActual = new Date().getFullYear();
    const datos = this.leerHoja("Detalles de Ventas Equipos");
    return datos
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        marca: this.normalizarTexto(row["Marca"]) || "Sin marca",
        monto: this.parseNumber(row["Monto"]),
        mes: parseInt(row["Mes"], 10) || 0,
        anio: anioActual,
      }))
      .filter((row) => row.mes >= 1 && row.mes <= 12);
  }

  /**
   * Hoja: Detalles de Ventas LUBFILTROS → tabla nueva `detalles_ventas_lubfiltros`.
   * Una fila por marca (Chronus, Donaldson, Donaldson Industrial, Otra Marca) x mes,
   * con el desglose CCV/Xibi/Estratégicas ya calculado en el Excel.
   */
  getDetallesVentasLubfiltros(): DetalleVentaLubfiltros[] {
    const datos = this.leerHoja("Detalles de Ventas LUBFILTROS");
    return datos
      .filter((row) => this.normalizarTexto(row["Marcas"]))
      .map((row) => ({
        marca: this.normalizarTexto(row["Marcas"]),
        mes: parseInt(row["Mes"], 10) || 1,
        ventasCcv: this.parseNumber(row["Consorcio Cogestion Venequip"]),
        ventasXibi: this.parseNumber(row["Xibi B.V."]),
        ventasEstrategicas: this.parseNumber(row["Estrategico"]),
        montoTotal: this.parseNumber(row["Monto Total"]),
      }))
      .filter((row) => row.mes >= 1 && row.mes <= 12);
  }

  /**
   * Hoja: Detalles de Ventas Repuestos → tabla nueva `detalles_ventas_repuestos`.
   * Una fila por marca (Caterpillar, Blumaq, Vms Corporation, etc.) x mes, con
   * el desglose CCV/Xibi ya calculado en el Excel (sin columna Estratégico).
   */
  getDetallesVentasRepuestos(): DetalleVentaRepuestos[] {
    const datos = this.leerHoja("Detalles de Ventas Repuestos");
    return datos
      .filter((row) => this.normalizarTexto(row["Marcas"]))
      .map((row) => ({
        marca: this.normalizarTexto(row["Marcas"]),
        mes: parseInt(row["Mes"], 10) || 1,
        ventasCcv: this.parseNumber(row["Consorcio Cogestion Venequip"]),
        ventasXibi: this.parseNumber(row["Xibi B.V."]),
        montoTotal: this.parseNumber(row["Monto Total"]),
      }))
      .filter((row) => row.mes >= 1 && row.mes <= 12);
  }

  /**
   * Hoja: Inventario LubFiltros → tabla nueva `inventario_lubfiltros`.
   * Columna B (SUPLIDOR) clasifica el tipo: CO = Lubricantes; NC/DN/D1/GF = Filtros.
   * Columna Y (Nombre Sucursal) se usa tal cual (texto libre, incluye "Almacen
   * Central"); se excluyen las filas marcadas "No Disponible". Columna Z = monto.
   */
  getInventarioLubfiltros(): InventarioLubfiltrosItem[] {
    const LUBRICANTE_CODIGOS = new Set(["CO"]);
    const FILTRO_CODIGOS = new Set(["NC", "DN", "D1", "GF"]);

    const datos = this.leerHoja("Inventario LubFiltros");
    return datos
      .map((row) => {
        const codigo = this.normalizarTexto(row["SUPLIDOR"]).toUpperCase();
        const sucursal = this.normalizarSucursal(row["Nombre Sucursal"]);
        const tipo: "Lubricantes" | "Filtros" | null = LUBRICANTE_CODIGOS.has(codigo)
          ? "Lubricantes"
          : FILTRO_CODIGOS.has(codigo)
            ? "Filtros"
            : null;
        return {
          tipo,
          proveedorCodigo: codigo,
          sucursal,
          monto: this.parseNumber(row["Monto en Inventario"]),
        };
      })
      .filter(
        (row): row is InventarioLubfiltrosItem =>
          row.tipo !== null && row.sucursal.toLowerCase() !== "no disponible",
      );
  }

  /**
   * TOP 5 CLIENTES FACTURADOS por unidad de negocio
   * Extrae facturas individuales (no agrupadas) ordenadas por monto descendente
   * Retorna los 5 clientes con mayor monto facturado por cada unidad
   */
  getTop5ClientesFacturados(
    meses: number[],
    anio: number,
  ): {
    [unidad: string]: Array<{
      cliente: string;
      monto: number;
      numeroFactura?: string;
      asesor?: string;
    }>;
  } {
    const result: {
      [unidad: string]: Array<{
        cliente: string;
        monto: number;
        numeroFactura?: string;
        asesor?: string;
      }>;
    } = {
      repuestos: [],
      equipos: [],
      alquiler: [],
      servicios: [],
      lubfiltros: [],
    };

    // FACTURACIÓN (Repuestos, Equipos, Alquiler)
    const facturaciónHoja = this.leerHoja("Facturacion");
    const headerFacturacion = facturaciónHoja.length > 0 ? Object.keys(facturaciónHoja[0]) : [];
    const mesFacturacionIdx = headerFacturacion.indexOf("Mes Cierre");
    const clienteFacturacionIdx = headerFacturacion.findIndex((h) =>
      h.includes("Nombre de Cuenta"),
    );
    const tipoNegocioIdx = headerFacturacion.indexOf("Tipo de Negocio");
    const montoBRIdx = headerFacturacion.indexOf("Monto Efectivo Ventas detallado (Tasa Neg.)");
    const nroDocIdx = headerFacturacion.findIndex((h) => h.includes("Nro. Documento"));
    const asesorIdx = headerFacturacion.findIndex((h) => h.includes("Código Asesor"));

    facturaciónHoja.forEach((row) => {
      const mesFila = parseInt(row[headerFacturacion[mesFacturacionIdx]], 10);
      if (meses.indexOf(mesFila) === -1) return;

      const cliente =
        this.normalizarTexto(row[headerFacturacion[clienteFacturacionIdx]]) || "Cliente S/N";
      const tipoNegocio = this.normalizarUnidadNegocio(row[headerFacturacion[tipoNegocioIdx]]);
      const monto = this.parseNumber(row[headerFacturacion[montoBRIdx]]);
      const numeroFactura = this.normalizarTexto(row[headerFacturacion[nroDocIdx]]);
      const asesor = this.normalizarTexto(row[headerFacturacion[asesorIdx]]);

      if (!tipoNegocio || monto <= 0) return;

      const key = tipoNegocio
        .toLowerCase()
        .replace(/ó/g, "o")
        .replace(/á/g, "a")
        .replace(/í/g, "i")
        .replace(/ú/g, "u")
        .replace(/é/g, "e");

      if (
        result[key] &&
        result[key].find((f) => f.numeroFactura === numeroFactura && f.cliente === cliente)
      ) {
        return; // Evitar duplicados de la misma factura
      }

      if (result[key]) {
        result[key].push({ cliente, monto, numeroFactura, asesor });
      }
    });

    // SERVICIOS
    const serviciosHoja = this.leerHoja("Servicios");
    const headerServicios = serviciosHoja.length > 0 ? Object.keys(serviciosHoja[0]) : [];
    const mesServiciosIdx = headerServicios.indexOf("Mes Contable");
    const clienteServiciosIdx = headerServicios.indexOf("Nombre Cliente");
    const montoServiciosIdx = headerServicios.indexOf("Monto Venta $");
    const nroFacturaServiciosIdx = headerServicios.indexOf("Numero Factura");
    const tipoClienteIdx = headerServicios.indexOf("Tipo Cliente");

    serviciosHoja.forEach((row) => {
      const tipoCliente = String(row[headerServicios[tipoClienteIdx]]).trim().toUpperCase();
      if (tipoCliente !== "EXTERNO") return;

      const mesFila = parseInt(row[headerServicios[mesServiciosIdx]], 10);
      if (meses.indexOf(mesFila) === -1) return;

      const cliente =
        this.normalizarTexto(row[headerServicios[clienteServiciosIdx]]) || "Cliente S/N";
      const monto = this.parseNumber(row[headerServicios[montoServiciosIdx]]);
      const numeroFactura = this.normalizarTexto(row[headerServicios[nroFacturaServiciosIdx]]);

      if (monto <= 0) return;

      if (
        result.servicios.find((f) => f.numeroFactura === numeroFactura && f.cliente === cliente)
      ) {
        return;
      }

      result.servicios.push({ cliente, monto, numeroFactura });
    });

    // LUBFILTROS
    const lubfiltrosHoja = this.leerHoja("LubricantesFiltros");
    const headerLubfiltros = lubfiltrosHoja.length > 0 ? Object.keys(lubfiltrosHoja[0]) : [];
    const mesLubIdx = headerLubfiltros.indexOf("Mes");
    const anioLubIdx = headerLubfiltros.indexOf("Año");
    const clienteLubIdx = headerLubfiltros.indexOf("Cliente VNQ");
    const montoLubIdx = headerLubfiltros.indexOf("P.V.P. Total $ Extendido");
    const codVendedorIdx = headerLubfiltros.indexOf("Cód. Vendedor");

    lubfiltrosHoja.forEach((row) => {
      const mesFila = parseInt(row[headerLubfiltros[mesLubIdx]], 10);
      const anioFila = parseInt(row[headerLubfiltros[anioLubIdx]], 10);
      if (meses.indexOf(mesFila) === -1 || anioFila !== anio) return;

      const cliente = this.normalizarTexto(row[headerLubfiltros[clienteLubIdx]]) || "Cliente S/N";
      const monto = this.parseNumber(row[headerLubfiltros[montoLubIdx]]);
      const asesor = this.normalizarTexto(row[headerLubfiltros[codVendedorIdx]]);

      if (monto <= 0) return;

      result.lubfiltros.push({ cliente, monto, asesor });
    });

    // Ordenar por monto descendente y tomar TOP 5
    Object.keys(result).forEach((key) => {
      result[key] = result[key].sort((a, b) => b.monto - a.monto).slice(0, 5);
    });

    return result;
  }

  /** Hoja "Canales" → mercadeo_canales. canal/tipo son texto libre. */
  getMercadeoCanales(): { canal: string; tipo: string; mes: number; cantidad: number }[] {
    return this.leerHoja("Canales")
      .map((row) => ({
        canal: this.normalizarTexto(row["Canal"]),
        tipo: this.normalizarTexto(row["Tipo"]),
        mes: this.parseMonth(row["Mes"]),
        cantidad: this.parseNumber(row["Cantidad"]),
      }))
      .filter((r) => r.canal !== "" && r.tipo !== "" && r.mes >= 1 && r.mes <= 12);
  }

  /**
   * Hoja "Instagram" → mercadeo_instagram. La columna Canal siempre dice
   * "Instagram", por eso no se persiste: es el detalle propio de esa red, más
   * granular que la fila agregada "Instagram" de la hoja Canales.
   */
  getMercadeoInstagram(): { tipo: string; mes: number; cantidad: number }[] {
    return this.leerHoja("Instagram")
      .map((row) => ({
        tipo: this.normalizarTexto(row["Tipo"]),
        mes: this.parseMonth(row["Mes"]),
        cantidad: this.parseNumber(row["Cantidad"]),
      }))
      .filter((r) => r.tipo !== "" && r.mes >= 1 && r.mes <= 12);
  }

  /** Hoja "Google My Business" → mercadeo_google_business. */
  getMercadeoGoogleBusiness(): {
    sucursal: string;
    mes: number;
    tipo: string;
    cantidad: number;
  }[] {
    return this.leerHoja("Google My Business")
      .map((row) => ({
        sucursal: this.normalizarSucursal(row["Sucursal"]),
        mes: this.parseMonth(row["Mes"]),
        tipo: this.normalizarTexto(row["Tipo"]),
        cantidad: this.parseNumber(row["Cantidad"]),
      }))
      .filter((r) => r.tipo !== "" && r.mes >= 1 && r.mes <= 12);
  }

  /**
   * Hoja "Post Historias" → mercadeo_post_historias. "Unidad de Negocio" es
   * texto libre: además de unidades reales trae categorías de contenido
   * (Entrenamiento, Branding, RRHH, Eventos, Proyectos, Talleres) — por eso
   * NO pasa por normalizarUnidadNegocio.
   */
  getMercadeoPostHistorias(): {
    tipoPublicacion: string;
    unidadNegocio: string | null;
    marca: string | null;
    mes: number;
    cantidad: number;
  }[] {
    return this.leerHoja("Post Historias")
      .map((row) => ({
        tipoPublicacion: this.normalizarTexto(row["Tipo de Publicación"]),
        unidadNegocio: this.normalizarTexto(row["Unidad de Negocio"]) || null,
        marca: this.normalizarTexto(row["Marca"]) || null,
        mes: this.parseMonth(row["Mes"]),
        cantidad: this.parseNumber(row["Cantidad"]) || 1,
      }))
      .filter((r) => r.tipoPublicacion !== "" && r.mes >= 1 && r.mes <= 12);
  }

  /**
   * Hoja "Clientes Potenciales" → clientes_potenciales.
   *
   * Notas de la hoja real (verificadas 2026-08-02):
   * - El nombre exacto de la columna es "Etapa de la Oportunidad" y solo viene
   *   poblada en parte de las filas (undefined en el resto).
   * - "Fecha Detectada" es un string "DD-MM-YYYY", no una fecha de Excel.
   * - Machine Shop SÍ se carga (a diferencia del resto del parser, que la
   *   excluye con debeExcluir): son leads reales. Queda con sucursal_id null
   *   porque no es una sucursal canónica.
   * - Se descartan columnas de auditoría CRM que no aportan al dashboard:
   *   Modificado Por/el, Creado por, Origen, Cuenta, Título, Descripción,
   *   Comentarios, Compañia, Costo de Opp, Moneda, Nro. Documento,
   *   ID Oportunidad.
   */
  getClientesPotenciales(): ClientePotencialItem[] {
    return this.leerHoja("Clientes Potenciales").map((row) => ({
      idClientePotencial: this.parseNumber(row["ID Cliente Pot."]) || null,
      sucursal: this.normalizarSucursal(row["Sucursal"]),
      tipoNegocio: this.normalizarTexto(row["Tipo de Negocio"]) || null,
      razonSocial: this.normalizarTexto(row["Razón Social"]) || null,
      nombreContacto: this.normalizarTexto(row["Nombre Contacto"]) || null,
      correo: this.normalizarTexto(row["Correo electrónico"]) || null,
      telefono: this.normalizarTexto(row["Teléfono"]) || null,
      identificacionFiscal: this.normalizarTexto(row["Identificación Fiscal"]) || null,
      fechaDetectada: parseFechaDDMMYYYY(row["Fecha Detectada"]),
      estatusBis: this.normalizarTexto(row["Estatus BIS"]) || null,
      etapaOportunidad: this.normalizarTexto(row["Etapa de la Oportunidad"]) || null,
      tomaContacto: this.normalizarTexto(row["Toma de contacto"]) || null,
      campana: this.normalizarTexto(row["Campaña"]) || null,
      usuarioAsignado: this.normalizarTexto(row["Usuario asignado"]) || null,
      ingresosEsperados: this.parseNumber(row["Ingresos Esperados Base"]),
      montoFacturadoBase: this.parseNumber(row["Monto Total Facturado Base (Tasa Neg.)"]),
    }));
  }
}
