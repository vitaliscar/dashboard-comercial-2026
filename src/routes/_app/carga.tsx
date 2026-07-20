import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSucursales, useUnidades } from "@/hooks/use-catalogos";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/carga")({
  head: () => ({ meta: [{ title: "Carga de datos · CCV" }] }),
  component: Carga,
});

type SheetKind = "cotizaciones" | "facturas" | "ventas_perdidas" | "presupuestos" | "cobranzas";

const SHEETS: Array<{ key: SheetKind; label: string; hint: string; cols: string[] }> = [
  {
    key: "cotizaciones",
    label: "Cotizaciones",
    hint: "fecha, cliente, monto, asesor, etapa, sucursal, unidad",
    cols: ["fecha", "cliente", "monto", "asesor", "etapa", "sucursal", "unidad", "descripcion"],
  },
  {
    key: "facturas",
    label: "Facturas",
    hint: "fecha, cliente, monto, numero, asesor, sucursal, unidad",
    cols: ["fecha", "cliente", "monto", "numero", "asesor", "sucursal", "unidad"],
  },
  {
    key: "ventas_perdidas",
    label: "Ventas Perdidas",
    hint: "fecha, cliente, monto, razon, asesor, sucursal, unidad",
    cols: ["fecha", "cliente", "monto", "razon", "asesor", "sucursal", "unidad"],
  },
  {
    key: "presupuestos",
    label: "Presupuestos",
    hint: "anio, mes, monto, sucursal, unidad",
    cols: ["anio", "mes", "monto", "sucursal", "unidad"],
  },
  {
    key: "cobranzas",
    label: "Cobranzas",
    hint: "cliente, monto, saldo, fecha_emision, fecha_vencimiento, factura_numero, sucursal, unidad",
    cols: [
      "cliente",
      "monto",
      "saldo",
      "fecha_emision",
      "fecha_vencimiento",
      "factura_numero",
      "sucursal",
      "unidad",
    ],
  },
];

function excelDate(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function num(v: unknown) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const kk = Object.keys(row).find((x) => x.toLowerCase().trim() === k.toLowerCase());
    if (kk && row[kk] !== undefined && row[kk] !== "") return row[kk];
  }
  return undefined;
}

