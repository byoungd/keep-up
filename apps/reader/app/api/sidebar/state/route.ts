import type { SidebarGroupUserConfig, SidebarItemUserConfig, SidebarUserConfig } from "@ku0/shell";
import { DEFAULT_BADGE_STYLE, DEFAULT_COLLAPSE_MODE, DEFAULT_SIDEBAR_GROUPS } from "@ku0/shell";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const CONFIG_COOKIE = "sidebar-config";
const BADGES_COOKIE = "sidebar-badges";
const CURRENT_CONFIG_VERSION = 1;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function buildDefaultConfig(): SidebarUserConfig {
  const groups: Record<string, SidebarGroupUserConfig> = {};
  const items: Record<string, SidebarItemUserConfig> = {};

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
    version: CURRENT_CONFIG_VERSION,
    badgeStyle: DEFAULT_BADGE_STYLE,
    collapseMode: DEFAULT_COLLAPSE_MODE,
    groups,
    items,
  };
}

function mergeWithDefaults(userConfig: SidebarUserConfig): SidebarUserConfig {
  const defaultConfig = buildDefaultConfig();
  const mergedGroups: Record<string, SidebarGroupUserConfig> = {};
  const mergedItems: Record<string, SidebarItemUserConfig> = {};

  for (const group of DEFAULT_SIDEBAR_GROUPS) {
    const userGroup = userConfig.groups[group.id];
    const defaultGroup = defaultConfig.groups[group.id];

    if (userGroup) {
      const existingIds = new Set(userGroup.itemOrder);
      const newItems = group.items
        .filter((item) => !existingIds.has(item.id))
        .map((item) => item.id);

      mergedGroups[group.id] = {
        collapsed: userGroup.collapsed,
        itemOrder: [...userGroup.itemOrder, ...newItems],
      };
    } else {
      mergedGroups[group.id] = defaultGroup;
    }

    for (const item of group.items) {
      const userItem = userConfig.items[item.id];
      const defaultItem = defaultConfig.items[item.id];
      mergedItems[item.id] = userItem || defaultItem;
    }
  }

  return {
    version: CURRENT_CONFIG_VERSION,
    badgeStyle: userConfig.badgeStyle || defaultConfig.badgeStyle,
    collapseMode: userConfig.collapseMode || defaultConfig.collapseMode,
    groups: mergedGroups,
    items: mergedItems,
  };
}

function parseBadges(raw: string | undefined): Record<string, number> {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const rawConfig = cookieStore.get(CONFIG_COOKIE)?.value;
  const rawBadges = cookieStore.get(BADGES_COOKIE)?.value;

  let userConfig = buildDefaultConfig();
  if (rawConfig) {
    try {
      const parsed = JSON.parse(rawConfig) as SidebarUserConfig;
      if (parsed.version === CURRENT_CONFIG_VERSION) {
        userConfig = mergeWithDefaults(parsed);
      }
    } catch {
      // Ignore malformed cookies
    }
  }

  const badgeCounts = parseBadges(rawBadges);
  const featureFlags = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith("NEXT_PUBLIC_FEATURE_") && value !== "false")
    .map(([key]) => key.replace("NEXT_PUBLIC_FEATURE_", "").toLowerCase());

  return NextResponse.json({
    userConfig,
    badgeCounts,
    featureFlags,
    routes: null as string[] | null,
    permissions: [] as string[],
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<{
    userConfig: SidebarUserConfig;
    badgeCounts: Record<string, number>;
  }>;
  const response = NextResponse.json({ ok: true });

  if (body.userConfig) {
    const merged = mergeWithDefaults(body.userConfig);
    response.cookies.set(CONFIG_COOKIE, JSON.stringify(merged), {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  if (body.badgeCounts) {
    response.cookies.set(BADGES_COOKIE, JSON.stringify(body.badgeCounts), {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  return response;
}
