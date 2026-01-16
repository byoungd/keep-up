"use client";

import { createContext, useContext } from "react";
import * as React from "react";

import type {
  EffectiveSidebarState,
  SidebarConfigActions,
  SidebarUserConfig,
} from "../lib/sidebar";

export interface ReaderShellContextValue {
  // ... existing props ...

  // App State
  aiPanel: {
    isVisible: boolean;
    toggle: () => void;
    setVisible: (visible: boolean) => void;
    width: number;
    setWidth: (width: number) => void;
    position: "main" | "left" | "right";
    setPosition: (position: "main" | "left" | "right") => void;
    isHydrated?: boolean;
  };

  auxPanel?: {
    isVisible: boolean;
    toggle: () => void;
    setVisible: (visible: boolean) => void;
    width: number;
    setWidth: (width: number) => void;
    position: "left" | "right";
    setPosition: (position: "left" | "right") => void;
    isHydrated?: boolean;
  };

  // Preview Panel State
  preview?: {
    artifact: import("../components/chat/types").ArtifactItem | null;
    setArtifact: (item: import("../components/chat/types").ArtifactItem | null) => void;
    close: () => void;
    preferredPosition: "auto" | "main" | "left" | "right";
    setPreferredPosition: (position: "auto" | "main" | "left" | "right") => void;
  };

  sidebar: {
    isCollapsed: boolean;
    toggle: () => void;
    setCollapsed: (collapsed: boolean) => void;
    width: number;
    setWidth: (width: number) => void;

    // Dynamic Config State
    state?: EffectiveSidebarState;
    actions?: SidebarConfigActions;
    userConfig?: SidebarUserConfig;
    isLoading?: boolean;
    groups?: SidebarGroupDefinition[];
  };

  // Navigation
  router: {
    push: (href: string) => void;
    replace: (href: string) => void;
    back: () => void;
    forward: () => void;
    pathname: string;
  };

  // User
  user?: {
    id: string;
    email?: string;
    imageUrl?: string;
    fullName?: string;
    permissions?: string[];
  };

  // Component Registry
  components: {
    // biome-ignore lint/suspicious/noExplicitAny: Component registry requires flexible types
    Link: React.ComponentType<any>;
    // biome-ignore lint/suspicious/noExplicitAny: Component registry requires flexible types
    [key: string]: React.ComponentType<any>;
  };

  // i18n - translation function
  i18n: {
    t: (
      key: string,
      defaultValueOrValues?: string | Record<string, string | number>,
      valuesOrDefault?: Record<string, string | number> | string
    ) => string;
  };
}

const ReaderShellContext = createContext<ReaderShellContextValue | null>(null);

export function useReaderShell() {
  const context = useContext(ReaderShellContext);
  if (!context) {
    throw new Error("useReaderShell must be used within a ReaderShellProvider");
  }
  return context;
}

const ReaderShellProviderContext = ReaderShellContext.Provider;

import { useSidebarConfig } from "../lib/sidebar";
import { DEFAULT_SIDEBAR_GROUPS } from "../lib/sidebar/defaults";
import type { SidebarGroupDefinition } from "../lib/sidebar/types";

interface ReaderShellProviderProps {
  value: Omit<ReaderShellContextValue, "sidebar"> & {
    sidebar: Omit<ReaderShellContextValue["sidebar"], "state" | "actions">;
  };
  children: React.ReactNode;
  sidebarConfig?: {
    initialGroups?: SidebarGroupDefinition[];
    configKey?: string;
  };
}

export function ReaderShellProvider({ value, children, sidebarConfig }: ReaderShellProviderProps) {
  // Initialize sidebar config logic here to share state
  const sidebarLogic = useSidebarConfig({
    ...sidebarConfig,
    user: value.user,
  });

  const groups = sidebarConfig?.initialGroups ?? DEFAULT_SIDEBAR_GROUPS;

  const contextValue: ReaderShellContextValue = React.useMemo(
    () => ({
      ...value,
      sidebar: {
        ...value.sidebar,
        state: sidebarLogic.state,
        actions: sidebarLogic.actions,
        userConfig: sidebarLogic.userConfig,
        isLoading: sidebarLogic.isLoading,
        groups,
      },
    }),

    [
      value,
      sidebarLogic.state,
      sidebarLogic.actions,
      sidebarLogic.userConfig,
      sidebarLogic.isLoading,
      groups,
    ]
  );

  return <ReaderShellProviderContext value={contextValue}>{children}</ReaderShellProviderContext>;
}
