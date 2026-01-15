"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "../utils/cn";
import { SidebarItem } from "./SidebarItem";
import type { SidebarGroupProps, SidebarNavItem } from "./types";

/**
 * SidebarGroup - A collapsible group of sidebar navigation items.
 *
 * Extracted from Reader's sidebar for shared use.
 */
export const SidebarGroup = React.memo(function SidebarGroup({
  id,
  label,
  collapsible,
  collapsed,
  items,
  badgeStyle,
  activePath,
  onToggleCollapse,
  renderItem,
  LinkComponent,
}: SidebarGroupProps) {
  if (items.length === 0) {
    return null;
  }

  const listId = `sidebar-group-${id}`;

  const renderDefaultItem = (item: SidebarNavItem, _isActive: boolean) => {
    const isExactMatch = activePath === item.route;
    const isChildActive = activePath.startsWith(`${item.route}/`);
    const isActiveLeaf = isExactMatch && !isChildActive;
    const isContextSelected = !isExactMatch && (isChildActive || activePath.startsWith(item.route));

    return (
      <SidebarItem
        key={item.id}
        id={item.id}
        label={item.label}
        icon={item.icon}
        href={item.route}
        isActive={isActiveLeaf || isExactMatch}
        isContextSelected={isContextSelected}
        badgeCount={item.badgeCount}
        badgeStyle={badgeStyle}
        locked={item.locked}
        LinkComponent={LinkComponent}
      />
    );
  };

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
          {items.map((item) => {
            const isActive = activePath === item.route || activePath.startsWith(`${item.route}/`);
            if (renderItem) {
              return <React.Fragment key={item.id}>{renderItem(item, isActive)}</React.Fragment>;
            }
            return renderDefaultItem(item, isActive);
          })}
        </div>
      )}
    </div>
  );
});
