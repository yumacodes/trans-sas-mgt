import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorState } from './States';

interface Props {
  children: ReactNode;
  /** Changing this key resets the boundary (e.g. on route change). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      const isChunkError = /Loading chunk|dynamically imported module/i.test(this.state.error.message);
      return (
        <ErrorState
          title="This page couldn't be displayed"
          message={
            isChunkError
              ? 'A newer version of the application may be available. Reload the page to continue.'
              : 'An unexpected problem occurred while showing this page. No data was changed. Reload the page or try again.'
          }
          onRetry={() => (isChunkError ? window.location.reload() : this.setState({ error: null }))}
        />
      );
    }
    return this.props.children;
  }
}
