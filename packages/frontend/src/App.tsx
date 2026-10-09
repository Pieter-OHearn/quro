import { RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import { CurrencyProvider } from '@/lib/CurrencyContext';
import { AuthProvider } from '@/lib/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';
import { useTheme } from '@/hooks/useTheme';

/** Keeps the theme applied app-wide, including following the OS setting while "System" is chosen. */
function ThemeSync() {
  useTheme();
  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeSync />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CurrencyProvider>
            <RouterProvider router={router} />
          </CurrencyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
