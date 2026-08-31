/**
 * Lógica de negocio de Clientes Potenciales (hoja "Clientes Potenciales" del
 * Excel). Módulo puro: sin React ni Drizzle, para poder testearlo aislado.
 *
 * Reglas de dinero (spec §3, docs/superpowers/specs/2026-08-02-mercadeo-design.md):
 * - Monto Facturado    = SUM(monto_facturado_base) donde estatus=Convertidos
 *                        Y etapa=Cerrado ganado.
 * - Monto en Orden de  = SUM(ingresos_esperados)   donde estatus=Convertidos
 *   Venta                Y etapa=Propuesta-Negociación.
 * Las filas que no cumplen ninguna de las dos combinaciones siguen contando en
 * el embudo por estatus (volumen), pero no aportan a ningún KPI de dinero.
 */

export interface LeadRow {
  estatusBis: string | null;
  etapaOportunidad: string | null;
  ingresosEsperados: number;
  montoFacturadoBase: number;
}

export interface LeadsResumen {
  total: number;
  nuevos: number;
  convertidos: number;
  /** Porcentaje 0-100, redondeado a 1 decimal. */
  tasaConversion: number;
  montoFacturado: number;
  montoOrdenVenta: number;
}

const ESTATUS_DESCONOCIDO = "Desconocido";

/** Orden de embudo (de lead frío a cerrado), tal como se muestra en la UI. */
export const ESTATUS_ORDEN: string[] = [
  "Nuevo",
  "Asignado",
  "En proceso",
  "Convertidos",
  "Cerrado perdido",
  "Cerrado sin negocio",
  ESTATUS_DESCONOCIDO,
];

function normalizaEstatus(valor: string | null): string {
  const texto = (valor ?? "").trim();
  if (texto === "") return ESTATUS_DESCONOCIDO;
  return ESTATUS_ORDEN.find((e) => e.toLowerCase() === texto.toLowerCase()) ?? ESTATUS_DESCONOCIDO;
}

function esConvertido(row: LeadRow): boolean {
  return normalizaEstatus(row.estatusBis) === "Convertidos";
}

function etapaEs(row: LeadRow, etapa: string): boolean {
  return (row.etapaOportunidad ?? "").trim().toLowerCase() === etapa.toLowerCase();
}

export function computeLeadsResumen(rows: LeadRow[]): LeadsResumen {
  let nuevos = 0;
  let convertidos = 0;
  let montoFacturado = 0;
  let montoOrdenVenta = 0;

  for (const row of rows) {
    const estatus = normalizaEstatus(row.estatusBis);
    if (estatus === "Nuevo") nuevos += 1;
    if (estatus === "Convertidos") {
      convertidos += 1;
      if (etapaEs(row, "Cerrado ganado")) montoFacturado += row.montoFacturadoBase;
      if (etapaEs(row, "Propuesta-Negociación")) montoOrdenVenta += row.ingresosEsperados;
    }
  }

  const total = rows.length;
  return {
    total,
    nuevos,
    convertidos,
    tasaConversion: total === 0 ? 0 : Math.round((convertidos / total) * 1000) / 10,
    montoFacturado,
    montoOrdenVenta,
  };
}

export function computeEmbudoEstatus(rows: LeadRow[]): { estatus: string; cantidad: number }[] {
  const conteo = new Map<string, number>();
  for (const row of rows) {
    const estatus = normalizaEstatus(row.estatusBis);
    conteo.set(estatus, (conteo.get(estatus) ?? 0) + 1);
  }
  return ESTATUS_ORDEN.filter((e) => conteo.has(e)).map((estatus) => ({
    estatus,
    cantidad: conteo.get(estatus) ?? 0,
  }));
}
