"use client";

import * as Sentry from "@sentry/nextjs";
import { RotateCcw } from "lucide-react";
import * as React from "react";
import { ErrorPrimitive } from "../error/ErrorPrimitive";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** 'page' for full sections, 'inline' for small widgets */
  variant?: "page" | "inline";
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary component to catch JavaScript errors in child components.
 * Prevents white screen crashes by showing a graceful fallback UI.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isInline = this.props.variant === "inline";

      if (isInline) {
        return (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-foreground/90 backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-300">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-3.5 w-3.5 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Error Icon</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <span className="font-medium text-xs text-muted-foreground/80 truncate flex-1">
              {this.state.error?.message || "Module failed to load"}
            </span>
            <button
              type="button"
              onClick={this.handleRetry}
              className="text-xs font-semibold px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
            >
              Retry
            </button>
          </div>
        );
      }

      // Page variant (default)
      return (
        <ErrorPrimitive
          title="Component Error"
          description={
            this.state.error?.message || "A component in this view failed to render correctly."
          }
          className="min-h-[500px] rounded-2xl border border-border/50 bg-surface-1/50"
          actions={
            <Button
              variant="outline"
              size="lg"
              onClick={this.handleRetry}
              className="w-full sm:w-auto min-w-[160px] gap-2 shadow-sm hover:bg-secondary/50 h-12"
            >
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
