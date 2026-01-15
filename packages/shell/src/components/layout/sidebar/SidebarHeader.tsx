"use client";

import { cn } from "@ku0/shared/utils";
import { ChevronDown, PanelLeft, Plus, Search } from "lucide-react";
import * as React from "react";
// import { useImportContextOptional } from "@/context/ImportContext";
import { useReaderShell } from "../../../context/ReaderShellContext";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";

interface SidebarHeaderProps {
  className?: string;
  workspaceName?: string;
  workspaceAvatarUrl?: string;
  onOpenSearch?: () => void;
  onOpenImport?: () => void;
}

export const SidebarHeader = React.memo(function SidebarHeader({
  workspaceName = "My Workspace",
  workspaceAvatarUrl,
  className,
  onOpenSearch,
  onOpenImport,
}: SidebarHeaderProps) {
  const { sidebar, i18n } = useReaderShell();
  const t = (key: string) => i18n.t(`Sidebar.${key}`, key);
  const { toggle: toggleCollapsed } = sidebar;
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
    <div className={cn("sidebar-header px-3 py-2 space-y-2", className)}>
      {/* Row 1: Workspace & Actions */}
      <div className="flex items-center gap-2">
        {/* Toggle / Avatar Zone */}
        <div className="relative group/toggle shrink-0 h-6 w-6">
          <Avatar
            size="sm"
            src={workspaceAvatarUrl}
            fallback={workspaceInitial}
            className="h-6 w-6 rounded-md bg-linear-to-br from-accent-indigo to-accent-cyan text-[11px] transition-opacity duration-200 group-hover/toggle:opacity-0"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-200 z-10">
            <Tooltip content={t("collapse")} side="right">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed();
                }}
                aria-label={t("collapse")}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Workspace Switcher */}
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 flex-1 py-1.5 rounded-lg -ml-1 px-1",
            "hover:bg-surface-2 transition-colors group",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          )}
        >
          <span className="text-sm font-semibold text-foreground truncate flex-1 text-left">
            {workspaceName || t("workspace")}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Create (+) */}
        <Tooltip
          content={
            <span className="flex items-center gap-2">
              {t("create")}
              <kbd className="text-[10px] bg-surface-3 px-1.5 py-0.5 rounded">⌘N</kbd>
            </span>
          }
          side="bottom"
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
            aria-label={t("create")}
            onClick={() => onOpenImport?.()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>

      {/* Row 2: Search */}
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "w-full justify-start gap-3 h-8 px-3",
          "bg-background hover:bg-surface-2 text-muted-foreground hover:text-foreground",
          "border-border/50 shadow-xs"
        )}
        onClick={handleSearch}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium flex-1 text-left">{t("searchPlaceholder")}</span>
        <kbd className="text-[10px] text-foreground/80 bg-surface-2 px-1.5 py-0.5 rounded border border-border/50">
          ⌘K
        </kbd>
      </Button>
    </div>
  );
});
