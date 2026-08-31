"use server";

import { eq, desc, and, inArray, ilike } from "drizzle-orm";
import {
  minutas,
  minutaComentarios,
  minutaAlertas,
  alertas,
  profiles,
  userRoles,
  profileUnidadesNegocio,
  cotizaciones,
  facturas,
  ventasPerdidas,
  cobranzas,
} from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import type { AppRole } from "@/lib/actions/auth";

export type MinutaEstado = "pendiente" | "en_proceso" | "cumplido";

// Jerarquía de creación de minutas: quién puede redactarle una minuta a quién.
const DESTINATARIO_ROLE_PERMITIDO: Partial<Record<AppRole, AppRole>> = {
  coordinador: "asesor",
  gerente_comercial: "coordinador",
};

export async function getMinutasAction() {
  return withAuth(async ({ tx }) => {
    const rows = await tx
      .select({
        id: minutas.id,
        fecha: minutas.fecha,
        cliente: minutas.cliente,
        descripcion: minutas.descripcion,
        fechaLimite: minutas.fechaLimite,
        estado: minutas.estado,
        sucursalId: minutas.sucursalId,
        unidadNegocioId: minutas.unidadNegocioId,
        destinatarioId: minutas.destinatarioId,
        destinatarioNombre: profiles.nombreCompleto,
        createdBy: minutas.createdBy,
        createdAt: minutas.createdAt,
      })
      .from(minutas)
      .leftJoin(profiles, eq(profiles.id, minutas.destinatarioId))
      .orderBy(desc(minutas.fecha));

    if (rows.length === 0) return [];

    const minutaIds = rows.map((r) => r.id);
    const [comentarios, links] = await Promise.all([
      tx
        .select({
          id: minutaComentarios.id,
          minutaId: minutaComentarios.minutaId,
          autorId: minutaComentarios.autorId,
          texto: minutaComentarios.texto,
          createdAt: minutaComentarios.createdAt,
        })
        .from(minutaComentarios)
        .where(inArray(minutaComentarios.minutaId, minutaIds))
        .orderBy(minutaComentarios.createdAt),
      tx
        .select({
          minutaId: minutaAlertas.minutaId,
          alertaId: alertas.id,
          tipo: alertas.tipo,
          severidad: alertas.severidad,
          titulo: alertas.titulo,
          estado: alertas.estado,
        })
        .from(minutaAlertas)
        .innerJoin(alertas, eq(alertas.id, minutaAlertas.alertaId))
        .where(inArray(minutaAlertas.minutaId, minutaIds)),
    ]);

    return rows.map((m) => ({
      ...m,
      comentarios: comentarios.filter((c) => c.minutaId === m.id),
      alertas: links.filter((l) => l.minutaId === m.id),
    }));
  });
}

/** Destinatarios válidos para el rol actual, según la jerarquía de creación. */
export async function getDestinatariosDisponiblesAction() {
  return withAuth(async ({ tx, role, profile }) => {
    if (!role || role === "asesor") return [];

    if (role === "gerencia") {
      const rows = await tx
        .select({
          id: profiles.id,
          nombreCompleto: profiles.nombreCompleto,
          role: userRoles.role,
          sucursalId: profiles.sucursalId,
          unidadNegocioId: profiles.unidadNegocioId,
        })
        .from(profiles)
        .innerJoin(userRoles, eq(userRoles.userId, profiles.id))
        .where(inArray(userRoles.role, ["gerente_comercial", "coordinador", "asesor"]));
      return rows;
    }

    const targetRole = DESTINATARIO_ROLE_PERMITIDO[role];
    if (!targetRole) return [];

    if (role === "coordinador") {
      if (!profile.sucursalId) return [];
      const rows = await tx
        .select({
          id: profiles.id,
          nombreCompleto: profiles.nombreCompleto,
          role: userRoles.role,
          sucursalId: profiles.sucursalId,
          unidadNegocioId: profiles.unidadNegocioId,
        })
        .from(profiles)
        .innerJoin(userRoles, eq(userRoles.userId, profiles.id))
        .where(and(eq(userRoles.role, "asesor"), eq(profiles.sucursalId, profile.sucursalId)));
      return rows;
    }

    // gerente_comercial → coordinadores de sus unidades asignadas.
    const unidadesRows = await tx
      .select({ unidadNegocioId: profileUnidadesNegocio.unidadNegocioId })
      .from(profileUnidadesNegocio)
      .where(eq(profileUnidadesNegocio.profileId, profile.id));
    const unidadIds = unidadesRows.map((u) => u.unidadNegocioId);
    if (unidadIds.length === 0) return [];

    const rows = await tx
      .select({
        id: profiles.id,
        nombreCompleto: profiles.nombreCompleto,
        role: userRoles.role,
        sucursalId: profiles.sucursalId,
        unidadNegocioId: profiles.unidadNegocioId,
      })
      .from(profiles)
      .innerJoin(userRoles, eq(userRoles.userId, profiles.id))
      .where(and(eq(userRoles.role, "coordinador"), inArray(profiles.unidadNegocioId, unidadIds)));
    return rows;
  });
}

