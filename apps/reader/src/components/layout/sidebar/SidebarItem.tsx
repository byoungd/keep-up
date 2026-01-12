"use client";

import { Badge } from "@/components/ui/Badge";
import { Link } from "@/i18n/navigation";
import type { SidebarBadgeStyle } from "@/lib/sidebar";
import { cn } from "@keepup/shared/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

interface SidebarItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  isActive: boolean;
  isContextSelected?: boolean;
  badgeCount?: number;
  badgeStyle?: SidebarBadgeStyle;
  locked?: boolean;
}

function extractIdFromHref(href: string): string | null {
  const match = href.match(/\/editor\/([^\/?]+)/);
  return match ? match[1] : null;
}

export const SidebarItem = React.memo(function SidebarItem({
  label,
  icon: Icon,
  href,
  isActive,
  isContextSelected = false,
  badgeCount = 0,
  badgeStyle = "COUNT",
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "sidebar-item group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-surface-2 text-foreground shadow-sm"
          : isContextSelected
            ? "text-foreground/80"
            : "text-muted-foreground hover:bg-surface-2/50 hover:text-foreground"
      )}
      data-value={href}
    >
      {/* Active indicator - only for active leaf */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full shadow-[0_0_8px_var(--color-accent-indigo-glow)]" />
      )}

      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive
            ? "text-primary"
            : isContextSelected
              ? "text-foreground/60"
              : "text-muted-foreground group-hover:text-foreground/80"
        )}
        strokeWidth={isActive ? 2 : 1.5}
      />

      <span className="truncate flex-1" title={`ID: ${extractIdFromHref(href)}`}>
        {label}
        <span className="ml-2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono">
          {extractIdFromHref(href)}
        </span>
      </span>

      {badgeCount > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            "ml-auto shrink-0 transition-all",
            badgeStyle === "DOT"
              ? "h-2 w-2 min-w-0 p-0 rounded-full bg-primary"
              : "text-[10px] h-5 min-w-5 px-1.5 bg-surface-3 text-muted-foreground"
          )}
        >
          {badgeStyle === "COUNT" ? badgeCount : null}
        </Badge>
      )}
    </Link>
  );
});
