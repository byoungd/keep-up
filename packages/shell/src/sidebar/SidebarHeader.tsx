"use client";

import { PanelLeft, Search } from "lucide-react";
import * as React from "react";
import { cn } from "../utils/cn";
import type { SidebarHeaderProps } from "./types";

/**
 * Default avatar component - simple initial-based avatar.
 */
const DefaultAvatar: React.FC<{ name: string; url?: string }> = ({ name, url }) => {
  const initial = name?.trim().charAt(0).toUpperCase() || "W";

  if (url) {
    return <img src={url} alt={name} className="h-6 w-6 rounded-md object-cover" />;
  }

  return (
    <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-fine font-medium text-white">
      {initial}
    </div>
  );
};

/**
 * SidebarHeader - The header section of the sidebar with workspace info and actions.
 *
 * Extracted from Reader's sidebar for shared use.
 */
export const SidebarHeader = React.memo(function SidebarHeader({
  workspaceName = "My Workspace",
  workspaceAvatarUrl,
  className,
  onSearch,
  onToggleCollapse,
  renderAvatar,
}: SidebarHeaderProps) {
  const AvatarComponent = renderAvatar ?? DefaultAvatar;

  return (
    <div className={cn("sidebar-header px-4 py-2 space-y-2", className)}>
      {/* Row 1: Workspace & Actions */}
      <div className="flex items-center gap-2">
        {/* Avatar */}
        <div className="shrink-0 h-6 w-6">
          <AvatarComponent name={workspaceName} url={workspaceAvatarUrl} />
        </div>

        {/* Workspace Switcher */}
        {/* Workspace Name */}
        <div className="flex items-center gap-2 flex-1 py-1.5 -ml-1 px-1">
          <span className="text-sm font-semibold text-foreground truncate flex-1 text-left">
            {workspaceName}
          </span>
        </div>

        {/* Toggle Sidebar */}
        {onToggleCollapse && (
          <button
            type="button"
            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 rounded-md hover:bg-surface-2"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Row 2: Search */}
      {onSearch && (
        <button
          type="button"
          className={cn(
            "w-full flex items-center justify-start gap-2 h-8 px-2.5 rounded-md",
            "bg-surface-2/70 hover:bg-surface-2 text-muted-foreground hover:text-foreground",
            "transition-colors"
          )}
          onClick={onSearch}
        >
          <Search className="h-4 w-4" />
          <span className="text-xs font-medium flex-1 text-left">Search...</span>
          <kbd className="text-micro text-foreground/80 bg-surface-3/60 px-1.5 py-0.5 rounded">
            ⌘K
          </kbd>
        </button>
      )}
    </div>
  );
});
