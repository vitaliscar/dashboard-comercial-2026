/**
 * Actualiza presupuestos.monto de agosto 2026 con las cifras oficiales que
 * el usuario confirmó (incluyen el arrastre de $91.994 de julio, distribuido
 * proporcionalmente entre sucursales — ver mensaje del usuario 2026-09-02).
 *
 * Uso: bun scripts/actualizar-presupuesto-monto-agosto.ts
 */
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { presupuestos, sucursales, unidadesNegocio } from "@/db/schema";

const ANIO = 2026;
const MES = 8;

// "Los Ruices" es el mismo nombre alterno de "Caracas" usado en algunas
// unidades del cuadro real -- mismo mapeo que ya se aplica en todo el
// pipeline de reconciliación de esta sesión.
const normalizarSucursal = (s: string) => (s === "Los Ruices" ? "Caracas" : s);

const MONTOS: Record<string, Record<string, number>> = {
  Repuestos: {
    "Puerto Ordaz": 104170, "FMO Piar": 229174, "Puerto La Cruz": 41669,
    Barquisimeto: 69446, Valencia: 55511, Caracas: 55558, Maracaibo: 48613,
    "Punto Fijo": 90281, Maturín: 0, "Machine Shop": 0,
  },
  "Lubricantes/Filtros": {
    "Puerto Ordaz": 154007, "FMO Piar": 113240, "Puerto La Cruz": 31707,
    Barquisimeto: 36237, Valencia: 59586, "Los Ruices": 22648, Maracaibo: 36237,
    "Punto Fijo": 24451, Maturín: 0, "Machine Shop": 0,
  },
  Servicios: {
    "Puerto Ordaz": 38495, "FMO Piar": 83784, "Puerto La Cruz": 40760,
    Barquisimeto: 45289, Valencia: 84373, "Los Ruices": 49818, Maracaibo: 60551,
    "Punto Fijo": 45289, Maturín: 4529, "Machine Shop": 0,
  },
  Equipos: {
    "Puerto Ordaz": 26298, "FMO Piar": 0, "Puerto La Cruz": 32873,
    Barquisimeto: 49309, Valencia: 85469, Caracas: 92044, Maracaibo: 26298,
    "Punto Fijo": 16436, Maturín: 0, "Machine Shop": 0,
  },
  Alquiler: {
    "Puerto Ordaz": 3536, "FMO Piar": 0, "Puerto La Cruz": 127299,
    Barquisimeto: 56577, Valencia: 357145, Caracas: 130835, Maracaibo: 28289,
    "Punto Fijo": 3536, Maturín: 0, "Machine Shop": 0,
  },
};

async function main() {
  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const sucursalMap = new Map(sucursalesRows.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
    const unidadMap = new Map(unidadesRows.map((u) => [u.nombre.trim().toLowerCase(), u.id]));

    let actualizadas = 0;
    const noResueltas: string[] = [];
    for (const [unidad, porSucursal] of Object.entries(MONTOS)) {
      const unidadId = unidadMap.get(unidad.trim().toLowerCase());
      if (!unidadId) {
        noResueltas.push(`unidad:${unidad}`);
        continue;
      }
      for (const [sucursalCruda, monto] of Object.entries(porSucursal)) {
        const sucursal = normalizarSucursal(sucursalCruda);
        const sucursalId = sucursalMap.get(sucursal.trim().toLowerCase());
        if (!sucursalId) {
          noResueltas.push(`${unidad}|${sucursal}`);
          continue;
        }
        const resultado = await tx
          .update(presupuestos)
          .set({ monto: String(monto) })
          .where(
            and(
              eq(presupuestos.anio, ANIO),
              eq(presupuestos.mes, MES),
              eq(presupuestos.sucursalId, sucursalId),
              eq(presupuestos.unidadNegocioId, unidadId),
            ),
          )
          .returning({ id: presupuestos.id });
        if (resultado.length > 0) {
          actualizadas++;
          console.log(`✓ ${unidad} / ${sucursal}: monto=${monto}`);
        } else {
          console.warn(`⚠️  No existe fila presupuestos para ${unidad} / ${sucursal} en ${ANIO}-${MES}`);
        }
      }
    }
    console.log(`\n✅ ${actualizadas} filas de presupuestos.monto actualizadas`);
    if (noResueltas.length > 0) {
      console.warn("⚠️  No resueltas contra catálogo:", noResueltas);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
