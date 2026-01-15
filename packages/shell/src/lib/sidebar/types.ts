import type { LucideIcon } from "lucide-react";

// Visibility policy for sidebar items
export type SidebarVisibilityPolicy = "ALWAYS" | "WHEN_BADGED" | "HIDE_IN_MORE";

// Badge display style
export type SidebarBadgeStyle = "COUNT" | "DOT";
export type SidebarCollapseMode = "peek" | "rail";

// A single sidebar item definition (static, from defaults)
export interface SidebarItemDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  badgeSource?: () => number; // Function to compute badge count
  defaultVisibility: SidebarVisibilityPolicy;
  locked?: boolean; // If true, item cannot be hidden
  permissions?: string[]; // Required permissions to show this item
  featureFlag?: string; // Optional feature flag key to gate visibility
}

// A sidebar group definition (static, from defaults)
export interface SidebarGroupDefinition {
  id: string;
  label: string;
  collapsible: boolean;
  defaultCollapsed: boolean;
  items: SidebarItemDefinition[];
}

// User-saved configuration for a single item
export interface SidebarItemUserConfig {
  visibility: SidebarVisibilityPolicy;
}

// User-saved configuration for a group
export interface SidebarGroupUserConfig {
  collapsed: boolean;
  itemOrder: string[]; // Item IDs in user-specified order
}

// Complete user-saved sidebar configuration
export interface SidebarUserConfig {
  version: number;
  badgeStyle: SidebarBadgeStyle;
  collapseMode: SidebarCollapseMode;
  groups: Record<string, SidebarGroupUserConfig>;
  items: Record<string, SidebarItemUserConfig>;
}

// Computed/effective item (after merging defaults + user config + permissions)
export interface EffectiveSidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  route: string;
  badgeCount: number;
  visibility: SidebarVisibilityPolicy;
  locked: boolean;
  inMainList: boolean; // Whether to show in main list or More menu
}

// Computed/effective group
export interface EffectiveSidebarGroup {
  id: string;
  label: string;
  collapsible: boolean;
  collapsed: boolean;
  mainItems: EffectiveSidebarItem[];
  moreItems: EffectiveSidebarItem[];
}

// Complete effective sidebar state
export interface EffectiveSidebarState {
  groups: EffectiveSidebarGroup[];
  badgeStyle: SidebarBadgeStyle;
  collapseMode: SidebarCollapseMode;
}
