"use client";

import * as React from "react";
import { createContext, useContext } from "react";

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
const ShellPanelsContext = createContext<ShellPanelsContextValue | null>(null);
const ShellSidebarContext = createContext<ReaderShellContextValue["sidebar"] | null>(null);
const ShellRouterContext = createContext<ReaderShellContextValue["router"] | null>(null);
const ShellComponentsContext = createContext<ReaderShellContextValue["components"] | null>(null);
const ShellI18nContext = createContext<ReaderShellContextValue["i18n"] | null>(null);
const ShellUserContext = createContext<ReaderShellContextValue["user"] | null>(null);

type ShellPanelsContextValue = Pick<ReaderShellContextValue, "aiPanel" | "auxPanel" | "preview">;

function useRequiredContext<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used within a ReaderShellProvider`);
  }
  return value;
}

export function useReaderShell() {
  return useRequiredContext(ReaderShellContext, "useReaderShell");
}

export function useShellPanels() {
  return useRequiredContext(ShellPanelsContext, "useShellPanels");
}

export function useShellSidebar() {
  return useRequiredContext(ShellSidebarContext, "useShellSidebar");
}

export function useShellRouter() {
  return useRequiredContext(ShellRouterContext, "useShellRouter");
}

export function useShellComponents() {
  return useRequiredContext(ShellComponentsContext, "useShellComponents");
}

export function useShellI18n() {
  return useRequiredContext(ShellI18nContext, "useShellI18n");
}

export function useShellUser() {
  return useRequiredContext(ShellUserContext, "useShellUser");
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

  const sidebarValue = React.useMemo(
    () => ({
      ...value.sidebar,
      state: sidebarLogic.state,
      actions: sidebarLogic.actions,
      userConfig: sidebarLogic.userConfig,
      isLoading: sidebarLogic.isLoading,
      groups,
    }),
    [
      value.sidebar,
      sidebarLogic.state,
      sidebarLogic.actions,
      sidebarLogic.userConfig,
      sidebarLogic.isLoading,
      groups,
    ]
  );

  const panelsValue = React.useMemo(
    () => ({
      aiPanel: value.aiPanel,
      auxPanel: value.auxPanel,
      preview: value.preview,
    }),
    [value.aiPanel, value.auxPanel, value.preview]
  );

  const contextValue: ReaderShellContextValue = React.useMemo(
    () => ({
      ...value,
      sidebar: sidebarValue,
    }),
    [value, sidebarValue]
  );

  return (
    <ReaderShellProviderContext value={contextValue}>
      <ShellI18nContext.Provider value={value.i18n}>
        <ShellRouterContext.Provider value={value.router}>
          <ShellComponentsContext.Provider value={value.components}>
            <ShellUserContext.Provider value={value.user}>
              <ShellPanelsContext.Provider value={panelsValue}>
                <ShellSidebarContext.Provider value={sidebarValue}>
                  {children}
                </ShellSidebarContext.Provider>
              </ShellPanelsContext.Provider>
            </ShellUserContext.Provider>
          </ShellComponentsContext.Provider>
        </ShellRouterContext.Provider>
      </ShellI18nContext.Provider>
    </ReaderShellProviderContext>
  );
}
