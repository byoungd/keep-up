"use client";

import * as React from "react";
import {
  DEFAULT_BADGE_STYLE,
  DEFAULT_COLLAPSE_MODE,
  DEFAULT_SIDEBAR_GROUPS,
  SIDEBAR_CONFIG_STORAGE_KEY,
} from "./defaults";
import type {
  EffectiveSidebarGroup,
  EffectiveSidebarItem,
  EffectiveSidebarState,
  SidebarBadgeStyle,
  SidebarCollapseMode,
  SidebarGroupDefinition,
  SidebarGroupUserConfig,
  SidebarItemDefinition,
  SidebarItemUserConfig,
  SidebarUserConfig,
  SidebarVisibilityPolicy,
} from "./types";

const CURRENT_CONFIG_VERSION = 1;

type SidebarAvailability = {
  routes?: Set<string> | null;
  permissions?: Set<string>;
};

function featureFlagEnabled(featureFlag: string | undefined, flags: Set<string> | null): boolean {
  if (!featureFlag) {
    return true;
  }
  if (flags?.has(featureFlag)) {
    return true;
  }
  // Safe check for process.env in non-Node environments (e.g., Vite browser)
  if (
    typeof globalThis !== "undefined" &&
    (globalThis as unknown as { process?: { env: Record<string, string> } }).process?.env
  ) {
    const envKey = `NEXT_PUBLIC_FEATURE_${featureFlag.toUpperCase()}`;
    const value = (globalThis as unknown as { process: { env: Record<string, string> } }).process
      .env[envKey];
    return value !== "false";
  }
  // Default to enabled if env is not available
  return true;
}

function hasPermissions(required: string[] | undefined, userPermissions: Set<string>): boolean {
  if (!required || required.length === 0) {
    return true;
  }
  if (userPermissions.size === 0) {
    return false;
  }
  return required.every((permission) => userPermissions.has(permission));
}

function isRouteAvailable(route: string, availability: SidebarAvailability): boolean {
  if (!availability.routes || availability.routes.size === 0) {
    return true;
  }
  return availability.routes.has(route);
}

function isItemEnabled(
  item: SidebarItemDefinition,
  availability: SidebarAvailability,
  featureFlags: Set<string> | null
): boolean {
  return (
    featureFlagEnabled(item.featureFlag, featureFlags) &&
    hasPermissions(item.permissions, availability.permissions ?? new Set()) &&
    isRouteAvailable(item.route, availability)
  );
}

// Helper to getting default config based on passed definitions
function getDefaultUserConfig(groups: SidebarGroupDefinition[]): SidebarUserConfig {
  const groupConfig: Record<string, SidebarGroupUserConfig> = {};
  const itemConfig: Record<string, SidebarItemUserConfig> = {};

  for (const group of groups) {
    groupConfig[group.id] = {
      collapsed: group.defaultCollapsed,
      itemOrder: group.items.map((item) => item.id),
    };
    for (const item of group.items) {
      itemConfig[item.id] = {
        visibility: item.defaultVisibility,
      };
    }
  }

  return {
    version: CURRENT_CONFIG_VERSION,
    badgeStyle: DEFAULT_BADGE_STYLE,
    collapseMode: DEFAULT_COLLAPSE_MODE,
    groups: groupConfig,
    items: itemConfig,
  };
}

function loadUserConfig(
  storageKey: string,
  defaultGroups: SidebarGroupDefinition[]
): SidebarUserConfig {
  if (typeof window === "undefined") {
    return getDefaultUserConfig(defaultGroups);
  }

  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      return getDefaultUserConfig(defaultGroups);
    }

    const parsed = JSON.parse(stored) as SidebarUserConfig;

    // Version migration if needed
    if (parsed.version !== CURRENT_CONFIG_VERSION) {
      return getDefaultUserConfig(defaultGroups);
    }

    return mergeWithDefaults(parsed, defaultGroups);
  } catch {
    return getDefaultUserConfig(defaultGroups);
  }
}

