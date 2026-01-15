import { Bookmark, FolderKanban, Inbox, Library, Rss, Settings, Sparkles } from "lucide-react";
import type { SidebarGroupDefinition } from "./types";

export const DEFAULT_SIDEBAR_GROUPS: SidebarGroupDefinition[] = [
  {
    id: "primary",
    label: "Primary",
    collapsible: false,
    defaultCollapsed: false,
    items: [
      {
        id: "unread",
        label: "Unread",
        icon: Inbox,
        route: "/unread",
        defaultVisibility: "ALWAYS",
        locked: true,
      },
      {
        id: "digest",
        label: "Today",
        icon: Sparkles,
        route: "/digest",
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
        id: "saved",
        label: "Saved",
        icon: Bookmark,
        route: "/saved",
        defaultVisibility: "ALWAYS",
      },
    ],
  },
  {
    id: "organize",
    label: "Organize",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      {
        id: "projects",
        label: "Projects",
        icon: FolderKanban,
        route: "/projects",
        defaultVisibility: "ALWAYS",
      },
      {
        id: "feeds",
        label: "Feeds",
        icon: Rss,
        route: "/feeds",
        defaultVisibility: "ALWAYS",
        featureFlag: "feeds",
      },
    ],
  },
  {
    id: "utilities",
    label: "Utilities",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        route: "/settings",
        defaultVisibility: "HIDE_IN_MORE",
      },
    ],
  },
];

export const DEFAULT_BADGE_STYLE = "COUNT" as const;
export const SIDEBAR_CONFIG_STORAGE_KEY = "sidebar-config-v1";
export const DEFAULT_COLLAPSE_MODE = "peek" as const;
