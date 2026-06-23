import { Component, type ReactNode } from 'react';

type ReaderRenderBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onRenderError: (message: string) => void;
  resetKey: string;
};

type ReaderRenderBoundaryState = {
  hasError: boolean;
};

export class ReaderRenderBoundary extends Component<
  ReaderRenderBoundaryProps,
  ReaderRenderBoundaryState
> {
  state: ReaderRenderBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ReaderRenderBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onRenderError(error instanceof Error ? error.message : String(error));
  }

  componentDidUpdate(previousProps: ReaderRenderBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
