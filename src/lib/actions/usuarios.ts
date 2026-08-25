"use server";

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import {
  users,
  sessions,
  profiles,
  userRoles,
  profileUnidadesNegocio,
  profileSucursales,
  type appRole,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { hashPassword } from "@/lib/auth/password";
import { validatePasswordStrength } from "@/lib/auth/password-policy";

export type AppRole = (typeof appRole.enumValues)[number];

const appRoleSchema = z.enum(
  ["gerencia", "gerente_comercial", "coordinador", "asesor"] as [AppRole, ...AppRole[]],
);
const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();

const setUserRoleSchema = z.object({
  userId: uuidSchema,
  newRole: appRoleSchema,
});

const setProfileSucursalSchema = z.object({
  userId: uuidSchema,
  sucursalId: nullableUuidSchema,
});

const setProfileUnidadSchema = z.object({
  userId: uuidSchema,
  unidadNegocioId: nullableUuidSchema,
});

const setProfileAdminSchema = z.object({
  userId: uuidSchema,
  isAdmin: z.boolean(),
});

const toggleProfileUnidadSchema = z.object({
  profileId: uuidSchema,
  unidadId: uuidSchema,
  checked: z.boolean(),
});

const toggleProfileSucursalSchema = z.object({
  profileId: uuidSchema,
  sucursalId: uuidSchema,
  checked: z.boolean(),
});

const createUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  nombreCompleto: z.string().trim().min(1),
  role: appRoleSchema,
  sucursalId: nullableUuidSchema,
  unidadNegocioId: nullableUuidSchema,
});

const resetPasswordSchema = z.object({
  userId: uuidSchema,
  newPassword: z.string().min(1),
});

const setUserActiveSchema = z.object({
  userId: uuidSchema,
  isActive: z.boolean(),
});

const deleteUserSchema = z.object({
  userId: uuidSchema,
});

export async function getUsuariosDataAction() {
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede acceder");
    }

    const [allProfiles, allRoles, allProfileUnidades, allProfileSucursales, allUsers] =
      await Promise.all([
        tx.select().from(profiles).orderBy(asc(profiles.nombreCompleto)),
        tx.select().from(userRoles),
        tx.select().from(profileUnidadesNegocio),
        tx.select().from(profileSucursales),
        tx.select({ id: users.id, email: users.email, isActive: users.isActive }).from(users),
      ]);

    return {
      profiles: allProfiles,
      roles: allRoles,
      profileUnidades: allProfileUnidades,
      profileSucursales: allProfileSucursales,
      users: allUsers,
    };
  });
}

export async function setUserRoleAction(data: { userId: string; newRole: AppRole }) {
  const parsed = setUserRoleSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar roles");
    }

    await tx.delete(userRoles).where(eq(userRoles.userId, parsed.userId));
    await tx.insert(userRoles).values({
      userId: parsed.userId,
      role: parsed.newRole,
    });

    return { success: true };
  });
}

export async function setProfileSucursalAction(data: {
  userId: string;
  sucursalId: string | null;
}) {
  const parsed = setProfileSucursalSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar sucursales");
    }

    await tx
      .update(profiles)
      .set({ sucursalId: parsed.sucursalId, updatedAt: new Date() })
      .where(eq(profiles.id, parsed.userId));

    return { success: true };
  });
}

export async function setProfileUnidadAction(data: {
  userId: string;
  unidadNegocioId: string | null;
}) {
  const parsed = setProfileUnidadSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar unidades");
    }

    await tx
      .update(profiles)
      .set({ unidadNegocioId: parsed.unidadNegocioId, updatedAt: new Date() })
      .where(eq(profiles.id, parsed.userId));

    return { success: true };
  });
}

export async function setProfileAdminAction(data: { userId: string; isAdmin: boolean }) {
  const parsed = setProfileAdminSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar permisos de admin");
    }

    await tx
      .update(profiles)
      .set({ isAdmin: parsed.isAdmin, updatedAt: new Date() })
      .where(eq(profiles.id, parsed.userId));

    return { success: true };
  });
}

