"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { SharedFiltersProvider } from "@/hooks/shared-filters-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60000,
            gcTime: 300000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SharedFiltersProvider>
          {/* Sin ThemeProvider: el tema es fijo (`class="dark"` en layout.tsx).
              next-themes inyectaba un <script> —warning de React en cliente— y
              además pisaba esa clase con defaultTheme="light". */}
          <TooltipProvider delay={200}>
            {children}
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </SharedFiltersProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
