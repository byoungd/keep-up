"use client";

import { type Collaborator, PresenceAvatars } from "@/components/collab/PresenceAvatars";
import { SyncStatusIndicator } from "@/components/collab/SyncStatusIndicator";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { useDocumentHeader } from "@/hooks/useDocumentHeader";
import { useSyncStatus } from "@/lib/collab/useSyncStatus";
import { getPresenceColorByIndex } from "@/lib/theme/presenceColors";
import { cn } from "@/lib/utils";
import { BookOpen, Github, Globe, PanelLeft, PanelRight, Rss, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AppearanceMenu } from "./AppearanceMenu";
import { useSidebarState } from "./sidebar";

// Mock collaborators for demo - replace with real presence data
const DEMO_COLLABORATORS: Collaborator[] = [
  { id: "1", name: "Alice", color: getPresenceColorByIndex(1) },
  { id: "2", name: "Bob", color: getPresenceColorByIndex(7) },
];

const SOURCE_ICONS = {
  local: BookOpen,
  github: Github,
  rss: Rss,
  url: Globe,
} as const;

interface HeaderProps {
  docId?: string;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  isRightPanelOpen?: boolean;
}

export function Header({
  docId = "demo-doc",
  onToggleLeft,
  onToggleRight,
  isRightPanelOpen,
}: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const syncStatus = useSyncStatus();
  const t = useTranslations("Header");
  const { title, sourceType } = useDocumentHeader(docId);
  const { isCollapsed, expandSidebar } = useSidebarState();

  const SourceIcon = SOURCE_ICONS[sourceType || "local"];

  return (
    <header className="flex h-12 items-center justify-between px-4 bg-background/80 backdrop-blur-md border-b border-border/20 z-20 w-full select-none">
      <div className="flex items-center gap-3">
        {/* Sidebar expand button - shows when sidebar is collapsed */}
        {isCollapsed && (
          <Tooltip content="Expand sidebar" side="right" sideOffset={8}>
            <Button
              variant="ghost"
              size="icon"
              onClick={expandSidebar}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}

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
          <span className="text-sm font-semibold tracking-tight text-foreground/90">Reader</span>
          <span className="text-muted-foreground/40 text-xs">/</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-surface-2 px-1.5 py-0.5">
            <SourceIcon className="h-3.5 w-3.5" />
            <span className="font-medium max-w-[200px] truncate">{title}</span>
          </div>
        </div>

        <div className="hidden md:flex h-3 w-px bg-border/40 mx-2" />

        <SyncStatusIndicator status={syncStatus} />

        <div className="hidden md:flex h-3 w-px bg-border/40 mx-2" />

        <PresenceAvatars collaborators={DEMO_COLLABORATORS} />
      </div>

      <div className="flex items-center gap-1.5">
        {/* View Settings */}
        <div className="relative">
          <Tooltip content={t("appearanceTooltip")} side="bottom" sideOffset={8}>
            <Button
              variant={showSettings ? "subtle" : "ghost"}
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "h-8 w-8 p-0 rounded-md transition-all text-muted-foreground hover:text-foreground",
                showSettings && "bg-surface-2 text-foreground"
              )}
              aria-label={t("appearanceTooltip")}
            >
              <Type className="h-4 w-4" />
            </Button>
          </Tooltip>
          {showSettings && <AppearanceMenu onClose={() => setShowSettings(false)} />}
        </div>

        <div className="h-3 w-px bg-border/40 mx-1" />

        {/* Panel Toggles */}
        <div className="flex items-center gap-0.5">
          <Tooltip
            content={t("toggleAi", { shortcut: "⌘+2" })}
            side="bottom"
            align="end"
            sideOffset={8}
          >
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
              aria-label={t("toggleAi", { shortcut: "⌘+2" })}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
