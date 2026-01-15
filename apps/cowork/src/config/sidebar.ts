import type { SidebarGroupDefinition } from "@ku0/shell";
import { MessageSquare, Settings, Sparkles } from "lucide-react";

export const COWORK_SIDEBAR_GROUPS: SidebarGroupDefinition[] = [
  {
    id: "main",
    label: "Main",
    collapsible: false,
    defaultCollapsed: false,
    items: [
      {
        id: "chat",
        label: "Chat",
        icon: MessageSquare,
        route: "/",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        route: "/settings",
        defaultVisibility: "ALWAYS",
      },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        id: "new-session",
        label: "New Session",
        icon: Sparkles,
        route: "/new-session",
        defaultVisibility: "ALWAYS",
      },
    ],
  },
];

export const COWORK_SIDEBAR_CONFIG_KEY = "cowork-sidebar-v1";
