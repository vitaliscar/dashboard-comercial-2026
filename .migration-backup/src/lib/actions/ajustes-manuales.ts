"use server";

import { eq, desc } from "drizzle-orm";
import { ajustesManuales, sucursales, unidadesNegocio, profiles } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

function requireAdmin(isAdmin: boolean) {
  if (!isAdmin) {
    throw new Error("Solo el administrador de la aplicación puede administrar ajustes manuales");
  }
}

export async function getAjustesManualesAction(anio: number) {
  return withAuth(async ({ tx, profile }) => {
    requireAdmin(profile.isAdmin);

    const rows = await tx
      .select({
        id: ajustesManuales.id,
        anio: ajustesManuales.anio,
        mes: ajustesManuales.mes,
        monto: ajustesManuales.monto,
        motivo: ajustesManuales.motivo,
        createdAt: ajustesManuales.createdAt,
        sucursalNombre: sucursales.nombre,
        unidadNombre: unidadesNegocio.nombre,
        creadoPorNombre: profiles.nombreCompleto,
      })
      .from(ajustesManuales)
      .leftJoin(sucursales, eq(ajustesManuales.sucursalId, sucursales.id))
      .leftJoin(unidadesNegocio, eq(ajustesManuales.unidadNegocioId, unidadesNegocio.id))
      .leftJoin(profiles, eq(ajustesManuales.creadoPor, profiles.id))
      .where(eq(ajustesManuales.anio, anio))
      .orderBy(desc(ajustesManuales.createdAt));

    return rows.map((r) => ({
      id: r.id,
      anio: r.anio,
      mes: r.mes,
      monto: Number(r.monto),
      motivo: r.motivo,
      createdAt: r.createdAt.toISOString(),
      sucursal: r.sucursalNombre ?? "Todas",
      unidad: r.unidadNombre ?? "Todas",
      creadoPor: r.creadoPorNombre ?? "—",
    }));
  });
}

export async function createAjusteManualAction(data: {
  anio: number;
  mes: number;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  monto: number;
  motivo: string;
}) {
  return withAuth(async ({ tx, profile, userId }) => {
    requireAdmin(profile.isAdmin);

    if (!data.motivo.trim()) {
      throw new Error("El motivo es obligatorio");
    }
    if (data.mes < 1 || data.mes > 12) {
      throw new Error("Mes inválido");
    }

    await tx.insert(ajustesManuales).values({
      anio: data.anio,
      mes: data.mes,
      sucursalId: data.sucursalId,
      unidadNegocioId: data.unidadNegocioId,
      monto: String(data.monto),
      motivo: data.motivo.trim(),
      creadoPor: userId,
    });
  });
}

export async function deleteAjusteManualAction(id: string) {
  return withAuth(async ({ tx, profile }) => {
    requireAdmin(profile.isAdmin);
    await tx.delete(ajustesManuales).where(eq(ajustesManuales.id, id));
  });
}
