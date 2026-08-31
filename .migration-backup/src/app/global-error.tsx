"use client";

import { useEffect } from "react";
import "@/styles.css";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error crítico en root layout (global error):", error);
  }, [error]);

  return (
    <html lang="es" className="dark" style={{ colorScheme: "dark" }}>
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground antialiased p-4">
        <div className="mx-auto flex max-w-md flex-col items-center text-center gap-4 rounded-xl border border-border bg-card p-8 shadow-2xl">
          <div className="rounded-full bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="size-12" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-card-foreground">
              Error crítico de la aplicación
            </h1>
            <p className="text-sm text-muted-foreground">
              Se ha producido un error grave en la raíz de la aplicación. Haga clic en el botón a
              continuación para intentar restablecer la sesión.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted-foreground/70">
                Código de referencia: {error.digest}
              </p>
            )}
          </div>
          <Button onClick={() => reset()} className="mt-2 gap-2 font-bold" variant="default">
            <RefreshCw className="size-4" />
            Reintentar
          </Button>
        </div>
      </body>
    </html>
  );
}
