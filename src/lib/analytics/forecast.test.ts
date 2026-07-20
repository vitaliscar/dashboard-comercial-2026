import { describe, it, expect } from "vitest";
import {
  forecastSerieMensual,
  calcularRollRate,
  calcularRecuperacionEsperada,
  type SeriePunto,
} from "./forecast";

function serieSintetica(meses: number, base: number, crecimientoMensual: number): SeriePunto[] {
  const puntos: SeriePunto[] = [];
  let anio = 2024;
  let mes = 1;
  for (let i = 0; i < meses; i++) {
    const estacional = i % 12 === 11 ? 1.3 : 1; // pico en diciembre
    puntos.push({ anio, mes, valor: Math.round(base * (1 + crecimientoMensual * i) * estacional) });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return puntos;
}

describe("forecastSerieMensual", () => {
  it("serie vacía → proyección vacía, sin método forzado a Holt-Winters", () => {
    const result = forecastSerieMensual([], 3);
    expect(result.proyeccion).toHaveLength(0);
    expect(result.mape).toBeNull();
  });

  it("serie corta (< 24 puntos) degrada a media móvil ponderada", () => {
    const serie = serieSintetica(10, 1000, 0);
    const result = forecastSerieMensual(serie, 3);

    expect(result.metodo).toBe("media-movil-ponderada");
    expect(result.proyeccion).toHaveLength(3);
  });

  it("serie larga (>= 24 puntos) usa Holt-Winters", () => {
    const serie = serieSintetica(30, 1000, 0.01);
    const result = forecastSerieMensual(serie, 3);

    expect(result.metodo).toBe("holt-winters");
    expect(result.proyeccion).toHaveLength(3);
  });

  it("proyección continúa la secuencia de anio/mes tras el último punto real", () => {
    const serie = serieSintetica(24, 1000, 0);
    const result = forecastSerieMensual(serie, 3);
    const ultimoReal = serie[serie.length - 1];

    expect(result.proyeccion[0].anio).toBe(
      ultimoReal.mes === 12 ? ultimoReal.anio + 1 : ultimoReal.anio,
    );
    expect(result.proyeccion[0].mes).toBe(ultimoReal.mes === 12 ? 1 : ultimoReal.mes + 1);
    expect(result.proyeccion).toHaveLength(3);
    // Los 3 meses proyectados deben ser consecutivos sin huecos.
    for (let i = 1; i < result.proyeccion.length; i++) {
      const prev = result.proyeccion[i - 1];
      const curr = result.proyeccion[i];
      const prevTotal = prev.anio * 12 + prev.mes;
      const currTotal = curr.anio * 12 + curr.mes;
      expect(currTotal - prevTotal).toBe(1);
    }
  });

  it("serie con crecimiento sostenido produce proyección con MAPE bajo (< 15%)", () => {
    const serie = serieSintetica(36, 1000, 0.02);
    const result = forecastSerieMensual(serie, 3);

    expect(result.mape).not.toBeNull();
    expect(result.mape!).toBeLessThan(15);
  });

  it("serie plana (sin tendencia ni estacionalidad) proyecta valores cercanos al nivel base", () => {
    const serie = Array.from({ length: 24 }, (_, i) => ({
      anio: 2024 + Math.floor(i / 12),
      mes: (i % 12) + 1,
      valor: 5000,
    }));
    const result = forecastSerieMensual(serie, 3);

    for (const punto of result.proyeccion) {
      expect(punto.valor).toBeGreaterThan(4000);
      expect(punto.valor).toBeLessThan(6000);
    }
  });

  it("horizonte 0 devuelve proyección vacía sin lanzar error", () => {
    const serie = serieSintetica(30, 1000, 0.01);
    const result = forecastSerieMensual(serie, 0);
    expect(result.proyeccion).toHaveLength(0);
  });
});

describe("calcularRollRate", () => {
  it("saldo anterior 1000, saldo siguiente bucket actual 300 → roll-rate 0.3", () => {
    expect(calcularRollRate({ saldoBucketAnterior: 1000, saldoBucketSiguienteActual: 300 })).toBe(
      0.3,
    );
  });

  it("saldo bucket anterior 0 → roll-rate 0 (evita división por cero)", () => {
    expect(calcularRollRate({ saldoBucketAnterior: 0, saldoBucketSiguienteActual: 500 })).toBe(0);
  });

  it("roll-rate se acota a [0,1] aunque el saldo siguiente exceda al anterior", () => {
    expect(calcularRollRate({ saldoBucketAnterior: 100, saldoBucketSiguienteActual: 250 })).toBe(1);
  });
});

describe("calcularRecuperacionEsperada", () => {
  it("suma la porción no-rodada de cada bucket", () => {
    const recuperacion = calcularRecuperacionEsperada([
      { saldoBucket: 1000, rollRate: 0.2 }, // recupera 800
      { saldoBucket: 500, rollRate: 0.5 }, // recupera 250
    ]);
    expect(recuperacion).toBe(1050);
  });

  it("lista vacía → recuperación 0", () => {
    expect(calcularRecuperacionEsperada([])).toBe(0);
  });

  it("rollRate 1 en todos los buckets → recuperación esperada 0", () => {
    const recuperacion = calcularRecuperacionEsperada([
      { saldoBucket: 1000, rollRate: 1 },
      { saldoBucket: 500, rollRate: 1 },
    ]);
    expect(recuperacion).toBe(0);
  });
});
