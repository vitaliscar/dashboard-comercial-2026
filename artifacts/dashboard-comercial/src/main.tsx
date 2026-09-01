import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { AuthProvider } from './hooks/use-auth';
import { SharedFiltersProvider } from './hooks/shared-filters-provider';

import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SharedFiltersProvider>
        <App />
      </SharedFiltersProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
