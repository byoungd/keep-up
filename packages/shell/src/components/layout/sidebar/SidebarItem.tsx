import { cn } from "@ku0/shared/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { useReaderShell } from "../../../context/ReaderShellContext";
import type { SidebarBadgeStyle } from "../../../lib/sidebar";
import { Badge } from "../../ui/Badge";

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
  const match = href.match(/\/editor\/([^/?]+)/);
  return match ? match[1] : null;
}

export const SidebarItem = React.memo(function SidebarItem({
  id,
  label,
  icon: Icon,
  href,
  isActive,
  isContextSelected = false,
  badgeCount = 0,
  badgeStyle = "COUNT",
}: SidebarItemProps) {
  const { components } = useReaderShell();
  const { Link } = components;
  const shortcut = id === "search" ? "⌘ K" : null;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "sidebar-item group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : isContextSelected
            ? "text-foreground/80"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
      data-value={href}
    >
      {/* Active - minimal (no bar) */}

      {Icon && (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isActive
              ? "text-foreground"
              : isContextSelected
                ? "text-foreground/60"
                : "text-muted-foreground group-hover:text-foreground/80"
          )}
          strokeWidth={isActive ? 2 : 1.5}
        />
      )}

      <span
        className="truncate flex-1"
        title={
          process.env.NODE_ENV === "development" ? `ID: ${extractIdFromHref(href)}` : undefined
        }
      >
        {label}
      </span>

      {shortcut ? (
        <kbd className="ml-auto h-5 px-2.5 rounded-md bg-surface-2/70 border border-border/40 text-[12px] font-semibold text-muted-foreground/80 flex items-center leading-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {shortcut}
        </kbd>
      ) : null}

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
