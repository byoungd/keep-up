"use client";

import { cn } from "@ku0/shared/utils";
import { PanelLeft, Square } from "lucide-react";

import { useReaderShell } from "../../context/ReaderShellContext";
import { Button } from "../ui/Button";
import {
  SidebarLeftFilledIcon,
  SidebarLeftIcon,
  SidebarRightFilledIcon,
  SidebarRightIcon,
} from "../ui/SidebarIcons";
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
  /** Custom content to render after the Toggle on the left side */
  leftSlot?: React.ReactNode;
  /** Custom content to render before the Panel Toggle on the right side */
  rightSlot?: React.ReactNode;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy code
export function Header({
  onToggleLeft,
  onToggleRight,
  isRightPanelOpen,
  rightPanelPosition,
  rightPanelLabel,
  leftSlot,
  rightSlot,
}: HeaderProps) {
  const { sidebar, aiPanel, i18n } = useReaderShell();
  const t = (key: string, values?: Record<string, string | number>, defaultValue?: string) =>
    i18n.t(`Header.${key}`, values ?? defaultValue ?? key, defaultValue);
  const { isCollapsed, setCollapsed } = sidebar;
  const { position: aiPanelPosition } = aiPanel;

  // When in peek mode (sidebar collapsed but hovering), clicking toggle should fully expand
  const handleToggle = () => {
    setCollapsed(!isCollapsed);
  };

  const resolvedPanelPosition =
    rightPanelPosition ?? (aiPanelPosition === "left" ? "left" : "right");

  let GlobalAiIcon: React.ElementType | undefined;
  if (aiPanelPosition === "main" && !rightPanelPosition) {
    GlobalAiIcon = Square;
  } else if (resolvedPanelPosition === "left") {
    GlobalAiIcon = isRightPanelOpen ? SidebarLeftFilledIcon : SidebarLeftIcon;
  } else {
    GlobalAiIcon = isRightPanelOpen ? SidebarRightFilledIcon : SidebarRightIcon;
  }

  const expandLabel = t("expand", undefined, "Expand sidebar");
  const collapseLabel = t("collapse", undefined, "Collapse sidebar");

  const toggleLabel =
    rightPanelLabel ?? t("toggleAi", { shortcut: "⌘+2" }, "Toggle AI Companion (⌘+2)");

  return (
    <header className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
      {/* Left floating control - Toggle + leftSlot */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-auto">
        <Tooltip content={isCollapsed ? expandLabel : collapseLabel} side="right" sideOffset={8}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggle}
            className={cn(
              "h-6 w-6 text-muted-foreground hover:text-foreground",
              !isCollapsed && "hidden"
            )}
            aria-label={isCollapsed ? expandLabel : collapseLabel}
          >
            <SidebarLeftIcon className="h-4 w-4" />
          </Button>
        </Tooltip>

        {/* Mobile toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleLeft}
          className="md:hidden lg:hidden text-muted-foreground hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {leftSlot}
      </div>

      {/* Right floating control - rightSlot + Panel toggle */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        {rightSlot}
        <Tooltip content={toggleLabel} side="bottom" align="end" sideOffset={8}>
          <Button
            variant={isRightPanelOpen ? "subtle" : "ghost"}
            size="compact"
            onClick={onToggleRight}
            className={cn(
              "h-8 w-8 p-0 transition-all duration-fast rounded-md",
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
    </header>
  );
}
