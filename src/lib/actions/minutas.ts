"use server";

import { eq, desc } from "drizzle-orm";
import { minutas } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export type MinutaEstado = "pendiente" | "en_proceso" | "cumplido";

export async function getMinutasAction() {
  return withAuth(async ({ tx }) => {
    return tx.select().from(minutas).orderBy(desc(minutas.fecha));
  });
}

export async function createMinutaAction(data: {
  fecha: string;
  cliente: string;
  descripcion: string;
  responsable: string;
  fechaLimite: string | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  estado: MinutaEstado;
  createdBy: string;
}) {
  return withAuth(async ({ tx }) => {
    const [row] = await tx
      .insert(minutas)
      .values({
        fecha: data.fecha,
        cliente: data.cliente,
        descripcion: data.descripcion,
        responsable: data.responsable,
        fechaLimite: data.fechaLimite,
        sucursalId: data.sucursalId,
        unidadNegocioId: data.unidadNegocioId,
        estado: data.estado,
        createdBy: data.createdBy,
        updatedBy: data.createdBy,
      })
      .returning();
    return row;
  });
}

export async function updateMinutaAction(
  id: string,
  data: {
    fecha: string;
    cliente: string;
    descripcion: string;
    responsable: string;
    fechaLimite: string | null;
    sucursalId: string | null;
    unidadNegocioId: string | null;
    estado: MinutaEstado;
    updatedBy: string;
  },
) {
  return withAuth(async ({ tx }) => {
    const [row] = await tx
      .update(minutas)
      .set({
        fecha: data.fecha,
        cliente: data.cliente,
        descripcion: data.descripcion,
        responsable: data.responsable,
        fechaLimite: data.fechaLimite,
        sucursalId: data.sucursalId,
        unidadNegocioId: data.unidadNegocioId,
        estado: data.estado,
        updatedBy: data.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(minutas.id, id))
      .returning();
    return row;
  });
}

/** Policy delete_minutas (migración 0002) restringe el DELETE a gerencia a
 * nivel de base de datos vía current_app_role() — el rol viene del GUC de
 * sesión seteado por withAuth, no del cliente. Con rol app_user, un intento
 * de borrado por otro rol afecta 0 filas (RLS lo bloquea silenciosamente). */
export async function deleteMinutaAction(id: string) {
  return withAuth(async ({ tx }) => {
    await tx.delete(minutas).where(eq(minutas.id, id));
  });
}
