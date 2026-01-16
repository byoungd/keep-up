"use client";
import { cn } from "../utils/cn";
import type { AppShellProps } from "./types";

/**
 * AppShell - A flexible application shell layout with sidebar and optional panels.
 *
 * This is an abstracted version of Reader's AppShell that provides the layout structure
 * without Reader-specific dependencies.
 *
 * Features:
 * - Responsive sidebar with collapse support
 * - Optional left panel (for AI or preview when docked left)
 * - Optional right panel (for AI or preview when docked right)
 * - Customizable header
 * - Mobile-first approach
 */
export function AppShell({
  children,
  sidebar,
  sidebarCollapsed,
  leftPanel,
  rightPanel,
  header,
  showSidebar = true,
  isSidebarCollapsed = false,
  isLeftPanelVisible = false,
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

      {/* Left Panel (beside sidebar) */}
      {leftPanel && isLeftPanelVisible && (
        <div className="hidden lg:flex shrink-0 border-r border-border h-full">{leftPanel}</div>
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
              <div className="hidden lg:flex shrink-0 border-l border-border h-full">
                {rightPanel}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
