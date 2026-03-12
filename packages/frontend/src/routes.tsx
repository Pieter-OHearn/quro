import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/features/dashboard';
import { Savings } from '@/features/savings';
import { Investments } from '@/features/investments';
import { Mortgage } from '@/features/mortgage';
import { Debts } from '@/features/debts';
import { Salary } from '@/features/salary';
import { Goals } from '@/features/goals';
import { Budget } from '@/features/budget';
import { Pension } from '@/features/pension';
import { LandingPage } from '@/features/landing';
import { Settings } from '@/features/settings';
import { useAuth } from '@/lib/AuthContext';
import { RouteErrorScreen } from '@/router/RouteErrorScreen';

function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
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
      <div className="flex items-center justify-center h-screen bg-[#0a0f1e]">
        <div className="w-8 h-8 border-3 border-indigo-200/20 border-t-indigo-400 rounded-full animate-spin" />
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
    children: [{ index: true, Component: LandingPage }],
  },
  {
    path: '/',
    Component: RequireAuth,
    ErrorBoundary: RouteErrorScreen,
    children: [
      { index: true, Component: Dashboard },
      { path: 'savings', Component: Savings },
      { path: 'investments', Component: Investments },
      { path: 'mortgage', Component: Mortgage },
      { path: 'debts', Component: Debts },
      { path: 'salary', Component: Salary },
      { path: 'pension', Component: Pension },
      { path: 'goals', Component: Goals },
      { path: 'budget', Component: Budget },
      { path: 'settings', Component: Settings },
    ],
  },
]);
