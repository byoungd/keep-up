"use client";

import { PanelStateProvider } from "@/context/PanelStateContext";
import type {
  EffectiveSidebarItem,
  EffectiveSidebarState,
  SidebarConfigActions,
} from "@/lib/sidebar";
import { DEFAULT_SIDEBAR_GROUPS } from "@/lib/sidebar/defaults";
import type { Meta, StoryObj } from "@storybook/react";
import { NextIntlClientProvider } from "next-intl";
import { Sidebar } from "./Sidebar";

const messages = {
  Sidebar: {
    customize: "Customize sidebar",
    moreItems: "More items",
    searchPlaceholder: "Search...",
    searchLabel: "Search",
    workspace: "Workspace",
    collapse: "Collapse Sidebar",
    import: "Import...",
  },
  CustomizeSidebar: {
    title: "Customize sidebar",
    close: "Close",
    badgeStyle: "Default badge style",
    badgeStyleCount: "Count",
    badgeStyleDot: "Dot",
    visibilityAlways: "Always show",
    visibilityWhenBadged: "When badged",
    visibilityHideInMore: "Hide in more",
    cancel: "Cancel",
    save: "Save",
    required: "Required",
  },
};

const badgeCounts: Record<string, number> = {
  inbox: 4,
  drafts: 1,
};

const mockState: EffectiveSidebarState = {
  badgeStyle: "COUNT",
  collapseMode: "peek",
  groups: DEFAULT_SIDEBAR_GROUPS.map((group) => {
    const mainItems: EffectiveSidebarItem[] = [];
    const moreItems: EffectiveSidebarItem[] = [];
    for (const item of group.items) {
      const effective: EffectiveSidebarItem = {
        id: item.id,
        label: item.label,
        icon: item.icon,
        route: item.route,
        badgeCount: badgeCounts[item.id] ?? 0,
        visibility: item.defaultVisibility,
        locked: Boolean(item.locked),
        inMainList: true,
      };

      if (
        effective.visibility === "HIDE_IN_MORE" ||
        (effective.visibility === "WHEN_BADGED" && effective.badgeCount === 0)
      ) {
        effective.inMainList = false;
        moreItems.push(effective);
      } else {
        mainItems.push(effective);
      }
    }

    return {
      id: group.id,
      label: group.label,
      collapsible: group.collapsible,
      collapsed: group.defaultCollapsed,
      mainItems,
      moreItems,
    };
  }),
};

const noopActions: SidebarConfigActions = {
  toggleGroupCollapse: () => undefined,
  updateItemVisibility: () => undefined,
  reorderItems: () => undefined,
  setBadgeStyle: () => undefined,
  setCollapseMode: () => undefined,
  resetToDefaults: () => undefined,
};

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <PanelStateProvider>
          <div className="h-[720px] w-[320px] border border-border bg-background">
            <Story />
          </div>
        </PanelStateProvider>
      </NextIntlClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    state: mockState,
    actions: noopActions,
    isLoading: false,
    workspaceName: "Linear Workspace",
    workspaceAvatarUrl: "",
  },
  render: (args) => <Sidebar {...args} />,
};
