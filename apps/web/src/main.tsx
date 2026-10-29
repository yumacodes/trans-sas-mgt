import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/auth/AuthProvider';
import { FullScreenLoader } from '@/components/app/FullScreenLoader';
import { OperationFeedbackProvider } from '@/components/app/OperationFeedback';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';
import { supabaseConfigured } from '@/lib/supabase';
import { SetupRequiredPage } from '@/pages/SetupRequiredPage';
import { router } from '@/router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        // Retrying a client error never helps; only retry transient failures.
        if (error instanceof ApiError && !error.retryable) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            <OperationFeedbackProvider>
              <Suspense fallback={<FullScreenLoader />}>
                <RouterProvider router={router} />
              </Suspense>
            </OperationFeedbackProvider>
          </TooltipProvider>
        </AuthProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    ) : (
      <SetupRequiredPage />
    )}
  </StrictMode>,
);
