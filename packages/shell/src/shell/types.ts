import type { SidebarCollapseMode } from "../sidebar/types";

/** Props for the app shell layout container */
export interface AppShellProps {
  children: React.ReactNode;
  /** Sidebar content */
  sidebar?: React.ReactNode;
  /** Collapsed sidebar content (rail) */
  sidebarCollapsed?: React.ReactNode;
  /** Left panel content (beside sidebar, for AI or preview) */
  leftPanel?: React.ReactNode;
  /** Right panel content */
  rightPanel?: React.ReactNode;
  /** Header content */
  header?: React.ReactNode;
  /** Whether to show the sidebar on desktop */
  showSidebar?: boolean;
  /** Sidebar collapse mode */
  sidebarCollapseMode?: SidebarCollapseMode;
  /** Whether sidebar is collapsed */
  isSidebarCollapsed?: boolean;
  /** Callback when sidebar collapse state changes */
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  /** Whether left panel is visible */
  isLeftPanelVisible?: boolean;
  /** Whether right panel is visible */
  isRightPanelVisible?: boolean;
  /** Callback when right panel visibility changes */
  onRightPanelVisibleChange?: (visible: boolean) => void;
  /** Additional class name */
  className?: string;
}

/** Props for a resizable three-pane layout */
export interface ThreePaneLayoutProps {
  /** Left panel content */
  leftPanel?: React.ReactNode;
  /** Center panel content (main content) */
  centerPanel: React.ReactNode;
  /** Right panel content */
  rightPanel?: React.ReactNode;
  /** Whether left panel is visible */
  isLeftVisible?: boolean;
  /** Whether right panel is visible */
  isRightVisible?: boolean;
  /** Callback when layout changes */
  onLayoutChange?: (sizes: [number, number, number]) => void;
  /** Class name for the container */
  className?: string;
}
