"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info, Shield } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { uploadExcelAction } from "@/lib/actions/carga";
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

export default function CargaPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    rowsAffected: Record<string, number>;
    errors: string[];
  } | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const loadResult = await uploadExcelAction(formData);
      setResult(loadResult);
      loadResult.errors.forEach((e) => toast.error(e));
      if (loadResult.success) {
        const total = Object.values(loadResult.rowsAffected).reduce((a, b) => a + b, 0);
        toast.success(`Carga completada: ${total} registros importados`);
      }
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="size-7" /> Carga de datos
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Importa el Excel "CCV Rendimiento.xlsx" para poblar el dashboard
        </p>
      </div>

      <Alert>
        <Info />
        <AlertDescription>
          <p>
            El archivo debe seguir el mismo formato multi-hoja que usa la carga semanal automática
            (Oportunidades, Facturas Principales/LubFiltros, Ventas Perdidas, Presupuesto,
            Cobranzas, Equipos, etc.). Reemplaza por completo los datos existentes de cada tabla
            afectada (DELETE + INSERT).
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
            Se procesa en el servidor con el mismo loader del cron semanal
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

      {result && (
        <Card className="ring-0 card-elevated">
          <CardHeader>
            <CardTitle className="font-display font-semibold">Resultado de la carga</CardTitle>
          </CardHeader>
          <CardContent>
            <ItemGroup>
              {Object.entries(result.rowsAffected).map(([kind, count], i, arr) => (
                <div key={kind}>
                  <Item variant="outline" size="sm">
                    <ItemMedia variant="icon">
                      {result.success ? (
                        <CheckCircle2 className="text-success" />
                      ) : (
                        <AlertCircle className="text-warning" />
                      )}
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="capitalize">{kind.replace(/_/g, " ")}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{count}</span> insertados
                      </div>
                    </ItemActions>
                  </Item>
                  {i < arr.length - 1 && <ItemSeparator />}
                </div>
              ))}
            </ItemGroup>
            {result.errors.length > 0 && (
              <div className="mt-4 flex flex-col gap-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">
                    {e}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
