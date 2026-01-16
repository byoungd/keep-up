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
        // Shimmer effect that respects theme foreground color
        // Light mode: black -> grey -> black
        // Dark mode: white -> grey -> white
        "inline-flex animate-shine bg-[linear-gradient(110deg,#000000,45%,#9ca3af,55%,#000000)] bg-[length:200%_100%] bg-clip-text text-transparent dark:bg-[linear-gradient(110deg,#ffffff,45%,#a1a1aa,55%,#ffffff)]",
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
