import { createServerFn } from "@tanstack/react-start";
import { asc } from "drizzle-orm";
import { sucursales, unidadesNegocio } from "@/db/schema";
import { requireAuth } from "@/lib/server/auth";

export const getSucursalesFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return context.tx.select().from(sucursales).orderBy(asc(sucursales.nombre));
  });

export const getUnidadesFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    return context.tx.select().from(unidadesNegocio).orderBy(asc(unidadesNegocio.nombre));
  });
