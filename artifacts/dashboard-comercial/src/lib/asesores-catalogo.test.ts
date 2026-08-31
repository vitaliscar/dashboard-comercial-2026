import { describe, it, expect } from "vitest";
import { resolverAsesor, VENTAS_CASA, ASESORES_CANONICOS } from "./asesores-catalogo";

describe("resolverAsesor Unit Tests", () => {
  it("should resolve exact sales advisor codes", () => {
    const result = resolverAsesor({ codigo: "57995" });
    expect(result.nombre).toBe("Felix Conde");
    expect(result.codigo).toBe("57995");
    expect(result.sucursal).toBe("Puerto Ordaz");
  });

  it("should resolve numeric codes and codes with padding or whitespaces", () => {
    const resultPadded = resolverAsesor({ codigo: " 057995 " });
    expect(resultPadded.nombre).toBe("Felix Conde");

    const resultNumeric = resolverAsesor({ codigo: 57995 });
    expect(resultNumeric.nombre).toBe("Felix Conde");
  });

  it("should resolve exact advisor names", () => {
    const result = resolverAsesor({ nombre: "Felix Conde" });
    expect(result.nombre).toBe("Felix Conde");
    expect(result.codigo).toBe("57995");
  });

  it("should resolve names with accents, different cases, and spaces", () => {
    const resultAccent = resolverAsesor({ nombre: "Félix Conde" });
    expect(resultAccent.nombre).toBe("Felix Conde");

    const resultLower = resolverAsesor({ nombre: "felix conde" });
    expect(resultLower.nombre).toBe("Felix Conde");

    const resultSpaces = resolverAsesor({ nombre: "  Felix   Conde  " });
    expect(resultSpaces.nombre).toBe("Felix Conde");
  });

  it("should resolve names using subset matching (e.g. CONDE FELIX or FELIX ERNESTO CONDE)", () => {
    // In database/Excel, we sometimes see inverted names
    const resultInverted = resolverAsesor({ nombre: "Conde Felix" });
    expect(resultInverted.nombre).toBe("Felix Conde");

    const resultFull = resolverAsesor({ nombre: "CONDE CEDEÑO FELIX ERNESTO" });
    expect(resultFull.nombre).toBe("Felix Conde");
  });

  it("should resolve names using subset matching where catalog name is a subset", () => {
    // Americo Alcalá Martinez has a multi-word name
    const resultPartial = resolverAsesor({ nombre: "Americo Alcala" });
    expect(resultPartial.nombre).toBe("Americo Alcalá Martinez");
  });

  it("should resolve using alias map if provided", () => {
    const aliases = new Map<string, string>([["custom alias", "57995"]]);
    const result = resolverAsesor({ nombre: "custom alias" }, aliases);
    expect(result.nombre).toBe("Felix Conde");
  });

  it("should fallback to VENTAS_CASA if code or name is missing or does not match", () => {
    const resultEmpty = resolverAsesor({});
    expect(resultEmpty).toBe(VENTAS_CASA);

    const resultInvalidCode = resolverAsesor({ codigo: "999999" });
    expect(resultInvalidCode).toBe(VENTAS_CASA);

    const resultInvalidName = resolverAsesor({ nombre: "Vendedor de Mostrador" });
    expect(resultInvalidName).toBe(VENTAS_CASA);
  });
});
