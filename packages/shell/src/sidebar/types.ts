import type { LucideIcon } from "lucide-react";

/** Badge display style for sidebar items */
export type SidebarBadgeStyle = "COUNT" | "DOT";

/** Collapse mode for the sidebar */
export type SidebarCollapseMode = "peek" | "rail";

/** Individual sidebar navigation item */
export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  badgeCount?: number;
  locked?: boolean;
}

/** Group of sidebar items */
export interface SidebarGroup {
  id: string;
  label: string;
  collapsible: boolean;
  collapsed: boolean;
  items: SidebarNavItem[];
}

/** Props for the resizable sidebar container */
export interface ResizableSidebarProps {
  children: React.ReactNode;
  collapsedContent?: React.ReactNode;
  className?: string;
  collapseMode?: SidebarCollapseMode;
  /** Whether the sidebar is collapsed */
  isCollapsed?: boolean;
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Initial width in pixels */
  defaultWidth?: number;
  /** Minimum width when expanded */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Storage key for persisting width */
  storageKey?: string;
}

/** Props for individual sidebar item */
export interface SidebarItemProps {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  isActive: boolean;
  isContextSelected?: boolean;
  badgeCount?: number;
  badgeStyle?: SidebarBadgeStyle;
  locked?: boolean;
  /** Custom Link component for routing */
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: "page" | undefined;
  }>;
}

/** Props for sidebar group */
export interface SidebarGroupProps {
  id: string;
  label: string;
  collapsible: boolean;
  collapsed: boolean;
  items: SidebarNavItem[];
  badgeStyle: SidebarBadgeStyle;
  activePath: string;
  onToggleCollapse: () => void;
  /** Render prop for custom item rendering */
  renderItem?: (item: SidebarNavItem, isActive: boolean) => React.ReactNode;
  /** Custom Link component for routing */
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: "page" | undefined;
  }>;
}

/** Props for sidebar header */
export interface SidebarHeaderProps {
  workspaceName?: string;
  workspaceAvatarUrl?: string;
  className?: string;
  /** Callback when search is triggered */
  onSearch?: () => void;
  /** Callback when create action is triggered */
  onCreate?: () => void;
  /** Callback to toggle sidebar collapse */
  onToggleCollapse?: () => void;
  /** Custom avatar component */
  renderAvatar?: (props: { name: string; url?: string }) => React.ReactNode;
}

/** Props for sidebar rail (collapsed view) */
export interface SidebarRailProps {
  groups: SidebarGroup[];
  badgeStyle: SidebarBadgeStyle;
  activePath: string;
  isLoading?: boolean;
  workspaceName?: string;
  workspaceAvatarUrl?: string;
  onSearch?: () => void;
  onOpenCustomize?: () => void;
  /** Custom Link component for routing */
  LinkComponent?: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
    "aria-current"?: "page" | undefined;
  }>;
  /** Custom avatar component */
  renderAvatar?: (props: { name: string; url?: string }) => React.ReactNode;
  /** Custom tooltip component */
  renderTooltip?: (props: { content: string; children: React.ReactNode }) => React.ReactNode;
}
