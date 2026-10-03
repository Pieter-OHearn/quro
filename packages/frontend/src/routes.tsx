import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { LoadingSpinner } from '@/components/ui';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/lib/AuthContext';
import { RouteErrorScreen } from '@/router/RouteErrorScreen';

function RouteLoading() {
  return <LoadingSpinner className="min-h-screen" label="Loading page" />;
}

function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-sunken">
        <div className="w-8 h-8 border-3 border-brand-tint border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/welcome" replace />;
  }

  return <Layout />;
}

function PublicOnly() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-inverse">
        <div className="w-8 h-8 border-3 border-brand-tint/20 border-t-brand-disabled rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: '/welcome',
    Component: PublicOnly,
    ErrorBoundary: RouteErrorScreen,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/features/landing')).LandingPage }),
      },
    ],
  },
  {
    path: '/',
    Component: RequireAuth,
    ErrorBoundary: RouteErrorScreen,
    HydrateFallback: RouteLoading,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/features/dashboard')).Dashboard }),
      },
      { path: 'plan', lazy: async () => ({ Component: (await import('@/features/plan')).Plan }) },
      {
        path: 'savings',
        lazy: async () => ({ Component: (await import('@/features/savings')).Savings }),
      },
      {
        path: 'investments',
        lazy: async () => ({ Component: (await import('@/features/investments')).Investments }),
      },
      {
        path: 'mortgage',
        lazy: async () => ({ Component: (await import('@/features/mortgage')).Mortgage }),
      },
      {
        path: 'debts',
        lazy: async () => ({ Component: (await import('@/features/debts')).Debts }),
      },
      {
        path: 'salary',
        lazy: async () => ({ Component: (await import('@/features/salary')).Salary }),
      },
      {
        path: 'pension',
        lazy: async () => ({ Component: (await import('@/features/pension')).Pension }),
      },
      {
        path: 'goals',
        lazy: async () => ({ Component: (await import('@/features/goals')).Goals }),
      },
      {
        path: 'budget',
        lazy: async () => ({ Component: (await import('@/features/budget')).Budget }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/features/settings')).Settings }),
      },
    ],
  },
]);
