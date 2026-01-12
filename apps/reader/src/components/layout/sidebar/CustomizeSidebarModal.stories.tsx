"use client";

import type { SidebarUserConfig } from "@/lib/sidebar";
import { DEFAULT_BADGE_STYLE, DEFAULT_SIDEBAR_GROUPS } from "@/lib/sidebar/defaults";
import type { Meta, StoryObj } from "@storybook/react";
import { NextIntlClientProvider } from "next-intl";
import { CustomizeSidebarModal } from "./CustomizeSidebarModal";

const messages = {
  CustomizeSidebar: {
    title: "Customize sidebar",
    close: "Close",
    badgeStyle: "Default badge style",
    badgeStyleHint: "Choose how unread badges appear in the sidebar.",
    badgeStyleCount: "Count",
    badgeStyleCountDesc: "Show numeric unread counts.",
    badgeStyleDot: "Dot",
    badgeStyleDotDesc: "Show a minimal activity dot.",
    collapseBehavior: "Collapse behavior",
    collapseBehaviorHint: "Pick how the sidebar returns when collapsed.",
    collapsePeek: "Hover to peek",
    collapsePeekDesc: "Hidden until you hover the left edge.",
    collapseRail: "Icon rail",
    collapseRailDesc: "Keep a compact icon rail visible.",
    visibilityAlways: "Always show",
    visibilityWhenBadged: "When badged",
    visibilityHideInMore: "Hide in more",
    cancel: "Cancel",
    save: "Save",
    required: "Required",
  },
};

const createUserConfig = (): SidebarUserConfig => {
  const groups: SidebarUserConfig["groups"] = {};
  const items: SidebarUserConfig["items"] = {};
  for (const group of DEFAULT_SIDEBAR_GROUPS) {
    groups[group.id] = {
      collapsed: group.defaultCollapsed,
      itemOrder: group.items.map((item) => item.id),
    };
    for (const item of group.items) {
      items[item.id] = {
        visibility: item.defaultVisibility,
      };
    }
  }
  return {
    version: 1,
    badgeStyle: DEFAULT_BADGE_STYLE,
    collapseMode: "peek",
    groups,
    items,
  };
};

const meta: Meta<typeof CustomizeSidebarModal> = {
  title: "Layout/CustomizeSidebarModal",
  component: CustomizeSidebarModal,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    onClose: () => undefined,
    userConfig: createUserConfig(),
    onSave: () => undefined,
  },
  render: (args) => <CustomizeSidebarModal {...args} />,
};
