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
import { ResizableSidebar } from "./ResizableSidebar";
import { Sidebar } from "./Sidebar";
import { SidebarRail } from "./SidebarRail";

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

const buildState = (): EffectiveSidebarState => {
  const badgeCounts: Record<string, number> = { inbox: 2, drafts: 1 };
  return {
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
};

const actions: SidebarConfigActions = {
  toggleGroupCollapse: () => undefined,
  updateItemVisibility: () => undefined,
  reorderItems: () => undefined,
  setBadgeStyle: () => undefined,
  setCollapseMode: () => undefined,
  resetToDefaults: () => undefined,
};

const meta: Meta<typeof ResizableSidebar> = {
  title: "Layout/ResizableSidebar",
  component: ResizableSidebar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <PanelStateProvider>
          <div className="h-[720px] w-full border border-border bg-background">
            <Story />
          </div>
        </PanelStateProvider>
      </NextIntlClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRail: Story = {
  args: {
    children: null,
    collapsedContent: null,
    className: "",
    collapseMode: "peek",
  },
  render: (args) => {
    const state = buildState();
    return (
      <ResizableSidebar
        collapseMode={args.collapseMode}
        collapsedContent={
          <SidebarRail
            state={state}
            isLoading={false}
            onOpenCustomize={() => undefined}
            workspaceName="Linear"
          />
        }
      >
        <Sidebar
          state={state}
          actions={actions}
          isLoading={false}
          workspaceName="Linear"
          workspaceAvatarUrl=""
        />
      </ResizableSidebar>
    );
  },
};
