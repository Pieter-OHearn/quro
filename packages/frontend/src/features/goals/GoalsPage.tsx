import { GoalsLoadingState, GoalsMainContent } from './components';
import { useGoalsPage } from './hooks';

export function Goals() {
  const state = useGoalsPage();

  if (state.loadingGoals || state.loadingPayslips || state.loadingSavingsAccounts) {
    return <GoalsLoadingState />;
  }

  return <GoalsMainContent state={state} />;
}
