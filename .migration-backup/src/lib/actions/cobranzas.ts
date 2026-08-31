"use server";

import { and, asc, desc, eq, gt, inArray, type SQLWrapper } from "drizzle-orm";
import { cobranzas, cobranzasSnapshots, sucursales, unidadesNegocio } from "@/db/schema";
import { withAuth } from "@/lib/actions/with-auth";
import { compararSnapshots } from "@/lib/analytics/cobranzas";

function unidadCond(col: SQLWrapper, selectedUnidades?: string[]) {
  return selectedUnidades && selectedUnidades.length > 0
    ? inArray(col, selectedUnidades)
    : undefined;
}

function sucursalCond(col: SQLWrapper, selectedSucursales?: string[]) {
  return selectedSucursales && selectedSucursales.length > 0
    ? inArray(col, selectedSucursales)
    : undefined;
}

export async function getCobranzasAction(data?: {
  selectedUnidades?: string[];
  selectedSucursales?: string[];
}) {
  const selectedUnidades = data?.selectedUnidades;
  const selectedSucursales = data?.selectedSucursales;
  return withAuth(({ tx }) =>
    tx
      .select({
        id: cobranzas.id,
        cliente: cobranzas.cliente,
        facturaNumero: cobranzas.facturaNumero,
        fechaEmision: cobranzas.fechaEmision,
        fechaVencimiento: cobranzas.fechaVencimiento,
        monto: cobranzas.monto,
        saldo: cobranzas.saldo,
        diasVencidos: cobranzas.diasVencidos,
        sucursalId: cobranzas.sucursalId,
        unidadNegocioId: cobranzas.unidadNegocioId,
        createdAt: cobranzas.createdAt,
        sucursal: sucursales.nombre,
        unidadNegocio: unidadesNegocio.nombre,
      })
      .from(cobranzas)
      .leftJoin(sucursales, eq(cobranzas.sucursalId, sucursales.id))
      .leftJoin(unidadesNegocio, eq(cobranzas.unidadNegocioId, unidadesNegocio.id))
      .where(
        and(
          gt(cobranzas.saldo, "0"),
          unidadCond(cobranzas.unidadNegocioId, selectedUnidades),
          sucursalCond(cobranzas.sucursalId, selectedSucursales),
        ),
      )
      .orderBy(asc(cobranzas.fechaVencimiento)),
  );
}

export async function getCobranzasComparisonAction(data?: {
  selectedUnidades?: string[];
  selectedSucursales?: string[];
}) {
  const selectedUnidades = data?.selectedUnidades;
  const selectedSucursales = data?.selectedSucursales;
  return withAuth(async ({ tx }) => {
    const actualRows = await tx
      .select({
        cliente: cobranzas.cliente,
        facturaNumero: cobranzas.facturaNumero,
        saldo: cobranzas.saldo,
        sucursalId: cobranzas.sucursalId,
      })
      .from(cobranzas)
      .where(
        and(
          unidadCond(cobranzas.unidadNegocioId, selectedUnidades),
          sucursalCond(cobranzas.sucursalId, selectedSucursales),
        ),
      );

    const latestSnapshot = await tx
      .select({ capturedAt: cobranzasSnapshots.capturedAt })
      .from(cobranzasSnapshots)
      .orderBy(desc(cobranzasSnapshots.capturedAt))
      .limit(1);

    if (latestSnapshot.length === 0) {
      return compararSnapshots(
        actualRows.map((r) => ({
          cliente: r.cliente,
          facturaNumero: r.facturaNumero,
          saldo: r.saldo,
          sucursalId: r.sucursalId,
        })),
        null,
      );
    }

    const maxCapturedAt = latestSnapshot[0].capturedAt;
    const anteriorRows = await tx
      .select({
        cliente: cobranzasSnapshots.cliente,
        facturaNumero: cobranzasSnapshots.facturaNumero,
        saldo: cobranzasSnapshots.saldo,
        sucursalId: cobranzasSnapshots.sucursalId,
      })
      .from(cobranzasSnapshots)
      .where(
        and(
          eq(cobranzasSnapshots.capturedAt, maxCapturedAt),
          unidadCond(cobranzasSnapshots.unidadNegocioId, selectedUnidades),
          sucursalCond(cobranzasSnapshots.sucursalId, selectedSucursales),
        ),
      );

    return compararSnapshots(
      actualRows.map((r) => ({
        cliente: r.cliente,
        facturaNumero: r.facturaNumero,
        saldo: r.saldo,
        sucursalId: r.sucursalId,
      })),
      anteriorRows.map((r) => ({
        cliente: r.cliente,
        facturaNumero: r.facturaNumero,
        saldo: r.saldo,
        sucursalId: r.sucursalId,
      })),
    );
  });
}
