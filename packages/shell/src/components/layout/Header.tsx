"use client";

import { cn } from "@ku0/shared/utils";
import { PanelLeft, PanelRight, Square } from "lucide-react";

import { useReaderShell } from "../../context/ReaderShellContext";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

export interface HeaderProps {
  docId?: string; // Kept for API consistency if needed
  title?: string;
  sourceType?: "local" | "github" | "rss" | "url";
  onToggleLeft: () => void;
  onToggleRight: () => void;
  isRightPanelOpen?: boolean;
  rightPanelPosition?: "left" | "right";
  rightPanelLabel?: string;
  syncIndicator?: React.ReactNode;
  presenceAvatars?: React.ReactNode;
  globalActions?: React.ReactNode;
  appName?: string;
}

export function Header({
  onToggleLeft,
  onToggleRight,
  isRightPanelOpen,
  rightPanelPosition,
  rightPanelLabel,
  syncIndicator,
  presenceAvatars,
  globalActions,
}: HeaderProps) {
  const { sidebar, aiPanel, i18n } = useReaderShell();
  const t = (key: string, values?: Record<string, string | number>, defaultValue?: string) =>
    i18n.t(`Header.${key}`, values ?? defaultValue ?? key, defaultValue);
  const { isCollapsed, toggle: toggleCollapsed } = sidebar;
  const { position: aiPanelPosition } = aiPanel;

  const resolvedPanelPosition =
    rightPanelPosition ?? (aiPanelPosition === "left" ? "left" : "right");
  const GlobalAiIcon =
    aiPanelPosition === "main" && !rightPanelPosition
      ? Square
      : resolvedPanelPosition === "left"
        ? PanelLeft
        : PanelRight;

  const expandLabel = t("expand", undefined, "Expand sidebar");
  const collapseLabel = t("collapse", undefined, "Collapse sidebar");

  const toggleLabel =
    rightPanelLabel ?? t("toggleAi", { shortcut: "⌘+2" }, "Toggle AI Companion (⌘+2)");

  return (
    <header
      className={cn(
        "absolute top-0 left-0 right-0 z-50 flex items-start justify-between p-3 pointer-events-none"
      )}
    >
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Sidebar expand button - shows when sidebar is collapsed */}
        <Tooltip content={isCollapsed ? expandLabel : collapseLabel} side="right" sideOffset={8}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className={cn(
              "h-6 w-6 text-muted-foreground hover:text-foreground",
              !isCollapsed && "hidden"
            )}
            aria-label={isCollapsed ? expandLabel : collapseLabel}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </Tooltip>

        {/* Mobile toggle - hidden on desktop */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleLeft}
          className="md:hidden lg:hidden text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {syncIndicator}

        <div className="hidden md:flex h-3 w-px bg-border/40 mx-2" />

        {presenceAvatars}
      </div>

      <div className="flex items-center gap-1.5 pointer-events-auto">
        {globalActions}
        {/* Panel Toggles */}
        <div className="flex items-center gap-0.5">
          <Tooltip content={toggleLabel} side="bottom" align="end" sideOffset={8}>
            <Button
              variant={isRightPanelOpen ? "subtle" : "ghost"}
              size="compact"
              onClick={onToggleRight}
              className={cn(
                "h-8 w-8 p-0 transition-all rounded-md",
                isRightPanelOpen
                  ? "bg-surface-2 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              )}
              aria-label={toggleLabel}
            >
              <GlobalAiIcon className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
