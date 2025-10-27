import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';

import './index.css';
import { AdminAuthProvider } from '@/providers/admin-auth-provider';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/toaster';
import { router } from './router';

if (typeof window !== 'undefined' && typeof (window as typeof window & { global?: unknown }).global === 'undefined') {
  (window as typeof window & { global?: unknown }).global = window;
}

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AdminAuthProvider>
          <RouterProvider router={router} />
          <Toaster />
        </AdminAuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);
