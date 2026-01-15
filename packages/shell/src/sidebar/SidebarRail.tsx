"use client";

import { Search, Settings2 } from "lucide-react";
import * as React from "react";
import { cn } from "../utils/cn";
import type { SidebarNavItem, SidebarRailProps } from "./types";

/**
 * Default Link component for rail items.
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
 * Default avatar for rail.
 */
const DefaultAvatar: React.FC<{ name: string; url?: string }> = ({ name, url }) => {
  const initial = name?.trim().charAt(0).toUpperCase() || "W";

  if (url) {
    return <img src={url} alt={name} className="h-6 w-6 rounded-md object-cover" />;
  }

  return (
    <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-[10px] font-medium text-white">
      {initial}
    </div>
  );
};

/**
 * Default tooltip wrapper - just renders children without tooltip.
 */
const DefaultTooltip: React.FC<{ content: string; children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

/**
 * Render badge for rail items based on style.
 */
function renderRailBadge(item: SidebarNavItem, badgeStyle: "COUNT" | "DOT"): React.ReactNode {
  if (!item.badgeCount || item.badgeCount <= 0) {
    return null;
  }

  if (badgeStyle === "DOT") {
    return <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />;
  }

  return (
    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
      {item.badgeCount}
    </span>
  );
}

/**
 * SidebarRail - The collapsed icon-only view of the sidebar.
 *
 * Extracted from Reader's sidebar for shared use.
 */
export const SidebarRail = React.memo(function SidebarRail({
  groups,
  badgeStyle,
  activePath,
  isLoading,
  workspaceName = "Workspace",
  workspaceAvatarUrl,
  onSearch,
  onOpenCustomize,
  LinkComponent = DefaultLink,
  renderAvatar,
  renderTooltip,
}: SidebarRailProps) {
  const Link = LinkComponent;
  const Tooltip = renderTooltip ?? DefaultTooltip;
  const Avatar = renderAvatar ?? DefaultAvatar;

  const _workspaceInitial = React.useMemo(
    () => workspaceName?.trim().charAt(0).toUpperCase() || "W",
    [workspaceName]
  );

  if (isLoading) {
    return (
      <aside
        className="flex h-full w-full flex-col items-center justify-center gap-2 py-3"
        aria-label="Sidebar rail"
      >
        <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </aside>
    );
  }

  return (
    <aside
      className="flex h-full w-full flex-col items-center gap-3 py-3"
      aria-label="Sidebar rail"
    >
      <Tooltip content="Workspace">
        <button
          type="button"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-foreground/80 hover:bg-surface-2"
          aria-label="Workspace"
        >
          <Avatar name={workspaceName} url={workspaceAvatarUrl} />
        </button>
      </Tooltip>

      {onSearch && (
        <Tooltip content="Search">
          <button
            type="button"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2"
            onClick={onSearch}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {groups.map((group, groupIndex) => {
          if (group.items.length === 0) {
            return null;
          }

          return (
            <div key={group.id} className="flex flex-col items-center gap-2">
              {groupIndex > 0 && <div className="h-px w-6 bg-border/60" />}
              {group.items.map((item) => {
                const isActive =
                  activePath === item.route || activePath.startsWith(`${item.route}/`);
                return (
                  <Tooltip key={item.id} content={item.label}>
                    <Link
                      href={item.route}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={item.label}
                      className={cn(
                        "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isActive
                          ? "bg-surface-2 text-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-surface-2/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" strokeWidth={isActive ? 2 : 1.5} />
                      {renderRailBadge(item, badgeStyle)}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>

      {onOpenCustomize && (
        <Tooltip content="Customize">
          <button
            type="button"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2"
            onClick={onOpenCustomize}
            aria-label="Customize"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
    </aside>
  );
});
