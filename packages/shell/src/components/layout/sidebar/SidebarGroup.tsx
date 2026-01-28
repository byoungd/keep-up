"use client";
// import { FeedsSidebarSection } from "@/components/feeds/FeedsSidebarSection";
// import { FeedProvider } from "@/providers/FeedProvider";
import { cn } from "@ku0/shared/utils";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import type { EffectiveSidebarItem, SidebarBadgeStyle } from "../../../lib/sidebar";
import { SidebarItem } from "./SidebarItem";
import type { SidebarItemRenderer } from "./types";

interface SidebarGroupProps {
  id: string;
  label: string;
  collapsible: boolean;
  collapsed: boolean;
  mainItems: EffectiveSidebarItem[];
  badgeStyle: SidebarBadgeStyle;
  activePath: string;
  onToggleCollapse: () => void;
  renderItemChildren?: SidebarItemRenderer;
}

export const SidebarGroup = React.memo(function SidebarGroup({
  id,
  label,
  collapsible,
  collapsed,
  mainItems,
  badgeStyle,
  activePath,
  onToggleCollapse,
  renderItemChildren,
}: SidebarGroupProps) {
  if (mainItems.length === 0) {
    return null;
  }

  const listId = `sidebar-group-${id}`;

  return (
    <div className="sidebar-group space-y-1">
      {collapsible && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className={cn(
            "flex items-center gap-2 w-full px-2 py-1.5 text-fine font-bold",
            "text-foreground/80 hover:text-foreground hover:bg-surface-hover transition-colors duration-fast",
            "group uppercase tracking-wider rounded-md cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center h-3 w-3 shrink-0 transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          >
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </span>
          <span>{label}</span>
        </button>
      )}

      {!collapsed && (
        <div
          id={listId}
          className="space-y-0.5 animate-in slide-in-from-top-1 duration-200 fade-in-0"
        >
          {mainItems.map((item) => {
            const isExactMatch = activePath === item.route;
            const isChildActive =
              activePath.startsWith(`${item.route}/`) ||
              (item.route === "/feeds" && activePath.startsWith("/feeds?"));
            const isActiveLeaf = isExactMatch && !isChildActive;
            const isContextSelected =
              !isExactMatch && (isChildActive || activePath.startsWith(item.route));
            const isActive = isActiveLeaf || (isExactMatch && item.id !== "feeds");

            return (
              <React.Fragment key={item.id}>
                <SidebarItem
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  href={item.route}
                  isActive={isActive}
                  isContextSelected={
                    isContextSelected || (item.id === "feeds" && activePath.startsWith("/feeds"))
                  }
                  badgeCount={item.badgeCount}
                  badgeStyle={badgeStyle}
                  locked={item.locked}
                />
                {renderItemChildren?.({
                  item,
                  activePath,
                  isActive,
                  isContextSelected,
                })}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
});
