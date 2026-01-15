import { cn } from "@ku0/shared/utils";
import type * as React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Skeleton variant */
  variant?: "default" | "circular" | "text";
  /** Width (for text variant, this sets the percentage) */
  width?: string | number;
  /** Height */
  height?: string | number;
}

/**
 * Skeleton component for loading states.
 *
 * @example
 * ```tsx
 * // Default rectangle
 * <Skeleton className="h-12 w-full" />
 *
 * // Circular avatar
 * <Skeleton variant="circular" width={40} height={40} />
 *
 * // Text lines
 * <Skeleton variant="text" width="80%" />
 * <Skeleton variant="text" width="60%" />
 * ```
 */
function Skeleton({
  className,
  variant = "default",
  width,
  height,
  style,
  ...props
}: SkeletonProps) {
  const variantStyles = {
    default: "rounded-md",
    circular: "rounded-full",
    text: "rounded h-4",
  };

  return (
    <div
      className={cn("animate-pulse bg-muted", variantStyles[variant], className)}
      style={{
        width: width,
        height: height,
        ...style,
      }}
      {...props}
    />
  );
}

/**
 * Pre-built skeleton for text content.
 */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["100%", "90%", "75%", "85%", "60%"];

  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={`skeleton-line-${widths[i % widths.length]}`}
          variant="text"
          width={widths[i % widths.length]}
        />
      ))}
    </div>
  );
}

/**
 * Pre-built skeleton for card content.
 */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      <Skeleton className="h-32 w-full" />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="40%" />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
