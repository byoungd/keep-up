"use client";

import { cn } from "@ku0/shared/utils";

import { useReaderShell } from "../../context/ReaderShellContext";
import { Button } from "../ui/Button";
import { SidebarLeftIcon, SidebarRightFilledIcon, SidebarRightIcon } from "../ui/SidebarIcons";
import { Tooltip } from "../ui/Tooltip";

export interface HeaderProps {
  onToggleRight: () => void;
  isRightPanelOpen?: boolean;
  rightPanelLabel?: string;
  /** Custom content to render after the Toggle on the left side */
  leftSlot?: React.ReactNode;
  /** Custom content to render before the Panel Toggle on the right side */
  rightSlot?: React.ReactNode;
}

export function Header({
  onToggleRight,
  isRightPanelOpen,
  rightPanelLabel,
  leftSlot,
  rightSlot,
}: HeaderProps) {
  const { sidebar, i18n } = useReaderShell();
  const t = (key: string, values?: Record<string, string | number>, defaultValue?: string) =>
    i18n.t(`Header.${key}`, values ?? defaultValue ?? key, defaultValue);
  const { isCollapsed, setCollapsed } = sidebar;

  // When in peek mode (sidebar collapsed but hovering), clicking toggle should fully expand
  const handleToggle = () => {
    setCollapsed(!isCollapsed);
  };

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
              "h-7 w-7 text-muted-foreground hover:text-foreground",
              !isCollapsed && "hidden"
            )}
            aria-label={isCollapsed ? expandLabel : collapseLabel}
          >
            <SidebarLeftIcon className="h-4 w-4" />
          </Button>
        </Tooltip>

        {leftSlot}
      </div>

      {/* Right floating control - rightSlot + Panel toggle */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-auto">
        {rightSlot}
        <Tooltip content={toggleLabel} side="bottom" align="end" sideOffset={8}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleRight}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label={toggleLabel}
          >
            {isRightPanelOpen ? (
              <SidebarRightFilledIcon className="h-4 w-4" />
            ) : (
              <SidebarRightIcon className="h-4 w-4" />
            )}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
