"use client";
import { cn } from "../utils/cn";
import type { AppShellProps } from "./types";

/**
 * AppShell - A flexible application shell layout with sidebar and optional right panel.
 *
 * This is an abstracted version of Reader's AppShell that provides the layout structure
 * without Reader-specific dependencies.
 *
 * Features:
 * - Responsive sidebar with collapse support
 * - Optional right panel
 * - Customizable header
 * - Mobile-first approach
 */
export function AppShell({
  children,
  sidebar,
  sidebarCollapsed,
  rightPanel,
  header,
  showSidebar = true,
  isSidebarCollapsed = false,
  isRightPanelVisible = false,
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full overflow-hidden font-sans text-foreground bg-background",
        className
      )}
    >
      {/* Sidebar (Desktop) */}
      {showSidebar && (
        <div className="hidden lg:flex">{isSidebarCollapsed ? sidebarCollapsed : sidebar}</div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        {header}

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full w-full flex">
            {/* Center content */}
            <div className="flex-1 min-w-0">{children}</div>

            {/* Right panel */}
            {rightPanel && isRightPanelVisible && (
              <div className="hidden lg:block shrink-0 border-l border-border">{rightPanel}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