function Carga() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { data: sucursales } = useSucursales();
  const { data: unidades } = useUnidades();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Array<{ kind: SheetKind; count: number; errors: number }>>([]);

  if (role !== "gerencia") {
    return (
      <div className="card-elevated p-8 max-w-xl text-center flex flex-col gap-2">
        <Shield className="size-10 mx-auto text-muted-foreground" />
        <h2 className="font-display text-xl font-semibold">Acceso restringido</h2>
        <p className="text-sm text-muted-foreground">
          Sólo el perfil Gerencia Nacional puede cargar datos desde Excel.
        </p>
      </div>
    );
  }

  const findSucursal = (name: unknown) => {
    if (!name) return null;
    const s = String(name).toLowerCase().trim();
    return sucursales?.find((x) => x.nombre.toLowerCase() === s)?.id ?? null;
  };
  const findUnidad = (name: unknown) => {
    if (!name) return null;
    const s = String(name).toLowerCase().trim();
    return unidades?.find((x) => x.nombre.toLowerCase() === s)?.id ?? null;
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setLog([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const results: typeof log = [];
      for (const s of SHEETS) {
        const sheetName = wb.SheetNames.find(
          (n) => n.toLowerCase().replace(/[_\s]/g, "") === s.key.replace(/[_\s]/g, ""),
        );
        if (!sheetName) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
          defval: "",
        });
        let errors = 0;
        const payload: Record<string, unknown>[] = [];
        for (const r of rows) {
          try {
            if (s.key === "presupuestos") {
              payload.push({
                anio: Number(pick(r, ["anio", "año", "year"])) || new Date().getFullYear(),
                mes: Number(pick(r, ["mes", "month"])) || 1,
                monto: num(pick(r, ["monto", "presupuesto", "amount"])),
                sucursal_id: findSucursal(pick(r, ["sucursal", "branch"])),
                unidad_negocio_id: findUnidad(pick(r, ["unidad", "unidad_negocio", "unit"])),
              });
            } else if (s.key === "cobranzas") {
              payload.push({
                cliente: String(pick(r, ["cliente", "customer"]) ?? ""),
                monto: num(pick(r, ["monto", "total", "amount"])),
                saldo: num(pick(r, ["saldo", "balance"])),
                fecha_emision:
                  excelDate(pick(r, ["fecha_emision", "emision", "fecha"])) ??
                  new Date().toISOString().slice(0, 10),
                fecha_vencimiento:
                  excelDate(pick(r, ["fecha_vencimiento", "vencimiento", "due_date"])) ??
                  new Date().toISOString().slice(0, 10),
                factura_numero:
                  String(pick(r, ["factura_numero", "numero", "factura"]) ?? "") || null,
                sucursal_id: findSucursal(pick(r, ["sucursal"])),
                unidad_negocio_id: findUnidad(pick(r, ["unidad", "unidad_negocio"])),
              });
            } else {
              const base: Record<string, unknown> = {
                cliente: String(pick(r, ["cliente", "customer"]) ?? ""),
                monto: num(pick(r, ["monto", "amount", "total"])),
                fecha:
                  excelDate(pick(r, ["fecha", "date"])) ?? new Date().toISOString().slice(0, 10),
                asesor: (pick(r, ["asesor", "vendedor", "seller"]) as string) || null,
                sucursal_id: findSucursal(pick(r, ["sucursal"])),
                unidad_negocio_id: findUnidad(pick(r, ["unidad", "unidad_negocio"])),
              };
              if (s.key === "cotizaciones")
                base.etapa = ((pick(r, ["etapa", "stage"]) as string) || "enviada")
                  .toString()
                  .toLowerCase();
              if (s.key === "facturas")
                base.numero = (pick(r, ["numero", "factura"]) as string) || null;
              if (s.key === "ventas_perdidas")
                base.razon = String(pick(r, ["razon", "reason"]) ?? "No especificada");
              payload.push(base);
            }
          } catch {
            errors++;
          }
        }
        if (payload.length) {
          const chunk = 500;
          for (let i = 0; i < payload.length; i += chunk) {
            const { error } = await supabase
              .from(s.key)
              .insert(payload.slice(i, i + chunk) as never);
            if (error) {
              errors += chunk;
              toast.error(`${s.label}: ${error.message}`);
            }
          }
        }
        results.push({ kind: s.key, count: payload.length - errors, errors });
      }
      setLog(results);
      const total = results.reduce((a, b) => a + b.count, 0);
      toast.success(`Carga completada: ${total} registros importados`);

      // Refresca las materialized views (mv_resumen_mensual/mv_cotizado_mensual/
      // mv_perdidas_mensual) y limpia el caché de React Query — con el staleTime
      // largo del QueryClient (P1), sin esto los dashboards seguirían mostrando
      // datos viejos hasta 30 min después de una carga manual.
      const { error: refreshError } = await supabase.rpc("refresh_todas_mv");
      if (refreshError) {
        toast.error(`No se pudieron refrescar las vistas agregadas: ${refreshError.message}`);
      }
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="size-7" /> Carga de datos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importa un archivo Excel (.xlsx) con múltiples hojas para poblar el dashboard
        </p>
      </div>

      <Alert>
        <Info />
        <AlertDescription>
          <p>El archivo debe contener hojas con los siguientes nombres y columnas:</p>
          <ul className="flex flex-col gap-1 text-xs">
            {SHEETS.map((s) => (
              <li key={s.key}>
                <span className="font-medium text-foreground">{s.label}</span> —{" "}
                <span className="font-mono">{s.hint}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs">
            Los nombres de <span className="font-mono">sucursal</span> y{" "}
            <span className="font-mono">unidad</span> se emparejan con los registros existentes por
            texto.
          </p>
        </AlertDescription>
      </Alert>

      <label
        className={`card-elevated flex flex-col items-center justify-center gap-3 py-16 border-2 border-dashed cursor-pointer transition-colors ${busy ? "opacity-60 pointer-events-none" : "hover:bg-muted/40"}`}
      >
        <Upload className="size-10 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">
            {busy ? "Procesando…" : "Selecciona o arrastra un archivo .xlsx"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            SheetJS procesará los datos en tu navegador antes de enviarlos
          </p>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button variant="outline" size="sm" type="button" disabled={busy}>
          Elegir archivo
        </Button>
      </label>

      {log.length > 0 && (
        <Card className="ring-0 card-elevated">
          <CardHeader>
            <CardTitle className="font-display font-semibold">Resultado de la carga</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {log.map((r, i) => (
                <div key={r.kind}>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      {r.errors === 0 ? (
                        <CheckCircle2 className="text-success" />
                      ) : (
                        <AlertCircle className="text-warning" />
                      )}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="capitalize">{r.kind.replace("_", " ")}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{r.count}</span> insertados
                        {r.errors > 0 && (
                          <span className="text-destructive ml-3">· {r.errors} errores</span>
                        )}
                      </div>
                    </ItemActions>
                  </Item>
                  {i < log.length - 1 && <ItemSeparator />}
                </div>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
