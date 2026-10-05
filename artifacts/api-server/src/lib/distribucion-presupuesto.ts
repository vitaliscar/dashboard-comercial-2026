export interface FilaBasePresupuesto {
  mes: number;
  sucursalId: string | null;
  sucursal: string | null;
  unidadNegocioId: string | null;
  unidad: string | null;
  basePresupuesto: number;
  realBase: number;
}

export interface ParticipacionUnidad {
  unidadNegocioId: string | null;
  participacion: number;
  gestionComercialPct: number;
  gestionComercialMonto: number | null;
}

export interface ParticipacionSucursal {
  unidadNegocioId: string | null;
  sucursalId: string | null;
  participacion: number;
}

export interface ParticipacionMes {
  unidadNegocioId: string | null;
  mes: number;
  participacion: number;
}

export interface DistribucionPresupuesto {
  crecimientoAnualPct: number;
  unidades: ParticipacionUnidad[];
  sucursales: ParticipacionSucursal[];
  meses: ParticipacionMes[];
}

export interface FilaPropuesta extends FilaBasePresupuesto {
  sugerido: number;
}

const TOLERANCIA_PCT = 0.011;
const MAX_CRECIEMIENTO_PCT = 500;

function llave(id: string | null): string {
  return id ?? "__sin_id__";
}

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function formatearMonto(valor: number): string {
  return new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(valor);
}

export interface ProyeccionVentaBase {
  filas: FilaBasePresupuesto[];
  metaBase: number;
  metaMinima: number;
  ventaAcumulada: number;
  mesesConsiderados: number;
  metodo: "proyeccion" | "cierre" | "presupuesto";
}

/**
 * Projects the annual sales baseline from year-to-date actuals. The existing
 * budget mix across unit, branch and month is preserved when scaling rows.
 */
export function proyectarMetaBaseDesdeVentas(
  filas: FilaBasePresupuesto[],
  anioVentas: number,
  fechaReferencia = new Date(),
): ProyeccionVentaBase {
  const anioActual = fechaReferencia.getFullYear();
  const mesActual = fechaReferencia.getMonth() + 1;
  const mesesConsiderados = anioVentas < anioActual
    ? 12
    : anioVentas === anioActual ? mesActual : 0;
  const ventaAcumulada = redondear(filas.reduce(
    (total, fila) => total + (fila.mes <= mesesConsiderados ? fila.realBase : 0),
    0,
  ));
  const presupuestoDisponible = redondear(filas.reduce(
    (total, fila) => total + Math.max(0, fila.basePresupuesto),
    0,
  ));
  const tieneVentas = ventaAcumulada > 0 && mesesConsiderados > 0;
  const metaBase = tieneVentas
    ? redondear(mesesConsiderados === 12 ? ventaAcumulada : ventaAcumulada / mesesConsiderados * 12)
    : presupuestoDisponible;
  const metaMinima = presupuestoDisponible;
  const metodo = !tieneVentas
    ? "presupuesto"
    : mesesConsiderados === 12 ? "cierre" : "proyeccion";

  let pesos = filas.map((fila) => Math.max(0, fila.basePresupuesto));
  let sumaPesos = pesos.reduce((total, peso) => total + peso, 0);
  if (sumaPesos <= 0) {
    pesos = filas.map((fila) => Math.max(0, fila.mes <= mesesConsiderados ? fila.realBase : 0));
    sumaPesos = pesos.reduce((total, peso) => total + peso, 0);
  }
  if (sumaPesos <= 0 && filas.length > 0) {
    pesos = filas.map(() => 1);
    sumaPesos = pesos.length;
  }

  const indiceUltimoConPeso = pesos.reduce((ultimo, peso, indice) => peso > 0 ? indice : ultimo, -1);
  let asignado = 0;
  const filasProyectadas = filas.map((fila, indice) => {
    if (indiceUltimoConPeso < 0) return { ...fila, basePresupuesto: 0 };
    const monto = indice === indiceUltimoConPeso
      ? redondear(metaBase - asignado)
      : redondear(metaBase * pesos[indice] / sumaPesos);
    asignado = redondear(asignado + monto);
    return { ...fila, basePresupuesto: monto };
  });

  return { filas: filasProyectadas, metaBase, metaMinima, ventaAcumulada, mesesConsiderados, metodo };
}

