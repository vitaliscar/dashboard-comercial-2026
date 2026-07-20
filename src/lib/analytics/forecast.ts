/**
 * Forecasting de series mensuales (ventas/cobranzas) para el módulo predictivo.
 *
 * Método principal: Holt-Winters aditivo (nivel + tendencia + estacionalidad),
 * con degradación automática a media móvil ponderada de 3 meses cuando la serie
 * es demasiado corta para estimar estacionalidad de forma confiable (< 24 puntos,
 * menos de 2 ciclos anuales). Ver docs/MASTER_STRATEGY.md §2.2.
 *
 * Toda función aquí es pura: recibe una serie ya agregada y scopeada
 * (p. ej. desde rpc_resumen_mensual) y no conoce Supabase ni el rol del usuario.
 */

const SEASONAL_LENGTH = 12;
const MIN_PUNTOS_HOLT_WINTERS = SEASONAL_LENGTH * 2;

export interface SeriePunto {
  anio: number;
  mes: number;
  valor: number;
}

export type MetodoForecast = "holt-winters" | "media-movil-ponderada";

export interface ForecastResultado {
  metodo: MetodoForecast;
  /** Pronóstico para los próximos `horizonte` meses, en orden cronológico. */
  proyeccion: SeriePunto[];
  /** MAPE (%) del backtesting sobre los últimos `ventanaBacktest` puntos reales. Null si no se pudo calcular. */
  mape: number | null;
}

export interface HoltWintersParams {
  alpha: number;
  beta: number;
  gamma: number;
}

const DEFAULT_PARAMS: HoltWintersParams = { alpha: 0.4, beta: 0.1, gamma: 0.3 };

function siguienteMes(anio: number, mes: number, pasos: number): { anio: number; mes: number } {
  const totalMeses = anio * 12 + (mes - 1) + pasos;
  return { anio: Math.floor(totalMeses / 12), mes: (totalMeses % 12) + 1 };
}

/**
 * Ajusta Holt-Winters aditivo sobre `valores` (orden cronológico, sin huecos) y
 * devuelve los niveles/tendencia/estacionalidad finales junto con los fitted
 * values (para poder calcular MAPE por fuera).
 */
function ajustarHoltWinters(
  valores: number[],
  params: HoltWintersParams,
): { nivel: number; tendencia: number; estacional: number[]; fitted: number[] } {
  const { alpha, beta, gamma } = params;
  const L = SEASONAL_LENGTH;

  const promedioInicial = valores.slice(0, L).reduce((a, b) => a + b, 0) / L;
  let nivel = promedioInicial;
  let tendencia =
    (valores.slice(L, 2 * L).reduce((a, b) => a + b, 0) / L -
      valores.slice(0, L).reduce((a, b) => a + b, 0) / L) /
    L;
  const estacional: number[] = valores.slice(0, L).map((v) => v - promedioInicial);
  const fitted: number[] = [];

  for (let t = 0; t < valores.length; t++) {
    const s = estacional[t % L];
    const pronostico = nivel + tendencia + s;
    fitted.push(pronostico);

    const y = valores[t];
    const nivelAnterior = nivel;
    nivel = alpha * (y - s) + (1 - alpha) * (nivel + tendencia);
    tendencia = beta * (nivel - nivelAnterior) + (1 - beta) * tendencia;
    estacional[t % L] = gamma * (y - nivel) + (1 - gamma) * s;
  }

  return { nivel, tendencia, estacional, fitted };
}

function proyectarHoltWinters(
  nivel: number,
  tendencia: number,
  estacional: number[],
  offsetEstacional: number,
  horizonte: number,
): number[] {
  const L = SEASONAL_LENGTH;
  const salida: number[] = [];
  for (let h = 1; h <= horizonte; h++) {
    const idx = (offsetEstacional + h - 1) % L;
    salida.push(nivel + h * tendencia + estacional[idx]);
  }
  return salida;
}

function mediaMovilPonderada3(valores: number[]): number {
  const n = valores.length;
  const v0 = valores[n - 1] ?? 0;
  const v1 = valores[n - 2] ?? v0;
  const v2 = valores[n - 3] ?? v1;
  return (3 * v0 + 2 * v1 + 1 * v2) / 6;
}

