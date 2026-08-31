/** Short display label + fixed display order for a unidad_negocio DB name. */
export function unidadLabelInfo(nombreDb: string): { label: string; order: number } {
  const n = nombreDb.toLowerCase();
  if (n.includes("repuesto")) return { label: "Repuestos", order: 1 };
  if (n.includes("lubri") || n.includes("filtro")) return { label: "Lub / Filtros", order: 2 };
  if (n.includes("servicio")) return { label: "Servicios", order: 3 };
  if (n.includes("equipo")) return { label: "Equipos", order: 4 };
  if (n.includes("alquiler")) return { label: "Alquiler", order: 5 };
  return { label: nombreDb, order: 99 };
}
