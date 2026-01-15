"use client";

import { cn } from "@ku0/shared/utils";
import type * as React from "react";

export interface RailTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface RailTabsProps {
  tabs: RailTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

/**
 * Tab bar for Right Rail content switching.
 * Keyboard accessible with arrow navigation.
 */
export function RailTabs({ tabs, activeTab, onTabChange, className }: RailTabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        nextIndex = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        nextIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    onTabChange(tabs[nextIndex].id);
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex items-center gap-1 px-2 py-1.5 border-b border-border/40 bg-surface-2/30",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isActive
                ? "bg-surface-1 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-1/50"
            )}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface RailTabPanelProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Tab panel content that shows when its tab is active.
 */
export function RailTabPanel({ id, activeTab, children, className }: RailTabPanelProps) {
  if (id !== activeTab) {
    return null;
  }

  return (
    <div
      id={`tabpanel-${id}`}
      role="tabpanel"
      aria-labelledby={id}
      className={cn("flex-1 overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}
