import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * REFERENCE IMPLEMENTATION: Sidebar (The Nervous System)
 *
 * Philosophy (Arc):
 * - Structure: Holds the state.
 * - Material: Subtly distinct from content. Themeable.
 * - Interaction: Resizable, collapsible.
 */

interface SidebarProps {
  className?: string;
  children: React.ReactNode;
}

export function Sidebar({ className, children }: SidebarProps) {
  return (
    <aside
      className={cn(
        // Dimensions
        "h-full w-[240px] flex flex-col shrink-0",
        // Material (Surface-1)
        // Note: We use a slight bg color + standard border for structure
        "bg-surface-1 border-r border-border/50",
        // Typography
        "text-sm font-medium text-muted-foreground",
        className
      )}
    >
      {/* Top: Workspace/Context Switcher */}
      <div className="h-12 flex items-center px-4 border-b border-border/20">
        <span className="text-foreground font-semibold">Workspace</span>
      </div>

      {/* Middle: Scrollable Content (Pinned + Tree) */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">{children}</div>

      {/* Bottom: User/Settings */}
      <div className="h-12 flex items-center px-4 mt-auto hover:bg-surface-2/50 transition-colors cursor-pointer rounded-md mx-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center text-xs text-accent-primary">
          U
        </div>
        <span className="ml-2 text-foreground">User Settings</span>
      </div>
    </aside>
  );
}

/**
 * Sidebar Item (The 'Tab')
 */
export function SidebarItem({
  active,
  icon: Icon,
  label,
}: {
  active?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors select-none",
        // Interaction: Hover state
        "hover:bg-surface-2",
        // State: Active (Arc style: distinct background highlight)
        active && "bg-surface-2 text-foreground shadow-sm"
      )}
    >
      <Icon className="w-4 h-4 opacity-70" />
      <span>{label}</span>
    </div>
  );
}