function loadBadgeCounts(storageKey: string): Record<string, number> {
  const key = `${storageKey}-badges`;
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const injected = (window as typeof window & { __SIDEBAR_BADGES__?: Record<string, number> })
      .__SIDEBAR_BADGES__;
    if (injected) {
      return injected;
    }
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function resolveAvailability(): SidebarAvailability {
  if (typeof window === "undefined") {
    return { routes: null, permissions: new Set() };
  }
  const injectedRoutes = (window as typeof window & { __APP_ROUTES__?: string[] }).__APP_ROUTES__;
  const routes = Array.isArray(injectedRoutes) ? new Set(injectedRoutes) : null;
  return { routes, permissions: new Set() };
}

function resolveFeatureFlags(): Set<string> | null {
  if (typeof window === "undefined") {
    return null;
  }
  const injected = (window as typeof window & { __FEATURE_FLAGS__?: string[] }).__FEATURE_FLAGS__;
  if (Array.isArray(injected)) {
    return new Set(injected);
  }
  return null;
}

function mergeWithDefaults(
  userConfig: SidebarUserConfig,
  defaultGroups: SidebarGroupDefinition[]
): SidebarUserConfig {
  const defaultConfig = getDefaultUserConfig(defaultGroups);
  const mergedGroups: Record<string, SidebarGroupUserConfig> = {};
  const mergedItems: Record<string, SidebarItemUserConfig> = {};

  // Merge groups and items
  for (const group of defaultGroups) {
    const userGroup = userConfig.groups[group.id];
    const defaultGroup = defaultConfig.groups[group.id];

    if (userGroup) {
      // Keep user order, but add any new items at the end
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

function saveUserConfig(config: SidebarUserConfig, storageKey: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    if (typeof reportError === "function") {
      reportError(new Error("Failed to save sidebar config"));
    }
  }
}

function saveBadgeCounts(counts: Record<string, number>, storageKey: string): void {
  const key = `${storageKey}-badges`;
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(counts));
  } catch {
    // Ignore storage errors
  }
}

function computeEffectiveItem(
  itemDef: SidebarItemDefinition,
  userConfig: SidebarUserConfig,
  badgeCounts: Record<string, number>
): EffectiveSidebarItem {
  const userItem = userConfig.items[itemDef.id];
  const visibility = userItem?.visibility || itemDef.defaultVisibility;
  const badgeCount = badgeCounts[itemDef.id] ?? itemDef.badgeSource?.() ?? 0;

  return {
    id: itemDef.id,
    label: itemDef.label,
    icon: itemDef.icon,
    route: itemDef.route,
    badgeCount,
    visibility,
    locked: itemDef.locked || false,
    inMainList: true,
  };
}

function computeEffectiveGroup(
  groupDef: SidebarGroupDefinition,
  userConfig: SidebarUserConfig,
  badgeCounts: Record<string, number>,
  availability: SidebarAvailability,
  featureFlags: Set<string> | null
): EffectiveSidebarGroup {
  // ... implementation remains same, just signatures updated ...
  const userGroup = userConfig.groups[groupDef.id];
  const mainItems: EffectiveSidebarItem[] = [];
  const moreItems: EffectiveSidebarItem[] = [];

  // Sort items by user order
  const orderedItemIds = userGroup?.itemOrder || groupDef.items.map((i) => i.id);
  const itemMap = new Map(groupDef.items.map((item) => [item.id, item]));

  for (const itemId of orderedItemIds) {
    const itemDef = itemMap.get(itemId);
    if (!itemDef) {
      continue;
    }
    if (!isItemEnabled(itemDef, availability, featureFlags)) {
      continue;
    }

    const effectiveItem = computeEffectiveItem(itemDef, userConfig, badgeCounts);

    // Determine if item should be in main list or more menu
    if (effectiveItem.visibility === "HIDE_IN_MORE") {
      effectiveItem.inMainList = false;
      moreItems.push(effectiveItem);
    } else if (effectiveItem.visibility === "WHEN_BADGED" && effectiveItem.badgeCount === 0) {
      effectiveItem.inMainList = false;
      moreItems.push(effectiveItem);
    } else {
      mainItems.push(effectiveItem);
    }
  }

  return {
    id: groupDef.id,
    label: groupDef.label,
    collapsible: groupDef.collapsible,
    collapsed: userGroup?.collapsed ?? groupDef.defaultCollapsed,
    mainItems,
    moreItems,
  };
}

function computeEffectiveState(
  groups: SidebarGroupDefinition[],
  userConfig: SidebarUserConfig,
  badgeCounts: Record<string, number>,
  availability: SidebarAvailability,
  featureFlags: Set<string> | null
): EffectiveSidebarState {
  const effectiveGroups: EffectiveSidebarGroup[] = groups.map((groupDef) =>
    computeEffectiveGroup(groupDef, userConfig, badgeCounts, availability, featureFlags)
  );

  return {
    groups: effectiveGroups,
    badgeStyle: userConfig.badgeStyle,
    collapseMode: userConfig.collapseMode,
  };
}

export interface SidebarConfigActions {
  toggleGroupCollapse: (groupId: string) => void;
  updateItemVisibility: (itemId: string, visibility: SidebarVisibilityPolicy) => void;
  reorderItems: (groupId: string, itemOrder: string[]) => void;
  setBadgeStyle: (style: SidebarBadgeStyle) => void;
  setCollapseMode: (mode: SidebarCollapseMode) => void;
  resetToDefaults: () => void;
}

export interface UseSidebarConfigReturn {
  state: EffectiveSidebarState;
  userConfig: SidebarUserConfig;
  actions: SidebarConfigActions;
  isLoading: boolean;
}

export function useSidebarConfig({
  initialGroups = DEFAULT_SIDEBAR_GROUPS,
  configKey = SIDEBAR_CONFIG_STORAGE_KEY,
  user,
}: {
  initialGroups?: SidebarGroupDefinition[];
  configKey?: string;
  user?: { permissions?: string[] } | null;
} = {}): UseSidebarConfigReturn {
  const [userConfig, setUserConfig] = React.useState<SidebarUserConfig>(() =>
    getDefaultUserConfig(initialGroups)
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [badgeCounts, setBadgeCounts] = React.useState<Record<string, number>>({});
  const [availability, setAvailability] = React.useState<SidebarAvailability>({
    routes: null,
    permissions: new Set(),
  });
  const [featureFlags, setFeatureFlags] = React.useState<Set<string> | null>(null);
  const badgeKey = `${configKey}-badges`;

  // Load config from localStorage on mount
  React.useEffect(() => {
    const config = loadUserConfig(configKey, initialGroups);
    setUserConfig(config);

    // Load window-injected state
    setAvailability((prev) => ({ ...prev, ...resolveAvailability() }));
    setFeatureFlags(resolveFeatureFlags());
  }, [configKey, initialGroups]);

  React.useEffect(() => {
    setBadgeCounts(loadBadgeCounts(configKey));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === badgeKey) {
        setBadgeCounts(
          event.newValue ? (JSON.parse(event.newValue) as Record<string, number>) : {}
        );
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [configKey, badgeKey]);

  React.useEffect(() => {
    setAvailability((prev) => ({
      ...prev,
      permissions: new Set(
        // Keep existing
        (user as { permissions?: string[] })?.permissions ?? (user ? ["authenticated"] : [])
      ),
    }));
  }, [user]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: syncRemoteState is stable enough
  React.useEffect(() => {
    let cancelled = false;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Config loading logic is inherently complex
    const loadRemoteState = async () => {
      try {
        const response = await fetch("/api/sidebar/state");
        if (!response.ok) {
          return;
        }

        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          return;
        }

        const data = (await response.json()) as Partial<{
          userConfig: SidebarUserConfig;
          badgeCounts: Record<string, number>;
          featureFlags: string[];
          routes: string[] | null;
          permissions: string[];
        }>;

        if (cancelled) {
          return;
        }

        syncRemoteState(data, {
          setUserConfig,
          saveUserConfig: (c) => saveUserConfig(c, configKey),
          setBadgeCounts,
          saveBadgeCounts: (c) => saveBadgeCounts(c, configKey),
          setFeatureFlags,
          setAvailability,
        });
      } catch {
        // Ignore remote failures; fall back to local state
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadRemoteState();
    return () => {
      cancelled = true;
    };
  }, [configKey]); // Add dependency

  const state = React.useMemo(
    () => computeEffectiveState(initialGroups, userConfig, badgeCounts, availability, featureFlags),
    [initialGroups, userConfig, badgeCounts, availability, featureFlags]
  );

  // Helper to reduce effect complexity
  function syncRemoteState(
    data: Partial<{
      userConfig: SidebarUserConfig;
      badgeCounts: Record<string, number>;
      featureFlags: string[];
      routes: string[] | null;
      permissions: string[];
    }>,
    setters: {
      setUserConfig: (v: SidebarUserConfig) => void;
      saveUserConfig: (v: SidebarUserConfig) => void;
      setBadgeCounts: (v: Record<string, number>) => void;
      saveBadgeCounts: (v: Record<string, number>) => void;
      setFeatureFlags: (v: Set<string>) => void;
      setAvailability: React.Dispatch<React.SetStateAction<SidebarAvailability>>;
    }
  ) {
    if (data.userConfig) {
      const merged = mergeWithDefaults(data.userConfig, initialGroups);
      setters.setUserConfig(merged);
      setters.saveUserConfig(merged);
    }

    if (data.badgeCounts) {
      setters.setBadgeCounts(data.badgeCounts);
      setters.saveBadgeCounts(data.badgeCounts);
    }
    // ... rest same ...
    if (data.featureFlags) {
      setters.setFeatureFlags(new Set(data.featureFlags));
    }

    setters.setAvailability((prev) => {
      const newRoutes = data.routes ? new Set(data.routes) : (prev.routes ?? null);
      const newPermissions = new Set(data.permissions ?? Array.from(prev.permissions ?? []));

      return {
        routes: newRoutes,
        permissions: newPermissions,
      };
    });
  }
  const persistConfig = React.useCallback(
    (config: SidebarUserConfig) => {
      saveUserConfig(config, configKey);
      void fetch("/api/sidebar/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userConfig: config }),
      }).catch(() => {
        // Ignore errors during persistence
      });
    },
    [configKey]
  );

  const actions: SidebarConfigActions = React.useMemo(
    () => ({
      toggleGroupCollapse: (groupId: string) => {
        setUserConfig((prev) => {
          const newConfig = {
            ...prev,
            groups: {
              ...prev.groups,
              [groupId]: {
                ...prev.groups[groupId],
                collapsed: !prev.groups[groupId]?.collapsed,
              },
            },
          };
          persistConfig(newConfig);
          return newConfig;
        });
      },

      updateItemVisibility: (itemId: string, visibility: SidebarVisibilityPolicy) => {
        setUserConfig((prev) => {
          const newConfig = {
            ...prev,
            items: {
              ...prev.items,
              [itemId]: {
                ...prev.items[itemId],
                visibility,
              },
            },
          };
          persistConfig(newConfig);
          return newConfig;
        });
      },

      reorderItems: (groupId: string, itemOrder: string[]) => {
        setUserConfig((prev) => {
          const newConfig = {
            ...prev,
            groups: {
              ...prev.groups,
              [groupId]: {
                ...prev.groups[groupId],
                itemOrder,
              },
            },
          };
          persistConfig(newConfig);
          return newConfig;
        });
      },

      setBadgeStyle: (style: SidebarBadgeStyle) => {
        setUserConfig((prev) => {
          const newConfig = {
            ...prev,
            badgeStyle: style,
          };
          persistConfig(newConfig);
          return newConfig;
        });
      },

      setCollapseMode: (mode: SidebarCollapseMode) => {
        setUserConfig((prev) => {
          const newConfig = { ...prev, collapseMode: mode };
          persistConfig(newConfig);
          return newConfig;
        });
      },

      resetToDefaults: () => {
        const defaultConfig = getDefaultUserConfig(initialGroups);
        setUserConfig(defaultConfig);
        persistConfig(defaultConfig);
      },
    }),
    [persistConfig, initialGroups] // Add initialGroups dependency
  );

  return {
    state,
    userConfig,
    actions,
    isLoading,
  };
}
