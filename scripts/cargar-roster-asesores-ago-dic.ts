/**
 * Reemplaza la base de cumplimiento_asesores (codigo/nombre/sucursal/
 * unidad/presupuesto) con el roster de 32 asesores que automatizacion
 * exportó del Sheet (fuente única de verdad, confirmado por el usuario
 * 2026-09-03) para AGO-DIC 2026.
 *
 * Reglas:
 * - SEP/OCT/NOV/DIC: no hay venta real cargada todavía -- se borra el mes
 *   completo y se reinserta desde el CSV limpio.
 * - AGOSTO: el CSV trae presupuesto=0 para todos (automatizacion no tenía
 *   el dato real de agosto) -- se conserva el presupuesto/venta que ya
 *   existía por (codigo_asesor, unidad) si la fila ya existía, y solo se
 *   inserta en 0 si es un asesor/unidad nuevo sin fila previa. Las filas de
 *   agosto de asesores que salieron del roster (7 personas) NO se borran --
 *   conservan su venta real ya reconciliada, solo quedan fuera del roster
 *   activo de aquí en adelante.
 *
 * Uso: bun scripts/cargar-roster-asesores-ago-dic.ts
 */
import * as fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/db";
import { cumplimientoAsesores, sucursales, unidadesNegocio } from "@/db/schema";

const CSV_PATH =
  process.env.ROSTER_CSV ??
  "D:\\dev\\automatizacion cumplimiento\\_cuadro\\roster_asesores_presupuesto_AGO_DIC_2026.csv";

type FilaRoster = {
  anio: number;
  mes: number;
  codigoAsesor: string;
  nombre: string;
  sucursal: string;
  unidad: string;
  presupuesto: number;
};

function leerCsv(ruta: string): FilaRoster[] {
  const contenido = fs.readFileSync(ruta, "utf-8").replace(/^\uFEFF/, "");
  const [cabecera, ...lineas] = contenido.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const columnas = cabecera.split(";").map((c) => c.trim().toLowerCase());
  const idx = (nombre: string) => columnas.indexOf(nombre);
  const iAnio = idx("anio");
  const iMes = idx("mes");
  const iCodigo = idx("codigo_asesor");
  const iNombre = idx("nombre");
  const iSucursal = idx("sucursal");
  const iUnidad = idx("unidad_negocio");
  const iPresupuesto = idx("presupuesto");

  return lineas.map((linea) => {
    const campos = linea.split(";");
    return {
      anio: Number(campos[iAnio]),
      mes: Number(campos[iMes]),
      codigoAsesor: campos[iCodigo].trim(),
      nombre: campos[iNombre].trim(),
      sucursal: campos[iSucursal].trim(),
      unidad: campos[iUnidad].trim(),
      presupuesto: Number(campos[iPresupuesto]) || 0,
    };
  });
}

// Sin tilde/acento y en minúscula -- el CSV del Sheet viene sin acentos
// ("Maturin", no "Maturín") y con nombres de unidad abreviados ("Lub/Filtros").
const sinAcentos = (texto: string): string =>
  texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const ALIAS_UNIDAD: Record<string, string> = {
  "lub/filtros": "lubricantes/filtros",
};

async function main() {
  const filas = leerCsv(CSV_PATH);
  console.log(`→ ${filas.length} filas leídas de ${CSV_PATH}`);

  const meses = [...new Set(filas.map((f) => f.mes))].sort((a, b) => a - b);
  console.log(`→ Meses en el roster: ${meses.join(", ")}`);

  await dbAdmin.transaction(async (tx) => {
    const sucursalesRows = await tx.select().from(sucursales);
    const sucursalMap = new Map(sucursalesRows.map((s) => [sinAcentos(s.nombre), s.id]));
    const unidadesRows = await tx.select().from(unidadesNegocio);
    const unidadMap = new Map(unidadesRows.map((u) => [sinAcentos(u.nombre), u.id]));

    const sucursalesNoResueltas = new Set<string>();
    let insertadas = 0;
    let preservadas = 0;
    let sinTocar = 0;

    for (const mes of meses) {
      const filasDelMes = filas.filter((f) => f.mes === mes);
      const esAgosto = mes === 8;

      if (!esAgosto) {
        await tx
          .delete(cumplimientoAsesores)
          .where(and(eq(cumplimientoAsesores.anio, 2026), eq(cumplimientoAsesores.mes, mes)));
      }

      for (const fila of filasDelMes) {
        const sucursalId = sucursalMap.get(sinAcentos(fila.sucursal));
        const unidadKey = sinAcentos(fila.unidad);
        const unidadId = unidadMap.get(ALIAS_UNIDAD[unidadKey] ?? unidadKey);
        if (!sucursalId || !unidadId) {
          sucursalesNoResueltas.add(`${fila.sucursal} (asesor ${fila.codigoAsesor})`);
          continue;
        }

        if (esAgosto) {
          const existente = await tx
            .select({ id: cumplimientoAsesores.id })
            .from(cumplimientoAsesores)
            .where(
              and(
                eq(cumplimientoAsesores.anio, 2026),
                eq(cumplimientoAsesores.mes, 8),
                eq(cumplimientoAsesores.codigoAsesor, fila.codigoAsesor),
                eq(cumplimientoAsesores.unidadNegocioId, unidadId),
              ),
            )
            .limit(1);
          if (existente.length > 0) {
            // Ya tiene venta reconciliada de hoy -- solo actualiza nombre/sucursal
            // por si cambiaron, sin tocar presupuesto/venta reales.
            await tx
              .update(cumplimientoAsesores)
              .set({ asesor: fila.nombre, sucursalId })
              .where(eq(cumplimientoAsesores.id, existente[0].id));
            preservadas++;
            continue;
          }
        }

        await tx.insert(cumplimientoAsesores).values({
          anio: fila.anio,
          mes: fila.mes,
          codigoAsesor: fila.codigoAsesor,
          asesor: fila.nombre,
          sucursalId,
          unidadNegocioId: unidadId,
          presupuesto: String(fila.presupuesto),
        });
        insertadas++;
      }
    }

    console.log(`\n✅ ${insertadas} filas nuevas insertadas`);
    console.log(`✅ ${preservadas} filas de agosto preservadas (venta/presupuesto real intactos)`);
    if (sucursalesNoResueltas.size > 0) {
      console.warn("⚠️  Sucursales/unidades no resueltas:", [...sucursalesNoResueltas]);
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
