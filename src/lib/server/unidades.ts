import { dbAdmin } from "@/db";
import { unidadesNegocio } from "@/db/schema";

/**
 * Los IDs de unidades_negocio se generan con defaultRandom() en cada carga del
 * Excel, así que NO se pueden hardcodear (hacerlo dejaba a /repuestos sin datos
 * y a /equipos, /alquiler y /lubfiltros sin filtro de unidad, mostrando el total
 * nacional de todas las unidades). El nombre canónico sí es estable —
 * UNIDADES_CANONICAS en excel-parser.ts — así que resolvemos por nombre.
 */
export const UNIDAD = {
  repuestos: "Repuestos",
  lubfiltros: "Lubricantes/Filtros",
  servicios: "Servicios",
  equipos: "Equipos",
  alquiler: "Alquiler",
} as const;

export type UnidadKey = keyof typeof UNIDAD;

// ponytail: cache de proceso; solo cambia al recargar el Excel (que reinicia el server).
let cache: Map<string, string> | null = null;

async function unidadesPorNombre(): Promise<Map<string, string>> {
  if (cache) return cache;
  const rows = await dbAdmin
    .select({ id: unidadesNegocio.id, nombre: unidadesNegocio.nombre })
    .from(unidadesNegocio);
  cache = new Map(rows.map((r) => [r.nombre.trim().toLowerCase(), r.id]));
  return cache;
}

export async function unidadId(key: UnidadKey): Promise<string> {
  const id = (await unidadesPorNombre()).get(UNIDAD[key].toLowerCase());
  // Falla ruidosamente: un id inexistente antes producía consultas sin filtro
  // (totales de todas las unidades) o con cero filas, sin señal de error.
  if (!id) throw new Error(`unidad_negocio "${UNIDAD[key]}" no existe en la BD`);
  return id;
}

export async function unidadIds(...keys: UnidadKey[]): Promise<string[]> {
  const map = await unidadesPorNombre();
  return keys.map((k) => map.get(UNIDAD[k].toLowerCase())).filter((id): id is string => !!id);
}
