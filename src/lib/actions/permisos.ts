"use server";

import { eq, and } from "drizzle-orm";
import { roleModuleAccess } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import type { AppRole } from "@/lib/actions/auth";
import { canCreateDeleteUsers, isFullAccessRole, type ModuleKey } from "@/lib/permissions";

export async function getRoleModuleAccessAction() {
  return withAuth(async ({ tx, role }) => {
    // Administrador/gerencia ven la matriz completa; resto solo su propio rol.
    if (isFullAccessRole(role)) {
      return tx.select().from(roleModuleAccess);
    }
    if (!role) return [];
    return tx.select().from(roleModuleAccess).where(eq(roleModuleAccess.role, role));
  });
}

export async function setRoleModuleAccessAction(data: {
  role: AppRole;
  module: ModuleKey;
  canView: boolean;
}) {
  return withAuth(async ({ tx, role }) => {
    if (!canCreateDeleteUsers(role)) {
      throw new Error("Unauthorized: Solo Administrador puede modificar permisos");
    }

    const [existing] = await tx
      .select({ role: roleModuleAccess.role })
      .from(roleModuleAccess)
      .where(and(eq(roleModuleAccess.role, data.role), eq(roleModuleAccess.module, data.module)));

    if (existing) {
      await tx
        .update(roleModuleAccess)
        .set({ canView: data.canView, updatedAt: new Date() })
        .where(and(eq(roleModuleAccess.role, data.role), eq(roleModuleAccess.module, data.module)));
    } else {
      await tx.insert(roleModuleAccess).values({
        role: data.role,
        module: data.module,
        canView: data.canView,
      });
    }

    return { success: true };
  });
}
