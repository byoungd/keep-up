"use client";

import * as React from "react";
import { Icon as IconWrapper } from "../components/ui/Icon";
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
  icon: ItemIcon,
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
        "sidebar-item group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-normal",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-surface-2/90 text-foreground font-semibold"
          : isContextSelected
            ? "text-foreground/80"
            : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground"
      )}
    >
      <IconWrapper
        size="lg"
        aria-hidden="true"
        className={cn(
          "shrink-0 transition-colors duration-fast",
          isActive
            ? "text-foreground"
            : isContextSelected
              ? "text-foreground/60"
              : "text-muted-foreground group-hover:text-foreground/80"
        )}
      >
        <ItemIcon />
      </IconWrapper>

      <span className="truncate flex-1">{label}</span>

      {badgeCount > 0 && (
        <span
          className={cn(
            "ml-auto shrink-0 transition-all duration-fast",
            badgeStyle === "DOT"
              ? "h-2 w-2 min-w-0 p-0 rounded-full bg-primary"
              : "text-micro h-5 min-w-5 px-1.5 bg-surface-3 text-muted-foreground rounded-full flex items-center justify-center"
          )}
        >
          {badgeStyle === "COUNT" ? badgeCount : null}
        </span>
      )}
    </Link>
  );
});
