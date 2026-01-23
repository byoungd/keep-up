import type { SidebarGroupDefinition } from "@ku0/shell";
import { Brain, LayoutTemplate, Library, Search, SquarePen } from "lucide-react";

export const COWORK_SIDEBAR_GROUPS: SidebarGroupDefinition[] = [
  {
    id: "pinned",
    label: "Pinned",
    collapsible: false,
    defaultCollapsed: false,
    items: [
      {
        id: "new-session",
        label: "New session",
        icon: SquarePen,
        route: "/new-session",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "search",
        label: "Search",
        icon: Search,
        route: "/search",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "library",
        label: "Library",
        icon: Library,
        route: "/library",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "lessons",
        label: "Lessons",
        icon: Brain,
        route: "/lessons",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "foundation",
        label: "Foundation",
        icon: LayoutTemplate,
        route: "/foundation",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
    ],
  },
  {
    id: "primary",
    label: "Primary",
    collapsible: false,
    defaultCollapsed: false,
    items: [],
  },
];

export const COWORK_SIDEBAR_CONFIG_KEY = "cowork-sidebar-v1";
