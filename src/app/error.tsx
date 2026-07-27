"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error capturado en app error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center p-6 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <AlertTriangle className="size-10" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold tracking-tight text-card-foreground">
            Ha ocurrido un error inesperado
          </h2>
          <p className="text-sm text-muted-foreground">
            No se pudo completar la operación actual. Por favor, intente de nuevo o contacte al
            administrador si el problema persiste.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-muted-foreground/70">
              Código de referencia: {error.digest}
            </p>
          )}
        </div>
        <Button onClick={() => reset()} className="mt-2 gap-2 font-medium" variant="default">
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    </div>
  );
}
