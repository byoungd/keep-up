import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type {
  EffectiveSidebarGroup,
  EffectiveSidebarItem,
  SidebarBadgeStyle,
} from "../../../lib/sidebar";

export interface SidebarItemRenderProps {
  item: EffectiveSidebarItem;
  activePath: string;
  isActive: boolean;
  isContextSelected: boolean;
}

export type SidebarItemRenderer = (props: SidebarItemRenderProps) => ReactNode;

export type SidebarNewAction = {
  label?: string;
  ariaLabel?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  shortcut?: string;
};

export interface SidebarGroupRenderProps {
  group: EffectiveSidebarGroup;
  defaultGroup: ReactNode;
  badgeStyle: SidebarBadgeStyle;
  activePath: string;
}

export type SidebarGroupRenderer = (props: SidebarGroupRenderProps) => ReactNode;