function repartir(total: number, porcentajes: number[]): number[] {
  if (porcentajes.length === 0) return [];
  const centavos = Math.round(total * 100);
  const suma = porcentajes.reduce((a, b) => a + b, 0);
  const importes = porcentajes.map((pct) => Math.floor((centavos * pct) / suma));
  importes[importes.length - 1] = centavos - importes.slice(0, -1).reduce((a, b) => a + b, 0);
  return importes.map((n) => n / 100);
}

function porcentajesPorPeso(pesos: number[]): number[] {
  if (pesos.length === 0) return [];
  const total = pesos.reduce((a, b) => a + Math.max(0, b), 0);
  const efectivos = total > 0 ? pesos.map((p) => Math.max(0, p)) : pesos.map(() => 1);
  const divisor = efectivos.reduce((a, b) => a + b, 0);
  const porcentajes = efectivos.map((p) => redondear((p / divisor) * 100));
  porcentajes[porcentajes.length - 1] = redondear(100 - porcentajes.slice(0, -1).reduce((a, b) => a + b, 0));
  return porcentajes;
}

function validarSuma(nombre: string, elementos: Array<{ participacion: number }>, errores: string[]) {
  const total = elementos.reduce((suma, fila) => suma + fila.participacion, 0);
  if (Math.abs(total - 100) > TOLERANCIA_PCT) {
    errores.push(`${nombre}: los porcentajes suman ${redondear(total)} %, deben sumar 100 %.`);
  }
}

export function distribucionInicial(
  filas: FilaBasePresupuesto[],
  crecimientoAnualPct = 0,
  gestionComercialPctPorUnidad: Map<string, number> = new Map(),
  gestionComercialMontoPorUnidad: Map<string, number> = new Map(),
): DistribucionPresupuesto {
  const pesosUnidad = new Map<string, { id: string | null; peso: number }>();
  const pesosSucursal = new Map<string, { unidadId: string | null; sucursalId: string | null; peso: number }>();
  const pesosMes = new Map<string, { unidadId: string | null; mes: number; peso: number }>();

  for (const fila of filas) {
    const unidadKey = llave(fila.unidadNegocioId);
    const unidad = pesosUnidad.get(unidadKey) ?? { id: fila.unidadNegocioId, peso: 0 };
    unidad.peso += Math.max(0, fila.basePresupuesto);
    pesosUnidad.set(unidadKey, unidad);

    const sucursalKey = `${unidadKey}:${llave(fila.sucursalId)}`;
    const sucursal = pesosSucursal.get(sucursalKey) ?? {
      unidadId: fila.unidadNegocioId,
      sucursalId: fila.sucursalId,
      peso: 0,
    };
    sucursal.peso += Math.max(0, fila.basePresupuesto);
    pesosSucursal.set(sucursalKey, sucursal);

    const mesKey = `${unidadKey}:${fila.mes}`;
    const mes = pesosMes.get(mesKey) ?? { unidadId: fila.unidadNegocioId, mes: fila.mes, peso: 0 };
    mes.peso += Math.max(0, fila.basePresupuesto);
    pesosMes.set(mesKey, mes);
  }

  const unidades = [...pesosUnidad.values()];
  const unidadPct = porcentajesPorPeso(unidades.map((x) => x.peso));
  const sucursales = [...pesosSucursal.values()];
  const sucursalPct = new Map<string, number>();
  for (const unidad of unidades) {
    const grupo = sucursales.filter((x) => x.unidadId === unidad.id);
    const porcentajes = porcentajesPorPeso(grupo.map((x) => x.peso));
    grupo.forEach((sucursal, index) => {
      sucursalPct.set(`${llave(sucursal.unidadId)}:${llave(sucursal.sucursalId)}`, porcentajes[index] ?? 0);
    });
  }

  for (const unidad of unidades) {
    const grupo = Array.from({ length: 12 }, (_, index) => ({
      unidadId: unidad.id,
      mes: index + 1,
      peso: pesosMes.get(`${llave(unidad.id)}:${index + 1}`)?.peso ?? 0,
    }));
    const porcentajes = porcentajesPorPeso(grupo.map((x) => x.peso));
    grupo.forEach((mes, index) => sucursalPct.set(`mes:${llave(mes.unidadId)}:${mes.mes}`, porcentajes[index] ?? 0));
  }

  return {
    crecimientoAnualPct,
    unidades: unidades.map((unidad, index) => ({
      unidadNegocioId: unidad.id,
      participacion: unidadPct[index] ?? 0,
      gestionComercialPct: gestionComercialPctPorUnidad.get(llave(unidad.id)) ?? 0,
      gestionComercialMonto: gestionComercialMontoPorUnidad.get(llave(unidad.id)) ?? null,
    })),
    sucursales: sucursales.map((sucursal) => ({
      unidadNegocioId: sucursal.unidadId,
      sucursalId: sucursal.sucursalId,
      participacion: sucursalPct.get(`${llave(sucursal.unidadId)}:${llave(sucursal.sucursalId)}`) ?? 0,
    })),
    meses: unidades.flatMap((unidad) => Array.from({ length: 12 }, (_, index) => ({
      unidadNegocioId: unidad.id,
      mes: index + 1,
      participacion: sucursalPct.get(`mes:${llave(unidad.id)}:${index + 1}`) ?? 0,
    }))),
  };
}

