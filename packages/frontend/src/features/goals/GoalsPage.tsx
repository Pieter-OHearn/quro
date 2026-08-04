import { GoalsLoadingState, GoalsMainContent } from './components';
import { RouteQueryErrorState } from '@/components/errors/RouteQueryErrorState';
import { useGoalsPage } from './hooks';

export function Goals() {
  const state = useGoalsPage();

  if (state.loadingGoals || state.loadingPayslips || state.loadingSavingsAccounts) {
    return <GoalsLoadingState />;
  }
  if (state.queryFailures.length > 0) {
    return <RouteQueryErrorState routeName="Goals" failedQueries={state.queryFailures} />;
  }

  return <GoalsMainContent state={state} />;
}
