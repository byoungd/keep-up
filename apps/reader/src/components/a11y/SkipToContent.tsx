"use client";

import { cn } from "@/lib/utils";
import type * as React from "react";

export interface SkipToContentProps {
  contentId?: string;
  children?: React.ReactNode;
}

/**
 * Skip-to-content link for keyboard accessibility.
 * Appears only when focused via Tab key.
 */
export function SkipToContent({
  contentId = "main-content",
  children = "Skip to main content",
}: SkipToContentProps) {
  return (
    <a
      href={`#${contentId}`}
      className={cn(
        "sr-only focus:not-sr-only",
        "fixed top-4 left-4 z-overlay",
        "bg-primary text-primary-foreground",
        "px-4 py-2 rounded-md text-sm font-medium",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "transition-all duration-fast ease-smooth"
      )}
    >
      {children}
    </a>
  );
}
