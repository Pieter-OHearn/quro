import { LoadingSpinner } from '../../atoms';
import type { LoadingSpinnerProps } from '../../atoms';

export type LoadingStateProps = LoadingSpinnerProps;

export function LoadingState(props: LoadingStateProps) {
  return <LoadingSpinner {...props} />;
}
