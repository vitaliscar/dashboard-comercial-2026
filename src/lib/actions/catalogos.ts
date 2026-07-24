"use server";

import { asc } from "drizzle-orm";
import { sucursales, unidadesNegocio } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export async function getSucursalesAction() {
  return withAuth(({ tx }) => tx.select().from(sucursales).orderBy(asc(sucursales.nombre)));
}

export async function getUnidadesAction() {
  return withAuth(({ tx }) =>
    tx.select().from(unidadesNegocio).orderBy(asc(unidadesNegocio.nombre)),
  );
}