export async function toggleProfileUnidadAction(data: {
  profileId: string;
  unidadId: string;
  checked: boolean;
}) {
  const parsed = toggleProfileUnidadSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar unidades asignadas");
    }

    if (parsed.checked) {
      await tx
        .insert(profileUnidadesNegocio)
        .values({
          profileId: parsed.profileId,
          unidadNegocioId: parsed.unidadId,
        })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(profileUnidadesNegocio)
        .where(
          and(
            eq(profileUnidadesNegocio.profileId, parsed.profileId),
            eq(profileUnidadesNegocio.unidadNegocioId, parsed.unidadId),
          ),
        );
    }

    return { success: true };
  });
}

export async function toggleProfileSucursalAction(data: {
  profileId: string;
  sucursalId: string;
  checked: boolean;
}) {
  const parsed = toggleProfileSucursalSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede modificar sucursales asignadas");
    }

    if (parsed.checked) {
      await tx
        .insert(profileSucursales)
        .values({ profileId: parsed.profileId, sucursalId: parsed.sucursalId })
        .onConflictDoNothing();
    } else {
      await tx
        .delete(profileSucursales)
        .where(
          and(
            eq(profileSucursales.profileId, parsed.profileId),
            eq(profileSucursales.sucursalId, parsed.sucursalId),
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
  const parsed = createUserSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede crear usuarios");
    }

    const cleanEmail = parsed.email.toLowerCase();
    const strengthError = validatePasswordStrength(parsed.password);
    if (strengthError) throw new Error(strengthError);

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, cleanEmail));
    if (existing) {
      throw new Error("Ya existe un usuario con ese correo");
    }

    const passwordHash = await hashPassword(parsed.password);
    const [created] = await tx
      .insert(users)
      .values({ email: cleanEmail, passwordHash, isActive: true })
      .returning({ id: users.id });

    await tx.insert(profiles).values({
      id: created.id,
      email: cleanEmail,
      nombreCompleto: parsed.nombreCompleto,
      sucursalId: parsed.sucursalId,
      unidadNegocioId: parsed.unidadNegocioId,
    });

    await tx.insert(userRoles).values({ userId: created.id, role: parsed.role });

    if (parsed.sucursalId) {
      await tx
        .insert(profileSucursales)
        .values({ profileId: created.id, sucursalId: parsed.sucursalId })
        .onConflictDoNothing();
    }

    return { success: true, userId: created.id };
  });
}

export async function resetPasswordAction(data: { userId: string; newPassword: string }) {
  const parsed = resetPasswordSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede restablecer contraseñas");
    }

    const strengthError = validatePasswordStrength(parsed.newPassword);
    if (strengthError) throw new Error(strengthError);

    const passwordHash = await hashPassword(parsed.newPassword);
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, parsed.userId));

    // CN-027: invalidar todas las sesiones tras reset de password.
    await tx.delete(sessions).where(eq(sessions.userId, parsed.userId));

    return { success: true };
  });
}

export async function setUserActiveAction(data: { userId: string; isActive: boolean }) {
  const parsed = setUserActiveSchema.parse(data);
  return withAuth(async ({ tx, role }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede activar/desactivar usuarios");
    }

    await tx
      .update(users)
      .set({ isActive: parsed.isActive, updatedAt: new Date() })
      .where(eq(users.id, parsed.userId));

    // CN-026: al desactivar, borrar sesiones activas del usuario.
    if (!parsed.isActive) {
      await tx.delete(sessions).where(eq(sessions.userId, parsed.userId));
    }

    return { success: true };
  });
}

export async function deleteUserAction(data: { userId: string }) {
  const parsed = deleteUserSchema.parse(data);
  return withAuth(async ({ tx, role, userId: currentUserId }) => {
    if (role !== "gerencia") {
      throw new Error("Unauthorized: Solo Gerencia Nacional puede eliminar usuarios");
    }
    if (parsed.userId === currentUserId) {
      throw new Error("No puedes eliminar tu propio usuario");
    }

    await tx.delete(users).where(eq(users.id, parsed.userId));

    return { success: true };
  });
}
