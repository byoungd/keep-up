import type * as React from "react";
import { cn } from "../../utils/cn";

export interface NavSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

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
