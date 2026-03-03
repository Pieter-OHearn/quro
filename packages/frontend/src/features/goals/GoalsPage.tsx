import { GoalsLoadingState, GoalsMainContent } from './components';
import { useGoalsPage } from './hooks';

export function Goals() {
  const state = useGoalsPage();

  if (state.loadingGoals || state.loadingPayslips) {
    return <GoalsLoadingState />;
  }

  return <GoalsMainContent state={state} />;
}
