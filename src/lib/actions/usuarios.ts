"use server";

import { eq, and, asc } from "drizzle-orm";
import { profiles, userRoles, profileUnidadesNegocio, type appRole } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";

export type AppRole = (typeof appRole.enumValues)[number];

export async function getUsuariosDataAction() {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede acceder");
    }

    const [allProfiles, allRoles, allProfileUnidades] = await Promise.all([
      tx.select().from(profiles).orderBy(asc(profiles.nombreCompleto)),
      tx.select().from(userRoles),
      tx.select().from(profileUnidadesNegocio),
    ]);

    return {
      profiles: allProfiles,
      roles: allRoles,
      profileUnidades: allProfileUnidades,
    };
  });
}

export async function setUserRoleAction(data: { userId: string; newRole: AppRole }) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar roles");
    }

    await tx.delete(userRoles).where(eq(userRoles.userId, data.userId));
    await tx.insert(userRoles).values({
      userId: data.userId,
      role: data.newRole,
    });

    return { success: true };
  });
}

export async function setProfileSucursalAction(data: {
  userId: string;
  sucursalId: string | null;
}) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar sucursales");
    }

    await tx
      .update(profiles)
      .set({ sucursalId: data.sucursalId, updatedAt: new Date() })
      .where(eq(profiles.id, data.userId));

    return { success: true };
  });
}

export async function setProfileUnidadAction(data: {
  userId: string;
  unidadNegocioId: string | null;
}) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar unidades");
    }

    await tx
      .update(profiles)
      .set({ unidadNegocioId: data.unidadNegocioId, updatedAt: new Date() })
      .where(eq(profiles.id, data.userId));

    return { success: true };
  });
}

export async function setProfileAdminAction(data: { userId: string; isAdmin: boolean }) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar permisos de admin");
    }

    await tx
      .update(profiles)
      .set({ isAdmin: data.isAdmin, updatedAt: new Date() })
      .where(eq(profiles.id, data.userId));

    return { success: true };
  });
}

export async function toggleProfileUnidadAction(data: {
  profileId: string;
  unidadId: string;
  checked: boolean;
}) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar unidades asignadas");
    }

    if (data.checked) {
      await tx
        .insert(profileUnidadesNegocio)
        .values({
          profileId: data.profileId,
          unidadNegocioId: data.unidadId,
        })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(profileUnidadesNegocio)
        .where(
          and(
            eq(profileUnidadesNegocio.profileId, data.profileId),
            eq(profileUnidadesNegocio.unidadNegocioId, data.unidadId),
          ),
        );
    }

    return { success: true };
  });
}
