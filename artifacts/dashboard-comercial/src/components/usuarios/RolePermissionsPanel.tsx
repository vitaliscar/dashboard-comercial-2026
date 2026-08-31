"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getRoleModuleAccessAction, setRoleModuleAccessAction } from "@/lib/actions/permisos";
import { setModuleAccessOverride, type ModuleKey } from "@/lib/permissions";
import { roleLabel } from "@/lib/format";
import { Checkbox } from "@/components/ui/checkbox";
import type { AppRole } from "@/hooks/use-auth";

const ROLES: AppRole[] = ["gerencia", "gerente_comercial", "coordinador", "asesor"];

const MODULE_LABELS: Record<ModuleKey, string> = {
  resumen: "Resumen",
  dashboard: "Dashboard (router)",
  minutas: "Minutas",
  cobranzas: "Cobranzas",
  pareto: "Pareto",
  asesores: "Asesores",
  alertas: "Alertas",
  embudo: "Embudo",
  mercadeo: "Mercadeo",
  carga: "Cargar Excel",
  usuarios: "Usuarios",
  gerencia_nacional: "Gerencia Nacional",
  coordinador: "Vista Coordinador",
  asesor: "Vista Asesor",
  servicios: "Servicios",
  lubfiltros: "Lub / Filtros",
  equipos: "Equipos",
  alquiler: "Alquiler",
  sucursal: "Vista Sucursal",
  repuestos: "Repuestos",
  cliente_360: "Cliente 360",
  comisiones: "Comisiones",
  simulador: "Simulador",
  evaluacion_asesor: "Evaluación de Desempeño (Asesor)",
  evaluacion_sucursal: "Evaluación de Desempeño (Sucursal)",
  evaluacion_unidad: "Evaluación de Desempeño (Unidad)",
  ajustes_manuales: "Ajustes Manuales",
};

const MODULE_ORDER = Object.keys(MODULE_LABELS) as ModuleKey[];

export function RolePermissionsPanel() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["role-module-access"],
    queryFn: () => getRoleModuleAccessAction(),
  });

  const toggle = useMutation({
    mutationFn: async ({
      role,
      module,
      canView,
    }: {
      role: AppRole;
      module: ModuleKey;
      canView: boolean;
    }) => {
      await setRoleModuleAccessAction({ role, module, canView });
    },
    onSuccess: async () => {
      const fresh = await getRoleModuleAccessAction();
      setModuleAccessOverride(fresh);
      qc.setQueryData(["role-module-access"], fresh);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isChecked = (role: AppRole, module: ModuleKey) =>
    data?.some((r) => r.role === role && r.module === module && r.canView) ?? false;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Cargando permisos…</p>;
  }

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-display font-semibold">Visibilidad de módulos por rol</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Qué vistas puede abrir cada rol. El alcance de datos (sucursal/unidad/asesor) no se
          configura acá — lo sigue resolviendo la base de datos.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left px-4 py-2 font-semibold text-xs tracking-wide">Módulo</th>
              {ROLES.map((r) => (
                <th key={r} className="px-4 py-2 font-semibold text-xs tracking-wide text-center">
                  {roleLabel(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULE_ORDER.map((m) => (
              <tr key={m} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{MODULE_LABELS[m]}</td>
                {ROLES.map((r) =>
                  r === "gerencia" ? (
                    <td
                      key={r}
                      className="px-4 py-2 text-center text-xs text-muted-foreground"
                      title="Gerencia siempre tiene acceso total"
                    >
                      Siempre
                    </td>
                  ) : (
                    <td key={r} className="px-4 py-2 text-center">
                      <Checkbox
                        checked={isChecked(r, m)}
                        onCheckedChange={(c) =>
                          toggle.mutate({ role: r, module: m, canView: !!c })
                        }
                      />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
