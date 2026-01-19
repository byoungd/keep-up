import { cn } from "@ku0/shared/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { useReaderShell } from "../../../context/ReaderShellContext";
import type { SidebarBadgeStyle } from "../../../lib/sidebar";
import { Badge } from "../../ui/Badge";
import { Icon as IconWrapper } from "../../ui/Icon";

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

export const SidebarItem = React.memo(function SidebarItem({
  id,
  label,
  icon: ItemIcon,
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
        "sidebar-item group relative flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-fast cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-foreground/[0.08] text-foreground font-medium"
          : isContextSelected
            ? "text-foreground/80 bg-foreground/[0.03]"
            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
      data-value={href}
    >
      {/* Active - minimal (no bar) */}

      {ItemIcon && (
        <IconWrapper
          size="lg"
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-colors duration-fast opacity-70 group-hover:opacity-100 group-hover:text-foreground",
            isActive
              ? "text-foreground opacity-100"
              : isContextSelected
                ? "text-foreground/60"
                : "text-muted-foreground"
          )}
        >
          <ItemIcon />
        </IconWrapper>
      )}

      <span className="truncate flex-1">{label}</span>

      {shortcut ? (
        <kbd className="ml-auto h-5 px-1.5 rounded-[4px] bg-surface-3/50 border border-border/40 text-[10px] uppercase font-bold text-muted-foreground/70 flex items-center leading-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          {shortcut}
        </kbd>
      ) : null}

      {badgeCount > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            "ml-auto shrink-0 transition-all duration-fast",
            badgeStyle === "DOT"
              ? "h-1.5 w-1.5 min-w-0 p-0 rounded-full bg-primary"
              : "text-micro h-4 min-w-4 px-1 bg-surface-3 text-muted-foreground"
          )}
        >
          {badgeStyle === "COUNT" ? badgeCount : null}
        </Badge>
      )}
    </Link>
  );
});
