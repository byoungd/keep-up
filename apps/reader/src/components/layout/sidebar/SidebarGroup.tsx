"use client";
import { FeedsSidebarSection } from "@/components/feeds/FeedsSidebarSection";
import type { EffectiveSidebarItem, SidebarBadgeStyle } from "@/lib/sidebar";
import { FeedProvider } from "@/providers/FeedProvider";
import { cn } from "@ku0/shared/utils";
import { ChevronRight } from "lucide-react";
import * as React from "react";
import { SidebarItem } from "./SidebarItem";

interface SidebarGroupProps {
  id: string;
  label: string;
  collapsible: boolean;
  collapsed: boolean;
  mainItems: EffectiveSidebarItem[];
  badgeStyle: SidebarBadgeStyle;
  activePath: string;
  onToggleCollapse: () => void;
  onAddFeed?: () => void;
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
  onAddFeed,
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
            "flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-bold",
            "text-foreground/80 hover:text-foreground transition-colors",
            "group uppercase tracking-wider rounded-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center h-3 w-3 shrink-0 transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          >
            <ChevronRight className="h-3 w-3" />
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

            return (
              <React.Fragment key={item.id}>
                <SidebarItem
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  href={item.route}
                  isActive={isActiveLeaf || (isExactMatch && item.id !== "feeds")}
                  isContextSelected={
                    isContextSelected || (item.id === "feeds" && activePath.startsWith("/feeds"))
                  }
                  badgeCount={item.badgeCount}
                  badgeStyle={badgeStyle}
                  locked={item.locked}
                />
                {/* Nested Feeds Section */}
                {item.id === "feeds" && activePath.startsWith("/feeds") && (
                  <div className="ml-4 pl-2 border-l border-border/30 my-1 animate-in slide-in-from-left-1 duration-200 fade-in-0">
                    <FeedProvider>
                      <FeedsSidebarSection onAddFeed={onAddFeed} />
                    </FeedProvider>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
});
