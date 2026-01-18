"use client";

import { cn } from "@ku0/shared/utils";
import type * as React from "react";

interface TextShimmerProps extends React.ComponentProps<"span"> {
  duration?: number;
}

export function TextShimmer({ children, className, duration = 2, ...props }: TextShimmerProps) {
  return (
    <span
      className={cn(
        // Shimmer effect derived from theme tokens.
        "inline-flex animate-shine bg-[linear-gradient(110deg,var(--color-foreground),45%,var(--color-muted-foreground),55%,var(--color-foreground))] bg-[length:200%_100%] bg-clip-text text-transparent",
        className
      )}
      style={{
        animationDuration: `${duration}s`,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
