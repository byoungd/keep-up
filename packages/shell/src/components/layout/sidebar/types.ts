import type { ReactNode } from "react";
import type { EffectiveSidebarItem } from "../../../lib/sidebar";

export interface SidebarItemRenderProps {
  item: EffectiveSidebarItem;
  activePath: string;
  isActive: boolean;
  isContextSelected: boolean;
}

export type SidebarItemRenderer = (props: SidebarItemRenderProps) => ReactNode;
