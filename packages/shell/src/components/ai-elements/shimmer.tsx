"use client";

import { cn } from "@ku0/shared/utils";
import type * as React from "react";

type ShimmerElement = React.ElementType;

type ShimmerProps<T extends ShimmerElement> = {
  as?: T;
  duration?: number;
  spread?: number;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function Shimmer<T extends ShimmerElement = "p">({
  as,
  duration = 2,
  spread = 2,
  className,
  children,
  style,
  ...props
}: ShimmerProps<T>) {
  const Component = (as ?? "p") as ShimmerElement;
  const backgroundSize = `${200 * Math.max(1, spread)}% 100%`;

  return (
    <Component
      className={cn(
        "inline-flex animate-shine bg-[linear-gradient(110deg,var(--color-foreground),45%,var(--color-muted-foreground),55%,var(--color-foreground))]",
        "bg-[length:200%_100%] bg-clip-text text-transparent",
        className
      )}
      style={{
        animationDuration: `${duration}s`,
        backgroundSize,
        ...style,
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
