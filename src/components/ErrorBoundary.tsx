import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed.error) {
        readable = `Cloud sync permission or network error (${parsed.path || 'database'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-zinc-200 rounded-xl p-8">
            <p className="text-xs font-medium text-amber-800 mb-2">
              Suman Cold Coffee Depot
            </p>
            <h1 className="font-display text-2xl font-semibold text-zinc-950 mb-3">
              Unable to load this view
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed mb-6">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2.5 text-sm font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
