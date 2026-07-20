import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { SharedFiltersProvider } from "@/hooks/shared-filters-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button, buttonVariants } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscás no existe o fue movida.
        </p>
        <div className="mt-6">
          <Link to="/" className={buttonVariants({ variant: "default" })}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Esta página no cargó
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo salió mal de nuestro lado. Podés intentar de nuevo o volver al inicio.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Intentar de nuevo
          </Button>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CCV Dashboard Comercial" },
      {
        name: "description",
        content:
          "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
      },
      { name: "author", content: "CCV" },
      { property: "og:title", content: "CCV Dashboard Comercial" },
      {
        property: "og:description",
        content:
          "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CCV Dashboard Comercial" },
      {
        name: "twitter:description",
        content:
          "Plataforma de analytics comercial CCV: cotizaciones, facturacion, cobranzas, minutas y analisis Pareto en tiempo real.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/logo-ccv.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/logo-ccv.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SharedFiltersProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <TooltipProvider delay={200}>
              <Outlet />
              <Toaster position="top-right" richColors />
            </TooltipProvider>
          </ThemeProvider>
        </SharedFiltersProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
