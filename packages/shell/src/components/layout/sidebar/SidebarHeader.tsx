"use client";

import { cn } from "@ku0/shared/utils";
import { PanelLeft, Search } from "lucide-react";
import * as React from "react";
// import { useImportContextOptional } from "@/context/ImportContext";
import { useReaderShell } from "../../../context/ReaderShellContext";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";
import type { SidebarNewAction } from "./types";

interface SidebarHeaderProps {
  className?: string;
  workspaceName?: string;
  workspaceAvatarUrl?: string;
  onOpenSearch?: () => void;
  onOpenImport?: () => void;
  newAction?: SidebarNewAction;
  showSearch?: boolean;
}

export const SidebarHeader = React.memo(function SidebarHeader({
  workspaceName = "My Workspace",
  workspaceAvatarUrl,
  className,
  onOpenSearch,
  showSearch = true,
}: SidebarHeaderProps) {
  const { sidebar, i18n } = useReaderShell();
  const t = (key: string) => i18n.t(`Sidebar.${key}`, key);
  const { toggle: toggleCollapsed, isCollapsed } = sidebar;
  // const importContext = useImportContextOptional(); // Removed

  const workspaceInitial = React.useMemo(
    () => workspaceName?.trim().charAt(0).toUpperCase() || "W",
    [workspaceName]
  );

  const handleSearch = React.useCallback(() => {
    if (onOpenSearch) {
      onOpenSearch();
      return;
    }
    // open(workspaceName ? `${workspaceName} ` : "");
  }, [onOpenSearch]);

  return (
    <div className={cn("sidebar-header px-3 py-3 space-y-2", className)}>
      {/* Row 1: Workspace & Actions */}
      <div className="flex items-center gap-2">
        {/* Toggle / Avatar Zone - Show Avatar when expanded, Hide when collapsed */}
        {!isCollapsed && (
          <div className="relative group/toggle shrink-0 h-6 w-6">
            <Avatar
              size="sm"
              src={workspaceAvatarUrl}
              fallback={workspaceInitial}
              className="h-6 w-6 rounded-md bg-linear-to-br from-accent-indigo to-accent-cyan text-fine"
            />
          </div>
        )}

        {/* Workspace Switcher */}
        {/* Workspace Name */}
        {!isCollapsed && (
          <div className="flex items-center gap-2 flex-1 py-1.5 -ml-1 px-1 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate flex-1 text-left">
              {workspaceName || t("workspace")}
            </span>
          </div>
        )}

        {/* Toggle Sidebar - Always visible so user can collapse/expand */}
        <Tooltip content={isCollapsed ? t("expand") : t("collapse")} side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] shrink-0"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? t("expand") : t("collapse")}
            title={isCollapsed ? t("expand") : t("collapse")}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* Row 2: Search */}
      {showSearch ? (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start gap-2.5 h-8 px-2.5",
            "bg-surface-2/50 hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground transition-colors"
          )}
          onClick={handleSearch}
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium flex-1 text-left">{t("searchPlaceholder")}</span>
          <kbd className="text-micro text-foreground/80 bg-surface-3/60 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </Button>
      ) : null}
    </div>
  );
});
