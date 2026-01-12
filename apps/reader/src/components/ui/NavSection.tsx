"use client";

import { cn } from "@/lib/utils";
import type * as React from "react";

export interface NavSectionProps {
  /** Section title (optional - omit for untitled sections) */
  title?: string;
  /** Children (NavGroup or NavItem components) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * NavSection - A semantic container for navigation groups or items.
 * Use to organize navigation into logical sections with optional titles.
 */
export function NavSection({ title, children, className }: NavSectionProps) {
  return (
    <nav className={cn("space-y-4", className)} aria-label={title}>
      {title && (
        <h2 className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">
          {title}
        </h2>
      )}
      <div className="space-y-1">{children}</div>
    </nav>
  );
}
