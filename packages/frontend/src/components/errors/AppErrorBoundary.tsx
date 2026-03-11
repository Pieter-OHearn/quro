import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorDisplay } from '@/components/errors/ErrorDisplay';
import { formatErrorWithStack } from '@/components/errors/errorFormatting';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  showDetails: boolean;
  componentStack: string | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null, showDetails: false, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error('Unhandled app render error', error, info);
  }

  render() {
    const { error, showDetails, componentStack } = this.state;
    if (!error) return this.props.children;

    const detail = `${formatErrorWithStack(error)}${
      componentStack ? `\n\nComponent stack:\n${componentStack}` : ''
    }`;

    return (
      <ErrorDisplay
        detail={detail}
        onGoHome={() => {
          this.setState({ error: null, showDetails: false, componentStack: null });
          window.location.assign('/');
        }}
        onReload={() => window.location.reload()}
        showDetails={showDetails}
        onToggleDetails={() => this.setState((state) => ({ showDetails: !state.showDetails }))}
      />
    );
  }
}