function calcularMAPE(reales: number[], predichos: number[]): number | null {
  const pares = reales
    .map((r, i) => ({ real: r, pred: predichos[i] }))
    .filter((p) => p.pred !== undefined && p.real !== 0);
  if (pares.length === 0) return null;
  const sumaErrorAbsPct = pares.reduce((acc, p) => acc + Math.abs((p.real - p.pred!) / p.real), 0);
  return Math.round((sumaErrorAbsPct / pares.length) * 100 * 100) / 100;
}

/**
 * Genera un forecast de `horizonte` meses a partir de una serie mensual ya
 * ordenada cronológicamente y sin huecos (un punto por mes consecutivo).
 *
 * Si la serie tiene < 24 puntos (menos de 2 ciclos estacionales), degrada a
 * media móvil ponderada de 3 meses en lugar de Holt-Winters (que requiere al
 * menos 2 ciclos para estimar estacionalidad de forma estable).
 */
export function forecastSerieMensual(
  serie: SeriePunto[],
  horizonte = 3,
  params: HoltWintersParams = DEFAULT_PARAMS,
): ForecastResultado {
  const valores = serie.map((p) => p.valor);
  const ultimo = serie[serie.length - 1];

  if (serie.length === 0) {
    return { metodo: "media-movil-ponderada", proyeccion: [], mape: null };
  }

  if (serie.length < MIN_PUNTOS_HOLT_WINTERS) {
    const proyeccion: SeriePunto[] = [];
    const historicoExtendido = [...valores];
    for (let h = 1; h <= horizonte; h++) {
      const pred = mediaMovilPonderada3(historicoExtendido);
      const { anio, mes } = siguienteMes(ultimo.anio, ultimo.mes, h);
      proyeccion.push({ anio, mes, valor: Math.round(pred * 100) / 100 });
      historicoExtendido.push(pred);
    }

    let mape: number | null = null;
    const ventana = Math.min(6, valores.length - 3);
    if (ventana > 0) {
      const preds: number[] = [];
      for (let i = valores.length - ventana; i < valores.length; i++) {
        preds.push(mediaMovilPonderada3(valores.slice(0, i)));
      }
      mape = calcularMAPE(valores.slice(valores.length - ventana), preds);
    }

    return { metodo: "media-movil-ponderada", proyeccion, mape };
  }

  const { nivel, tendencia, estacional, fitted } = ajustarHoltWinters(valores, params);
  const proyeccionValores = proyectarHoltWinters(
    nivel,
    tendencia,
    estacional,
    valores.length,
    horizonte,
  );

  const proyeccion: SeriePunto[] = proyeccionValores.map((valor, i) => {
    const { anio, mes } = siguienteMes(ultimo.anio, ultimo.mes, i + 1);
    return { anio, mes, valor: Math.round(valor * 100) / 100 };
  });

  const ventanaBacktest = Math.min(6, valores.length);
  const mape = calcularMAPE(
    valores.slice(valores.length - ventanaBacktest),
    fitted.slice(fitted.length - ventanaBacktest),
  );

  return { metodo: "holt-winters", proyeccion, mape };
}

export interface RollRateInput {
  /** Saldo del bucket de aging en el snapshot anterior. */
  saldoBucketAnterior: number;
  /** Saldo del bucket siguiente (más vencido) en el snapshot actual. */
  saldoBucketSiguienteActual: number;
}

/**
 * Roll-rate: fracción del saldo de un bucket de aging que "rueda" al
 * siguiente bucket (más vencido) en vez de cobrarse. Requiere snapshots
 * consecutivos de `cobranzas_snapshots` agrupados por bucket de aging.
 */
export function calcularRollRate({
  saldoBucketAnterior,
  saldoBucketSiguienteActual,
}: RollRateInput): number {
  if (saldoBucketAnterior <= 0) return 0;
  return Math.min(1, Math.max(0, saldoBucketSiguienteActual / saldoBucketAnterior));
}

export interface RecuperacionEsperadaInput {
  saldoBucket: number;
  rollRate: number;
}

/**
 * Recuperación esperada a 30 días sobre la cartera actual, sumando por
 * bucket de aging: lo que no "rueda" al siguiente bucket se asume cobrado.
 */
export function calcularRecuperacionEsperada(buckets: RecuperacionEsperadaInput[]): number {
  const total = buckets.reduce((acc, b) => acc + b.saldoBucket * (1 - b.rollRate), 0);
  return Math.round(total * 100) / 100;
}
