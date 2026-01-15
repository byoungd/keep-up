import type React from "react";
import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <title>Error icon</title>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button type="button" className="error-boundary-retry" onClick={this.handleRetry}>
              Try again
            </button>
          </div>
          <style>{`
            .error-boundary-fallback {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 2rem;
              background: var(--color-background);
              color: var(--color-foreground);
            }
            .error-boundary-content {
              text-align: center;
              max-width: 400px;
            }
            .error-boundary-icon {
              color: var(--color-destructive, #ef4444);
              margin-bottom: 1rem;
            }
            .error-boundary-title {
              font-size: 1.25rem;
              font-weight: 600;
              margin: 0 0 0.5rem;
            }
            .error-boundary-message {
              color: var(--color-muted-foreground);
              margin: 0 0 1.5rem;
              font-size: 0.875rem;
            }
            .error-boundary-retry {
              padding: 0.5rem 1rem;
              background: var(--color-primary);
              color: var(--color-primary-foreground);
              border: none;
              border-radius: 0.375rem;
              font-size: 0.875rem;
              cursor: pointer;
              transition: opacity 0.15s;
            }
            .error-boundary-retry:hover {
              opacity: 0.9;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}
