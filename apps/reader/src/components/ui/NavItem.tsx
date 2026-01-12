"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

export interface NavItemProps {
  /** Navigation target href */
  href: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Whether this item is currently active */
  isActive?: boolean;
  /** Optional badge count */
  badge?: number;
  /** Optional keyboard shortcut */
  shortcut?: string;
  /** Visual density */
  density?: "compact" | "default" | "comfortable";
  /** Additional class names */
  className?: string;
}

const DENSITY_STYLES = {
  compact: "py-1 px-2 text-xs gap-2",
  default: "py-1.5 px-3 text-sm gap-2.5",
  comfortable: "py-2 px-3 text-sm gap-3",
} as const;

/**
 * NavItem - A navigation link with optional icon, badge, and density support.
 * For use in navigation sections and menus.
 */
export const NavItem = React.memo(function NavItem({
  href,
  label,
  icon: Icon,
  isActive = false,
  badge,
  shortcut,
  density = "default",
  className,
}: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center rounded-md font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        DENSITY_STYLES[density],
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn(
            "shrink-0 transition-colors",
            density === "compact" ? "h-3.5 w-3.5" : "h-4 w-4",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
          strokeWidth={isActive ? 2 : 1.5}
        />
      )}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] h-5 min-w-5 px-1.5 flex items-center justify-center bg-surface-3 text-muted-foreground rounded-full">
          {badge}
        </span>
      )}
      {shortcut && (
        <kbd className="ml-auto text-[10px] text-muted-foreground bg-surface-2 px-1.5 py-0.5 rounded border border-border/30">
          {shortcut}
        </kbd>
      )}
    </Link>
  );
});