export function calcularDistribucionPresupuesto(
  filas: FilaBasePresupuesto[],
  distribucion: DistribucionPresupuesto,
  metaMinima: number,
): { metaBase: number; metaPropuesta: number; montoGestionComercialTotal: number; metaTotalConGestion: number; totalesUnidad: Array<{ unidadNegocioId: string | null; metaBase: number; gestionComercialPct: number; gestionComercialMonto: number; metaTotal: number }>; errores: string[]; filas: FilaPropuesta[] } {
  const errores: string[] = [];
  const metaBase = redondear(filas.reduce((suma, fila) => suma + fila.basePresupuesto, 0));
  if (!Number.isFinite(distribucion.crecimientoAnualPct) || distribucion.crecimientoAnualPct < 0 || distribucion.crecimientoAnualPct > MAX_CRECIEMIENTO_PCT) {
    errores.push(`El crecimiento anual debe estar entre 0 % y ${MAX_CRECIEMIENTO_PCT} %.`);
  }
  if (new Set(distribucion.unidades.map((x) => llave(x.unidadNegocioId))).size !== distribucion.unidades.length) {
    errores.push("Hay unidades repetidas en la distribución.");
  }
  if (new Set(distribucion.sucursales.map((x) => `${llave(x.unidadNegocioId)}:${llave(x.sucursalId)}`)).size !== distribucion.sucursales.length) {
    errores.push("Hay sucursales repetidas en la distribución.");
  }
  for (const fila of [...distribucion.unidades, ...distribucion.sucursales]) {
    if (!Number.isFinite(fila.participacion) || fila.participacion < 0 || fila.participacion > 100) {
      errores.push("Cada participación debe estar entre 0 % y 100 %.");
      break;
    }
  }
  if (distribucion.unidades.some((unidad) => !Number.isFinite(unidad.gestionComercialPct) || unidad.gestionComercialPct < 0 || unidad.gestionComercialPct > 100)) {
    errores.push("El % de Gestión Comercial debe estar entre 0 % y 100 % para cada unidad.");
  }

  validarSuma("Unidades de negocio", distribucion.unidades, errores);
  for (const unidad of distribucion.unidades) {
    const grupo = distribucion.sucursales.filter((x) => x.unidadNegocioId === unidad.unidadNegocioId);
    if (grupo.length === 0) errores.push("Cada unidad debe tener al menos una sucursal asignada.");
    validarSuma(`Sucursales de ${llave(unidad.unidadNegocioId)}`, grupo, errores);
    const meses = distribucion.meses.filter((x) => x.unidadNegocioId === unidad.unidadNegocioId);
    if (meses.length !== 12 || new Set(meses.map((x) => x.mes)).size !== 12 || meses.some((x) => x.mes < 1 || x.mes > 12)) {
      errores.push(`La distribución mensual de ${llave(unidad.unidadNegocioId)} debe incluir cada mes una sola vez.`);
    }
    validarSuma(`Meses de ${llave(unidad.unidadNegocioId)}`, meses, errores);
  }

  const idsUnidadesBase = new Set(filas.map((x) => llave(x.unidadNegocioId)));
  const idsUnidadesConfig = new Set(distribucion.unidades.map((x) => llave(x.unidadNegocioId)));
  if (idsUnidadesBase.size !== idsUnidadesConfig.size || [...idsUnidadesBase].some((id) => !idsUnidadesConfig.has(id))) {
    errores.push("La distribución de unidades no coincide con las unidades del presupuesto base.");
  }
  const paresBase = new Set(filas.map((x) => `${llave(x.unidadNegocioId)}:${llave(x.sucursalId)}`));
  const paresConfig = new Set(distribucion.sucursales.map((x) => `${llave(x.unidadNegocioId)}:${llave(x.sucursalId)}`));
  if (paresBase.size !== paresConfig.size || [...paresBase].some((id) => !paresConfig.has(id))) {
    errores.push("La distribución de sucursales no coincide con las sucursales del presupuesto base.");
  }
  const mesesBase = new Set(filas.map((x) => `${llave(x.unidadNegocioId)}:${x.mes}`));
  const mesesConfig = new Set(distribucion.meses.map((x) => `${llave(x.unidadNegocioId)}:${x.mes}`));
  if (mesesBase.size !== idsUnidadesBase.size * 12 || mesesBase.size !== mesesConfig.size || [...mesesBase].some((id) => !mesesConfig.has(id))) {
    // A base may have sparse months; a valid distribution still explicitly
    // contains all twelve months for each represented unit.
    if (distribucion.meses.length !== idsUnidadesBase.size * 12) errores.push("La distribución mensual no coincide con las unidades del presupuesto base.");
  }

  const metaPropuesta = redondear(metaBase * (1 + distribucion.crecimientoAnualPct / 100));
  if (metaPropuesta + 0.005 < metaMinima) {
    errores.push(`La meta propuesta (${formatearMonto(metaPropuesta)}) no puede ser menor que la última meta aprobada (${formatearMonto(metaMinima)}).`);
  }
  if (errores.length > 0) return { metaBase, metaPropuesta, montoGestionComercialTotal: 0, metaTotalConGestion: metaPropuesta, totalesUnidad: [], errores, filas: [] };

  const meses = Array.from({ length: 12 }, (_, index) => index + 1);
  const metadata = new Map(filas.map((fila) => [`${fila.mes}:${llave(fila.sucursalId)}:${llave(fila.unidadNegocioId)}`, fila]));
  const salida: FilaPropuesta[] = [];
  const metasBaseUnidad = repartir(metaPropuesta, distribucion.unidades.map((x) => x.participacion));
  const totalesUnidad = distribucion.unidades.map((unidad, index) => {
    const metaBaseUnidad = metasBaseUnidad[index] ?? 0;
    const gestionComercialMonto = unidad.gestionComercialMonto === null
      ? redondear(metaBaseUnidad * unidad.gestionComercialPct / 100)
      : redondear(unidad.gestionComercialMonto);
    return { unidadNegocioId: unidad.unidadNegocioId, metaBase: metaBaseUnidad, gestionComercialPct: unidad.gestionComercialPct, gestionComercialMonto, metaTotal: redondear(metaBaseUnidad + gestionComercialMonto) };
  });
  const montoGestionComercialTotal = redondear(totalesUnidad.reduce((sum, unidad) => sum + unidad.gestionComercialMonto, 0));
  const metaTotalConGestion = redondear(metaPropuesta + montoGestionComercialTotal);

  distribucion.unidades.forEach((unidad, unidadIndex) => {
    const metaUnidad = totalesUnidad[unidadIndex]?.metaTotal ?? 0;
    const grupoSucursal = distribucion.sucursales.filter((x) => x.unidadNegocioId === unidad.unidadNegocioId);
    const metasMes = repartir(metaUnidad, meses.map((mes) =>
      distribucion.meses.find((x) => x.unidadNegocioId === unidad.unidadNegocioId && x.mes === mes)?.participacion ?? 0,
    ));
    meses.forEach((mes, mesIndex) => {
      const metasSucursal = repartir(metasMes[mesIndex] ?? 0, grupoSucursal.map((x) => x.participacion));
      grupoSucursal.forEach((sucursal, sucursalIndex) => {
        const base = metadata.get(`${mes}:${llave(sucursal.sucursalId)}:${llave(unidad.unidadNegocioId)}`);
        salida.push({
          mes,
          sucursalId: sucursal.sucursalId,
          sucursal: base?.sucursal ?? null,
          unidadNegocioId: unidad.unidadNegocioId,
          unidad: base?.unidad ?? null,
          basePresupuesto: base?.basePresupuesto ?? 0,
          realBase: base?.realBase ?? 0,
          sugerido: metasSucursal[sucursalIndex] ?? 0,
        });
      });
    });
  });

  return { metaBase, metaPropuesta, montoGestionComercialTotal, metaTotalConGestion, totalesUnidad, errores, filas: salida };
}