/** Autocompletado de clientes — unión de nombres distintos de las fuentes transaccionales. */
export async function searchClientesAction(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  return withAuth(async ({ tx }) => {
    const like = `%${term}%`;
    const [a, b, c, d] = await Promise.all([
      tx
        .selectDistinct({ cliente: facturas.cliente })
        .from(facturas)
        .where(ilike(facturas.cliente, like))
        .limit(15),
      tx
        .selectDistinct({ cliente: cotizaciones.cliente })
        .from(cotizaciones)
        .where(ilike(cotizaciones.cliente, like))
        .limit(15),
      tx
        .selectDistinct({ cliente: ventasPerdidas.cliente })
        .from(ventasPerdidas)
        .where(ilike(ventasPerdidas.cliente, like))
        .limit(15),
      tx
        .selectDistinct({ cliente: cobranzas.cliente })
        .from(cobranzas)
        .where(ilike(cobranzas.cliente, like))
        .limit(15),
    ]);
    const set = new Set<string>();
    for (const rows of [a, b, c, d]) {
      for (const r of rows) if (r.cliente) set.add(r.cliente);
    }
    return Array.from(set).slice(0, 15);
  });
}

export async function createMinutaAction(data: {
  fecha: string;
  destinatarioId: string;
  cliente: string | null;
  descripcion: string;
  fechaLimite: string | null;
  sucursalId: string | null;
  unidadNegocioId: string | null;
  estado: MinutaEstado;
  alertaIds: string[];
}) {
  return withAuth(async ({ tx, userId, role, profile }) => {
    // CN-030: autoría siempre desde la sesión; destinatario revalidado en servidor.
    if (!role || role === "asesor") {
      throw new Error("No autorizado para crear minutas");
    }

    if (role !== "gerencia") {
      const targetRole = DESTINATARIO_ROLE_PERMITIDO[role];
      if (!targetRole) throw new Error("No autorizado para crear minutas");

      const [dest] = await tx
        .select({
          id: profiles.id,
          role: userRoles.role,
          sucursalId: profiles.sucursalId,
          unidadNegocioId: profiles.unidadNegocioId,
        })
        .from(profiles)
        .innerJoin(userRoles, eq(userRoles.userId, profiles.id))
        .where(and(eq(profiles.id, data.destinatarioId), eq(userRoles.role, targetRole)))
        .limit(1);

      if (!dest) throw new Error("Destinatario no válido para tu rol");

      if (role === "coordinador") {
        if (!profile.sucursalId || dest.sucursalId !== profile.sucursalId) {
          throw new Error("Destinatario fuera de tu sucursal");
        }
      }

      if (role === "gerente_comercial") {
        const unidadesRows = await tx
          .select({ unidadNegocioId: profileUnidadesNegocio.unidadNegocioId })
          .from(profileUnidadesNegocio)
          .where(eq(profileUnidadesNegocio.profileId, profile.id));
        const unidadIds = new Set(unidadesRows.map((u) => u.unidadNegocioId));
        if (!dest.unidadNegocioId || !unidadIds.has(dest.unidadNegocioId)) {
          throw new Error("Destinatario fuera de tus unidades");
        }
      }
    }

    const [row] = await tx
      .insert(minutas)
      .values({
        fecha: data.fecha,
        destinatarioId: data.destinatarioId,
        cliente: data.cliente,
        descripcion: data.descripcion,
        fechaLimite: data.fechaLimite,
        sucursalId: data.sucursalId,
        unidadNegocioId: data.unidadNegocioId,
        estado: data.estado,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    if (data.alertaIds.length > 0) {
      await tx
        .insert(minutaAlertas)
        .values(data.alertaIds.map((alertaId) => ({ minutaId: row.id, alertaId })));
    }
    return row;
  });
}

export async function updateMinutaAction(
  id: string,
  data: {
    descripcion: string;
    fechaLimite: string | null;
    estado: MinutaEstado;
  },
) {
  return withAuth(async ({ tx, userId }) => {
    const [existing] = await tx
      .select({ destinatarioId: minutas.destinatarioId })
      .from(minutas)
      .where(eq(minutas.id, id));
    if (existing && existing.destinatarioId === userId) {
      throw new Error("El destinatario de una minuta no puede cambiar su estado");
    }

    const [row] = await tx
      .update(minutas)
      .set({
        descripcion: data.descripcion,
        fechaLimite: data.fechaLimite,
        estado: data.estado,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(minutas.id, id))
      .returning();
    return row;
  });
}

/** Policy delete_minutas restringe el DELETE a gerencia a nivel de base de
 * datos vía current_app_role(). Con rol app_user, otro rol borra 0 filas. */
export async function deleteMinutaAction(id: string) {
  return withAuth(async ({ tx }) => {
    await tx.delete(minutas).where(eq(minutas.id, id));
  });
}

/** Solo el destinatario puede comentar (RLS insert_minuta_comentarios). */
export async function addComentarioAction(minutaId: string, texto: string) {
  return withAuth(async ({ tx, userId }) => {
    const [row] = await tx
      .insert(minutaComentarios)
      .values({ minutaId, autorId: userId, texto })
      .returning();
    return row;
  });
}

/** Cierre manual — restringido a coordinador+ en la capa de aplicación (RLS
 * de `alertas` solo scopea, no filtra por rol). */
export async function resolveAlertaAction(alertaId: string) {
  return withAuth(async ({ tx, userId, role }) => {
    if (role === "asesor") throw new Error("No autorizado para resolver alertas");
    const [row] = await tx
      .update(alertas)
      .set({
        estado: "resuelta",
        resueltaManualmente: true,
        resueltaPor: userId,
        resueltaEn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(alertas.id, alertaId))
      .returning();
    return row;
  });
}
