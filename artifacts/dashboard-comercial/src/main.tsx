import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { AuthProvider } from './hooks/use-auth';
import { SharedFiltersProvider } from './hooks/shared-filters-provider';

import './styles.css';
import './ui-foundation.css';
import './visual-refresh.css';

const preloadRecoveryKey = 'ccv-vite-preload-recovery-at';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  try {
    const lastRecoveryAt = Number(
      sessionStorage.getItem(preloadRecoveryKey) ?? 0,
    );
    if (Date.now() - lastRecoveryAt < 15_000) return;

    sessionStorage.setItem(preloadRecoveryKey, String(Date.now()));
    window.location.reload();
  } catch {
    // The route error boundary provides a manual recovery if storage is blocked.
  }
});

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
