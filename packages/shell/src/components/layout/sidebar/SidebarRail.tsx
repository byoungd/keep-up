"use client";

import { cn } from "@ku0/shared/utils";
import { Search, Settings2 } from "lucide-react";
import * as React from "react";
import { useReaderShell } from "../../../context/ReaderShellContext";
// Link import removed
// usePathname import removed
import type { EffectiveSidebarItem, EffectiveSidebarState } from "../../../lib/sidebar";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
// command palette hook removed
import { Tooltip } from "../../ui/Tooltip";

interface SidebarRailProps {
  state: EffectiveSidebarState;
  isLoading: boolean;
  onOpenCustomize?: () => void;
  onOpenSearch?: () => void; // Abstracted search handler
  workspaceName?: string;
  workspaceAvatarUrl?: string;
}

const renderRailBadge = (
  item: EffectiveSidebarItem,
  badgeStyle: EffectiveSidebarState["badgeStyle"]
) => {
  if (item.badgeCount <= 0) {
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
};

export const SidebarRail = React.memo(function SidebarRail({
  state,
  isLoading,
  onOpenCustomize,
  onOpenSearch,
  workspaceName,
  workspaceAvatarUrl,
}: SidebarRailProps) {
  const { router, components, i18n } = useReaderShell();
  const { pathname } = router;
  const { Link } = components;

  const t = (key: string) => i18n.t(`Sidebar.${key}`, key);

  const handleSearch = React.useCallback(() => {
    onOpenSearch?.();
  }, [onOpenSearch]);
  const workspaceInitial = React.useMemo(
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
      <Tooltip content={t("workspace")} side="right" sideOffset={10}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg text-foreground/80"
          aria-label={t("workspace")}
        >
          <Avatar
            size="sm"
            src={workspaceAvatarUrl}
            fallback={workspaceInitial}
            className="h-6 w-6 rounded-md bg-linear-to-br from-accent-indigo to-accent-cyan text-[10px]"
          />
        </Button>
      </Tooltip>

      <Tooltip content={t("searchLabel")} side="right" sideOffset={10}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={handleSearch}
          aria-label={t("searchLabel")}
        >
          <Search className="h-4 w-4" />
        </Button>
      </Tooltip>

      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {state.groups.map((group, groupIndex) => {
          if (group.mainItems.length === 0) {
            return null;
          }

          return (
            <div key={group.id} className="flex flex-col items-center gap-2">
              {groupIndex > 0 && <div className="h-px w-6 bg-border/60" />}
              {group.mainItems.map((item) => {
                const isActive = pathname === item.route || pathname.startsWith(`${item.route}/`);
                return (
                  <Tooltip key={item.id} content={item.label} side="right" sideOffset={10}>
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
                      {renderRailBadge(item, state.badgeStyle)}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          );
        })}
      </div>

      <Tooltip content={t("customize")} side="right" sideOffset={10}>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
          onClick={onOpenCustomize}
          aria-label={t("customize")}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </Tooltip>
    </aside>
  );
});
