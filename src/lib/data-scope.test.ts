import { describe, it, expect } from "vitest";
import { scoped } from "./data-scope";
import type { UserProfile } from "@/hooks/use-auth";

describe("scoped query helper", () => {
  it("should return query unaltered for gerencia role", () => {
    const mockQuery = { value: "original" };
    const res = scoped(
      mockQuery,
      "gerencia",
      {
        id: "123",
        email: "g@ccv.com",
        nombre_completo: "Gerencia",
        sucursal_id: null,
        unidad_negocio_id: null,
        is_admin: true,
      },
      "123",
      { sucursal: "sucursal_id", unidad: "unidad_negocio_id" },
    );
    expect(res).toBe(mockQuery);
  });

  it("should apply eq for coordinator sucursal", () => {
    const calls: Array<{ col: string; val: string | string[] }> = [];
    const mockQuery = {
      eq: (c: string, v: string) => {
        calls.push({ col: c, val: v });
        return mockQuery;
      },
    };
    const profile: UserProfile = {
      id: "coord-1",
      email: "c@ccv.com",
      nombre_completo: "Coord",
      sucursal_id: "suc-abc",
      unidad_negocio_id: null,
      is_admin: false,
    };

    scoped(mockQuery, "coordinador", profile, "coord-1", { sucursal: "suc_col" });
    expect(calls).toEqual([{ col: "suc_col", val: "suc-abc" }]);
  });

  it("should apply in for multi-unit manager", () => {
    const calls: Array<{ col: string; val: string | string[] }> = [];
    const mockQuery = {
      in: (c: string, v: string[]) => {
        calls.push({ col: c, val: v });
        return mockQuery;
      },
    };
    const profile: UserProfile = {
      id: "manager-1",
      email: "m@ccv.com",
      nombre_completo: "Nestor",
      sucursal_id: null,
      unidad_negocio_id: "unit-1",
      unidades_negocio_ids: ["unit-1", "unit-2"],
      is_admin: false,
    };

    scoped(mockQuery, "gerente_comercial", profile, "manager-1", { unidad: "un_col" });
    expect(calls).toEqual([{ col: "un_col", val: ["unit-1", "unit-2"] }]);
  });

  it("should fallback to singular unit column if bridge array is empty", () => {
    const calls: Array<{ col: string; val: string | string[] }> = [];
    const mockQuery = {
      in: (c: string, v: string[]) => {
        calls.push({ col: c, val: v });
        return mockQuery;
      },
    };
    const profile: UserProfile = {
      id: "manager-1",
      email: "m@ccv.com",
      nombre_completo: "Nestor",
      sucursal_id: null,
      unidad_negocio_id: "unit-1",
      unidades_negocio_ids: [],
      is_admin: false,
    };

    scoped(mockQuery, "gerente_comercial", profile, "manager-1", { unidad: "un_col" });
    expect(calls).toEqual([{ col: "un_col", val: ["unit-1"] }]);
  });
});
