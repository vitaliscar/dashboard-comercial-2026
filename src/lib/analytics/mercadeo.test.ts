import { describe, it, expect } from "vitest";
import {
  agruparCanalesPorTipo,
  buildMercadeoLineSeries,
  buildMercadeoStackedSeries,
  computeEmbudoConPct,
  esCanalHojaCanales,
  getMercadeoHighlightLabels,
  mesesConDatos,
  ordenarCanales,
  rankedWithPct,
  sumCantidad,
  tipoPorDefectoCanales,
} from "@/lib/analytics/mercadeo";

describe("sumCantidad", () => {
  it("suma solo los meses permitidos", () => {
    const rows = [
      { mes: 1, cantidad: 10 },
      { mes: 2, cantidad: 20 },
      { mes: 3, cantidad: 5 },
    ];
    expect(sumCantidad(rows, [1, 3])).toBe(15);
  });
});

describe("buildMercadeoLineSeries", () => {
  it("genera un punto por mes con datos", () => {
    const rows = [
      { mes: 1, cantidad: 100, canal: "Facebook" },
      { mes: 2, cantidad: 200, canal: "Facebook" },
      { mes: 3, cantidad: 0, canal: "Facebook" },
    ];
    const serie = buildMercadeoLineSeries(rows, ["Facebook"], (r) => r.canal);
    expect(serie).toHaveLength(2);
    expect(serie[0].Facebook).toBe(100);
    expect(serie[1].Facebook).toBe(200);
  });
});

describe("mesesConDatos", () => {
  it("omite meses sin cantidad", () => {
    expect(
      mesesConDatos([
        { mes: 1, cantidad: 10 },
        { mes: 2, cantidad: 0 },
        { mes: 3, cantidad: 5 },
      ]),
    ).toEqual([1, 3]);
  });
});

describe("getMercadeoHighlightLabels", () => {
  it("resalta todos los meses con datos si el filtro es all", () => {
    expect(getMercadeoHighlightLabels("all", [1, 2, 3])).toEqual(["Ene", "Feb", "Mar"]);
  });

  it("resalta solo los meses del filtro que tienen datos", () => {
    expect(getMercadeoHighlightLabels([2, 4], [1, 2, 3, 4, 5])).toEqual(["Feb", "Abr"]);
  });
});

describe("rankedWithPct", () => {
  it("calcula porcentajes del total", () => {
    const r = rankedWithPct([
      { label: "A", value: 75 },
      { label: "B", value: 25 },
    ]);
    expect(r[0].pct).toBe(75);
    expect(r[1].pct).toBe(25);
  });
});

describe("computeEmbudoConPct", () => {
  it("incluye pct del total y conversión desde etapa anterior", () => {
    const r = computeEmbudoConPct([
      { estatus: "Nuevo", cantidad: 100 },
      { estatus: "Convertidos", cantidad: 25 },
    ]);
    expect(r[0].pctTotal).toBe(80);
    expect(r[0].pctEtapaAnterior).toBeNull();
    expect(r[1].pctTotal).toBe(20);
    expect(r[1].pctEtapaAnterior).toBe(25);
  });
});

describe("esCanalHojaCanales", () => {
  it("excluye Instagram de la hoja Canales", () => {
    expect(esCanalHojaCanales("Facebook")).toBe(true);
    expect(esCanalHojaCanales("Instagram")).toBe(false);
  });
});

describe("ordenarCanales", () => {
  it("respeta el orden del Excel", () => {
    expect(ordenarCanales(["Youtube", "Facebook", "Pagina Web"])).toEqual([
      "Pagina Web",
      "Facebook",
      "Youtube",
    ]);
  });
});

describe("agruparCanalesPorTipo", () => {
  it("agrupa canales por métrica", () => {
    const rows = [
      { canal: "Facebook", tipo: "Alcance", mes: 1, cantidad: 1 },
      { canal: "Linkedin", tipo: "Visualizaciones", mes: 1, cantidad: 2 },
      { canal: "Facebook", tipo: "Visualizaciones", mes: 1, cantidad: 3 },
    ];
    const map = agruparCanalesPorTipo(rows, (r) => r.canal, (r) => r.tipo);
    expect(map.get("Alcance")).toEqual(["Facebook"]);
    expect(map.get("Visualizaciones")).toEqual(["Linkedin", "Facebook"]);
  });
});

describe("tipoPorDefectoCanales", () => {
  it("prefiere Visualizaciones porque abarca varios canales", () => {
    const map = new Map([
      ["Alcance", ["Facebook"]],
      ["Visualizaciones", ["Facebook", "Linkedin", "Youtube"]],
      ["Visitas Sitio Web", ["Pagina Web"]],
    ]);
    expect(tipoPorDefectoCanales(["Alcance", "Visitas Sitio Web", "Visualizaciones"], map)).toBe(
      "Visualizaciones",
    );
  });
});

describe("buildMercadeoStackedSeries", () => {
  it("apila segmentos por mes", () => {
    const rows = [
      { mes: 1, cantidad: 10, canal: "Facebook" },
      { mes: 1, cantidad: 5, canal: "Linkedin" },
    ];
    const serie = buildMercadeoStackedSeries(
      rows,
      ["Facebook", "Linkedin"],
      (r) => r.canal,
    );
    expect(serie[0].Facebook).toBe(10);
    expect(serie[0].Linkedin).toBe(5);
  });
});
