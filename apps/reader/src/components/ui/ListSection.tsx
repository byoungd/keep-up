"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

export interface ListSectionProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  label: string;
  sticky?: boolean;
  /** Propagated density */
  density?: "compact" | "default" | "comfortable";
}

/**
 * Section grouping for lists.
 * Supports sticky headers.
 */
export const ListSection = React.forwardRef<HTMLFieldSetElement, ListSectionProps>(
  ({ className, label, sticky, density = "default", children, ...props }, ref) => {
    return (
      <fieldset ref={ref} aria-label={label} className="m-0 min-w-0 border-0 p-0" {...props}>
        <div
          className={cn(
            "px-2 py-1 text-xs font-medium text-muted-foreground bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
            sticky && "sticky top-0 z-10 border-b border-border/40 mb-1",
            className
          )}
        >
          {label}
        </div>
        <div className="space-y-0.5">{children}</div>
      </fieldset>
    );
  }
);
ListSection.displayName = "ListSection";
