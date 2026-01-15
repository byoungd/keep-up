"use client";

import { cn } from "@ku0/shared/utils";
import {
  BookOpen,
  Github,
  Globe,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Rss,
} from "lucide-react";

import { useReaderShell } from "../../context/ReaderShellContext";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";

const SOURCE_ICONS = {
  local: BookOpen,
  github: Github,
  rss: Rss,
  url: Globe,
} as const;

export interface HeaderProps {
  docId?: string; // Kept for API consistency if needed
  title?: string;
  sourceType?: "local" | "github" | "rss" | "url";
  onToggleLeft: () => void;
  onToggleRight: () => void;
  isRightPanelOpen?: boolean;
  syncIndicator?: React.ReactNode;
  presenceAvatars?: React.ReactNode;
  globalActions?: React.ReactNode;
  appName?: string;
}

export function Header({
  title = "Untitled",
  sourceType = "local",
  onToggleLeft,
  onToggleRight,
  isRightPanelOpen,
  syncIndicator,
  presenceAvatars,
  globalActions,
  appName = "Reader",
}: HeaderProps) {
  const { sidebar, aiPanel, i18n } = useReaderShell();
  const t = (key: string, values?: Record<string, string | number>, defaultValue?: string) =>
    i18n.t(`Header.${key}`, values ?? defaultValue ?? key, defaultValue);
  const { isCollapsed, toggle: toggleCollapsed } = sidebar;
  const { position: aiPanelPosition } = aiPanel;

  // Determine icon based on AI panel position
  const GlobalAiIcon =
    aiPanelPosition === "left"
      ? PanelLeft
      : aiPanelPosition === "main"
        ? MessageSquareText
        : PanelRight;

  const SourceIcon = SOURCE_ICONS[sourceType || "local"];
  const expandLabel = t("expand", undefined, "Expand sidebar");
  const collapseLabel = t("collapse", undefined, "Collapse sidebar");

  const toggleLabel = t("toggleAi", { shortcut: "⌘+2" }, "Toggle AI Companion (⌘+2)");

  return (
    <header className="relative flex h-12 items-center justify-between px-3 bg-background/80 backdrop-blur-md border-b border-border/20 z-10 select-none">
      <div className="flex items-center gap-2">
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
            <PanelLeft className="h-3.5 w-3.5" />
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

        <div className="flex items-center gap-2 group cursor-default">
          <span className="text-sm font-semibold tracking-tight text-foreground/90">{appName}</span>
          <span className="text-muted-foreground/40 text-xs">/</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-surface-2 px-1.5 py-0.5">
            <SourceIcon className="h-3.5 w-3.5" />
            <span className="font-medium max-w-[200px] truncate">{title}</span>
          </div>
        </div>

        <div className="hidden md:flex h-3 w-px bg-border/40 mx-2" />

        {syncIndicator}

        <div className="hidden md:flex h-3 w-px bg-border/40 mx-2" />

        {presenceAvatars}
      </div>

      <div className="flex items-center gap-1.5">
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
