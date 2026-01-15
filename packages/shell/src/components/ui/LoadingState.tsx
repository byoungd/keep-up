"use client";

import { cn } from "@ku0/shared/utils";
import { Loader2 } from "lucide-react";
import { Skeleton } from "./Skeleton";

export interface LoadingStateProps {
  /** Loading variant */
  variant?: "spinner" | "skeleton" | "dots";
  /** Size of the loading indicator */
  size?: "sm" | "md" | "lg";
  /** Optional loading message */
  message?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to center in container */
  centered?: boolean;
}

/**
 * Reusable loading state component.
 *
 * @example
 * ```tsx
 * // Simple spinner
 * <LoadingState />
 *
 * // With message
 * <LoadingState message="Loading documents..." />
 *
 * // Skeleton variant
 * <LoadingState variant="skeleton" />
 * ```
 */
export function LoadingState({
  variant = "spinner",
  size = "md",
  message,
  className,
  centered = true,
}: LoadingStateProps) {
  const sizeStyles = {
    sm: { spinner: "h-4 w-4", text: "text-xs" },
    md: { spinner: "h-5 w-5", text: "text-sm" },
    lg: { spinner: "h-6 w-6", text: "text-base" },
  };

  const styles = sizeStyles[size];

  const content = (
    <>
      {variant === "spinner" && (
        <Loader2
          className={cn("animate-spin text-muted-foreground", styles.spinner)}
          aria-hidden="true"
        />
      )}

      {variant === "dots" && (
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "rounded-full bg-muted-foreground animate-pulse",
                size === "sm" && "h-1.5 w-1.5",
                size === "md" && "h-2 w-2",
                size === "lg" && "h-2.5 w-2.5"
              )}
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}

      {variant === "skeleton" && (
        <div className="w-full max-w-md space-y-3">
          <Skeleton variant="text" width="100%" />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="60%" />
        </div>
      )}

      {message && <span className={cn("text-muted-foreground", styles.text)}>{message}</span>}
    </>
  );

  if (centered) {
    return (
      <output
        className={cn("flex flex-1 flex-col items-center justify-center gap-3", className)}
        aria-live="polite"
      >
        {content}
        <span className="sr-only">{message ?? "Loading..."}</span>
      </output>
    );
  }

  return (
    <output className={cn("flex items-center gap-2", className)} aria-live="polite">
      {content}
      <span className="sr-only">{message ?? "Loading..."}</span>
    </output>
  );
}

/**
 * Full-page loading state for route transitions.
 */
export function PageLoadingState({ message }: { message?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <LoadingState size="lg" message={message} />
    </div>
  );
}

/**
 * Inline loading state for buttons or small areas.
 */
export function InlineLoadingState({ className }: { className?: string }) {
  return <LoadingState variant="spinner" size="sm" centered={false} className={className} />;
}
