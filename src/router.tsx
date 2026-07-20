import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Los datos comerciales cambian una vez por semana (carga de Excel los viernes),
  // así que staleTime/gcTime largos eliminan la mayoría de los re-fetch al navegar
  // entre rutas. Ver docs/MASTER_STRATEGY.md §1.3 (M1).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60 * 2,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 1000 * 30,
  });

  return router;
};
