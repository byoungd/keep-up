"use client";

import * as React from "react";
import { cn } from "../utils/cn";
import type { SidebarItemProps } from "./types";

/**
 * Default Link component that renders a plain anchor tag.
 * Apps should provide their own Link component for routing.
 */
const DefaultLink: React.FC<{
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-current"?: "page" | undefined;
}> = ({ href, className, children, ...props }) => (
  <a href={href} className={className} {...props}>
    {children}
  </a>
);

/**
 * SidebarItem - A single navigation item in the sidebar.
 *
 * Extracted from Reader's sidebar for shared use.
 */
export const SidebarItem = React.memo(function SidebarItem({
  label,
  icon: Icon,
  href,
  isActive,
  isContextSelected = false,
  badgeCount = 0,
  badgeStyle = "COUNT",
  LinkComponent = DefaultLink,
}: SidebarItemProps) {
  const Link = LinkComponent;

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

      <span className="truncate flex-1">{label}</span>

      {badgeCount > 0 && (
        <span
          className={cn(
            "ml-auto shrink-0 transition-all",
            badgeStyle === "DOT"
              ? "h-2 w-2 min-w-0 p-0 rounded-full bg-primary"
              : "text-[10px] h-5 min-w-5 px-1.5 bg-surface-3 text-muted-foreground rounded-full flex items-center justify-center"
          )}
        >
          {badgeStyle === "COUNT" ? badgeCount : null}
        </span>
      )}
    </Link>
  );
});
