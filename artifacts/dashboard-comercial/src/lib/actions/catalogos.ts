"use server";

import { asc, eq } from "drizzle-orm";
import { sucursales, unidadesNegocio } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

/**
 * Catálogo de sucursales para TODO el sistema (FilterHeader de resumen,
 * repuestos, servicios, cobranzas, gerencia-nacional, etc.).
 *
 * `visible_general = false` existe para San Cristóbal, que solo aparece en las
 * hojas de Mercadeo: filtrar aquí la oculta de todos los selectores del sistema
 * de una sola vez, sin tocar página por página. Para Mercadeo usar
 * getSucursalesMercadeoAction().
 */
export async function getSucursalesAction() {
  return withAuth(({ tx }) =>
    tx
      .select()
      .from(sucursales)
      .where(eq(sucursales.visibleGeneral, true))
      .orderBy(asc(sucursales.nombre)),
  );
}

/** Catálogo completo, incluida San Cristóbal — solo para el módulo Mercadeo. */
export async function getSucursalesMercadeoAction() {
  return withAuth(({ tx }) => tx.select().from(sucursales).orderBy(asc(sucursales.nombre)));
}

export async function getUnidadesAction() {
  return withAuth(({ tx }) =>
    tx.select().from(unidadesNegocio).orderBy(asc(unidadesNegocio.nombre)),
  );
}
