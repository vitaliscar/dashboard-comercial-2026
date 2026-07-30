"use server";

import { eq, and, asc } from "drizzle-orm";
import { users, profiles, userRoles, profileUnidadesNegocio, type appRole } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { hashPassword } from "@/lib/auth/password";

export type AppRole = (typeof appRole.enumValues)[number];

export async function getUsuariosDataAction() {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede acceder");
    }

    const [allProfiles, allRoles, allProfileUnidades, allUsers] = await Promise.all([
      tx.select().from(profiles).orderBy(asc(profiles.nombreCompleto)),
      tx.select().from(userRoles),
      tx.select().from(profileUnidadesNegocio),
      tx.select({ id: users.id, email: users.email, isActive: users.isActive }).from(users),
    ]);

    return {
      profiles: allProfiles,
      roles: allRoles,
      profileUnidades: allProfileUnidades,
      users: allUsers,
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

export async function createUserAction(data: {
  email: string;
  password: string;
  nombreCompleto: string;
  role: AppRole;
  sucursalId: string | null;
  unidadNegocioId: string | null;
}) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede crear usuarios");
    }

    const cleanEmail = data.email.trim().toLowerCase();
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, cleanEmail));
    if (existing) {
      throw new Error("Ya existe un usuario con ese correo");
    }

    const passwordHash = await hashPassword(data.password);
    const [created] = await tx
      .insert(users)
      .values({ email: cleanEmail, passwordHash, isActive: true })
      .returning({ id: users.id });

    await tx.insert(profiles).values({
      id: created.id,
      email: cleanEmail,
      nombreCompleto: data.nombreCompleto.trim() || null,
      sucursalId: data.sucursalId,
      unidadNegocioId: data.unidadNegocioId,
    });

    await tx.insert(userRoles).values({ userId: created.id, role: data.role });

    return { success: true, userId: created.id };
  });
}

export async function resetPasswordAction(data: { userId: string; newPassword: string }) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede restablecer contraseñas");
    }

    const passwordHash = await hashPassword(data.newPassword);
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, data.userId));

    return { success: true };
  });
}

export async function setUserActiveAction(data: { userId: string; isActive: boolean }) {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede activar/desactivar usuarios");
    }

    await tx
      .update(users)
      .set({ isActive: data.isActive, updatedAt: new Date() })
      .where(eq(users.id, data.userId));

    return { success: true };
  });
}

export async function deleteUserAction(data: { userId: string }) {
  return withAuth(async ({ tx, role, userId: currentUserId }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede eliminar usuarios");
    }
    if (data.userId === currentUserId) {
      throw new Error("No puedes eliminar tu propio usuario");
    }

    await tx.delete(users).where(eq(users.id, data.userId));

    return { success: true };
  });
}
