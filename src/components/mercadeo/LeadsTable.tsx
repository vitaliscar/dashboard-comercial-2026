"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import type { LeadDetalle } from "@/lib/actions/mercadeo";

/**
 * Detalle de clientes potenciales con datos de contacto. Solo se monta en
 * /mercadeo, que es exclusivo de gerencia; el action ya devuelve [] para
 * cualquier otro rol.
 */
export function LeadsTable({ rows }: { rows: LeadDetalle[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q === "") return rows;
    return rows.filter((r) =>
      [r.razonSocial, r.nombreContacto, r.correo, r.telefono, r.sucursal, r.tipoNegocio]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, busqueda]);

  return (
    <Card className="ring-0 card-elevated">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-display font-semibold">Detalle de leads</CardTitle>
          <p className="text-xs text-muted-foreground">
            {filtradas.length} de {rows.length} clientes potenciales
          </p>
        </div>
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente, contacto, correo…"
          className="w-[280px]"
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-2 pr-3">Cliente</th>
              <th className="py-2 pr-3">Contacto</th>
              <th className="py-2 pr-3">Correo</th>
              <th className="py-2 pr-3">Teléfono</th>
              <th className="py-2 pr-3">Sucursal</th>
              <th className="py-2 pr-3">Unidad</th>
              <th className="py-2 pr-3">Estatus</th>
              <th className="py-2 pr-3">Etapa</th>
              <th className="py-2 pr-3">Origen</th>
              <th className="py-2 pr-3 text-right">Esperado</th>
              <th className="py-2 text-right">Facturado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="py-1.5 pr-3">{r.razonSocial ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.nombreContacto ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.correo ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.telefono ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.sucursal ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.tipoNegocio ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.estatusBis ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.etapaOportunidad ?? "—"}</td>
                <td className="py-1.5 pr-3">{r.tomaContacto ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right">{money(r.ingresosEsperados)}</td>
                <td className="py-1.5 text-right">{money(r.montoFacturadoBase)}</td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-muted-foreground">
                  Sin clientes potenciales para el filtro seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
