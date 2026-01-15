"use client";

import { cn } from "@ku0/shared/utils";
import * as React from "react";
import { useReaderShell } from "../../context/ReaderShellContext";
import { useAIPanelSync } from "../../hooks/useAIPanelSync";
import type {
  EffectiveSidebarState,
  SidebarConfigActions,
  SidebarGroupDefinition,
  SidebarUserConfig,
} from "../../lib/sidebar";
import { Header, type HeaderProps } from "./Header";
import {
  ResizableThreePaneLayout,
  type ResizableThreePaneLayoutHandle,
} from "./ResizableThreePaneLayout";
import {
  ResizableSidebar,
  SettingsModal,
  Sidebar,
  type SidebarItemRenderer,
  SidebarRail,
} from "./sidebar";

export interface RightPanelProps {
  onClose?: () => void;
  [key: string]: unknown;
}

export interface AppShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  sidebar?: React.ReactNode;
  isDesktop?: boolean;
  createDocumentDialog?: React.ReactNode;
  commandPalette?: React.ReactNode;
  importModals?: React.ReactNode;
  headerProps?: Omit<HeaderProps, "onToggleLeft" | "onToggleRight" | "isRightPanelOpen">;
  sidebarProps?: {
    onOpenSearch?: () => void;
    onOpenImport?: () => void;
    onOpenFeedModal?: () => void;
    importModals?: React.ReactNode;
    importStatus?: React.ReactNode;
    renderItemChildren?: SidebarItemRenderer;
  };
  headerActions?: React.ReactNode;
  appName?: string;
}

const PANEL_MIN_SIZES_PX: [number, number, number] = [240, 400, 380];

type PanelPosition = "left" | "right" | "main";
type PanelState = {
  position: PanelPosition;
  isLeft: boolean;
  isRight: boolean;
  isMain: boolean;
};

type MobilePanel = "center" | "left" | "right";

type LayoutChangeDeps = {
  isAIPanelMain: boolean;
  isAIPanelLeft: boolean;
  isAIPanelVisible: boolean;
  setAIPanelWidth: (width: number) => void;
  setAIPanelVisible: (visible: boolean) => void;
};

type SidebarContentProps = {
  className?: string;
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  isLoading: boolean;
  onOpenCustomize: () => void;
  sidebarProps?: AppShellProps["sidebarProps"];
  workspaceName: string;
  workspaceAvatarUrl?: string;
};

type DefaultSidebarProps = {
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  userConfig: SidebarUserConfig;
  groups: SidebarGroupDefinition[];
  isLoading: boolean;
  customizeOpen: boolean;
  onCustomizeOpen: () => void;
  onCustomizeClose: () => void;
  onSaveConfig: (config: SidebarUserConfig) => void;
  sidebarProps?: AppShellProps["sidebarProps"];
  workspaceName: string;
  workspaceAvatarUrl?: string;
};

type DesktopPanels = {
  leftPanel: React.ReactNode | null;
  rightPanel: React.ReactNode | null;
  centerPanel: React.ReactNode;
};

function resolvePanelPosition(position?: PanelPosition): PanelState {
  const resolved = position ?? "right";
  return {
    position: resolved,
    isLeft: resolved === "left",
    isRight: resolved === "right",
    isMain: resolved === "main",
  };
}

function getTargetWidth(width: number): number {
  return width > 0 ? Math.max(width, 380) : 450;
}

function getPanelMinSizes(
  isAIPanelLeft: boolean,
  isAIPanelRight: boolean
): [number, number, number] {
  return [
    isAIPanelLeft ? PANEL_MIN_SIZES_PX[2] : PANEL_MIN_SIZES_PX[0],
    PANEL_MIN_SIZES_PX[1],
    isAIPanelRight ? PANEL_MIN_SIZES_PX[2] : 0,
  ];
}

function getDefaultLayout({
  isAIPanelLeft,
  isAIPanelRight,
  isAIPanelVisible,
  targetWidth,
}: {
  isAIPanelLeft: boolean;
  isAIPanelRight: boolean;
  isAIPanelVisible: boolean;
  targetWidth: number;
}): [number, number, number] {
  if (isAIPanelLeft) {
    return [isAIPanelVisible ? targetWidth : 0, 0, 0];
  }
  if (isAIPanelRight) {
    return [0, 0, isAIPanelVisible ? targetWidth : 0];
  }
  return [0, 0, 0];
}

function getDesktopPanels({
  isAIPanelLeft,
  isAIPanelRight,
  isAIPanelMain,
  isAIPanelVisible,
  desktopPanel,
  children,
}: {
  isAIPanelLeft: boolean;
  isAIPanelRight: boolean;
  isAIPanelMain: boolean;
  isAIPanelVisible: boolean;
  desktopPanel: React.ReactNode | null;
  children: React.ReactNode;
}): DesktopPanels {
  const leftPanel = isAIPanelLeft ? desktopPanel : null;
  const rightPanel = isAIPanelRight ? desktopPanel : null;
  const centerPanel = isAIPanelMain && isAIPanelVisible && desktopPanel ? desktopPanel : children;
  return { leftPanel, rightPanel, centerPanel };
}

function cloneRightPanel(
  panel: React.ReactNode | undefined,
  onClose: () => void
): React.ReactNode | null {
  if (!panel) {
    return null;
  }
  return React.cloneElement(panel as React.ReactElement<RightPanelProps>, { onClose });
}

function applySidebarConfig(actions: SidebarConfigActions, config: SidebarUserConfig): void {
  actions.setBadgeStyle(config.badgeStyle);
  actions.setCollapseMode(config.collapseMode);
  for (const [itemId, itemConfig] of Object.entries(config.items)) {
    actions.updateItemVisibility(itemId, itemConfig.visibility);
  }
  for (const [groupId, groupConfig] of Object.entries(config.groups)) {
    actions.reorderItems(groupId, groupConfig.itemOrder);
  }
}

function applyLayoutChange(layout: [number, number, number], deps: LayoutChangeDeps): void {
  if (deps.isAIPanelMain) {
    return;
  }

  const panelWidth = deps.isAIPanelLeft ? layout[0] : layout[2];
  if (panelWidth > 1) {
    deps.setAIPanelWidth(panelWidth);
    if (!deps.isAIPanelVisible) {
      deps.setAIPanelVisible(true);
    }
    return;
  }

  if (deps.isAIPanelVisible) {
    deps.setAIPanelVisible(false);
  }
}

function togglePanel({
  isDesktop,
  setMobilePanel,
  target,
  onDesktopToggle,
}: {
  isDesktop: boolean;
  setMobilePanel: React.Dispatch<React.SetStateAction<MobilePanel>>;
  target: Exclude<MobilePanel, "center">;
  onDesktopToggle: () => void;
}): void {
  if (isDesktop) {
    onDesktopToggle();
    return;
  }
  setMobilePanel((prev) => (prev === target ? "center" : target));
}

function SidebarContent({
  className,
  state,
  actions,
  isLoading,
  onOpenCustomize,
  sidebarProps,
  workspaceName,
  workspaceAvatarUrl,
}: SidebarContentProps) {
  return (
    <Sidebar
      className={className}
      state={state}
      actions={actions}
      isLoading={isLoading}
      onOpenCustomize={onOpenCustomize}
      onOpenSearch={sidebarProps?.onOpenSearch}
      onOpenImport={sidebarProps?.onOpenImport}
      workspaceName={workspaceName}
      workspaceAvatarUrl={workspaceAvatarUrl}
      onOpenFeedModal={sidebarProps?.onOpenFeedModal}
      importModals={sidebarProps?.importModals}
      importStatus={sidebarProps?.importStatus}
      renderItemChildren={sidebarProps?.renderItemChildren}
    />
  );
}

function DefaultSidebar({
  state,
  actions,
  userConfig,
  groups,
  isLoading,
  customizeOpen,
  onCustomizeOpen,
  onCustomizeClose,
  onSaveConfig,
  sidebarProps,
  workspaceName,
  workspaceAvatarUrl,
}: DefaultSidebarProps) {
  return (
    <>
      <ResizableSidebar
        className="hidden lg:flex"
        collapseMode={state.collapseMode}
        collapsedContent={
          <SidebarRail
            state={state}
            isLoading={isLoading}
            onOpenCustomize={onCustomizeOpen}
            onOpenSearch={sidebarProps?.onOpenSearch}
            workspaceName={workspaceName}
            workspaceAvatarUrl={workspaceAvatarUrl}
          />
        }
      >
        <SidebarContent
          state={state}
          actions={actions}
          isLoading={isLoading}
          onOpenCustomize={onCustomizeOpen}
          sidebarProps={sidebarProps}
          workspaceName={workspaceName}
          workspaceAvatarUrl={workspaceAvatarUrl}
        />
      </ResizableSidebar>

      <SettingsModal
        open={customizeOpen}
        onClose={onCustomizeClose}
        userConfig={userConfig}
        onSave={onSaveConfig}
        groups={groups}
      />
    </>
  );
}

function MobileLayout({
  mobilePanel,
  mobileRightPanel,
  children,
  state,
  actions,
  isLoading,
  onOpenCustomize,
  sidebarProps,
  workspaceName,
  workspaceAvatarUrl,
}: {
  mobilePanel: MobilePanel;
  mobileRightPanel: React.ReactNode | null;
  children: React.ReactNode;
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  isLoading: boolean;
  onOpenCustomize: () => void;
  sidebarProps?: AppShellProps["sidebarProps"];
  workspaceName: string;
  workspaceAvatarUrl?: string;
}) {
  return (
    <div className="h-full w-full relative">
      {mobilePanel === "left" && (
        <div className="absolute inset-0 z-20 bg-background flex flex-col">
          <SidebarContent
            className="w-full h-full"
            state={state}
            actions={actions}
            isLoading={isLoading}
            onOpenCustomize={onOpenCustomize}
            sidebarProps={sidebarProps}
            workspaceName={workspaceName}
            workspaceAvatarUrl={workspaceAvatarUrl}
          />
        </div>
      )}
      {mobilePanel === "right" && (
        <div className="absolute inset-0 z-20 bg-background">{mobileRightPanel}</div>
      )}
      <div className={cn("h-full w-full", mobilePanel !== "center" && "hidden")}>{children}</div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const {
    children,
    rightPanel,
    isDesktop = true,
    createDocumentDialog,
    commandPalette,
    importModals,
    headerProps,
    sidebarProps,
    appName,
    headerActions,
    sidebar,
  } = props;
  const layoutRef = React.useRef<ResizableThreePaneLayoutHandle | null>(null);
  const [mobilePanel, setMobilePanel] = React.useState<MobilePanel>("center");
  const [customizeOpen, setCustomizeOpen] = React.useState(false);

  const {
    user,
    aiPanel,
    sidebar: {
      state: sidebarState,
      actions: sidebarActions,
      isCollapsed: _isCollapsed,
      width: _sidebarWidth,
      userConfig: sidebarUserConfig,
      isLoading: sidebarIsLoading,
      groups: sidebarGroups,
    },
  } = useReaderShell();

  // Safe defaults if accessing before init
  if (!sidebarState || !sidebarActions || !sidebarUserConfig || !sidebarGroups) {
    return null;
  }

  const {
    isVisible: isAIPanelVisible,
    toggle: toggleAIPanel,
    setVisible: setAIPanelVisible,
    width: aiPanelWidth,
    setWidth: setAIPanelWidth,
    position: aiPanelPosition,
    isHydrated: isAIPanelHydrated,
  } = aiPanel;

  const panelState = resolvePanelPosition(aiPanelPosition);

  // Map context values to local names for compatibility with existing code
  const state = sidebarState;
  const actions = sidebarActions;
  const userConfig = sidebarUserConfig;
  const isLoading = sidebarIsLoading ?? false;

  const workspaceName = user?.fullName ?? user?.email ?? "Workspace";
  const workspaceAvatarUrl = user?.imageUrl;

  // Prefer stored width, but ensure it's at least the default 30% when opening
  // If stored width is 0 (first run), default to 450px
  // Also ensure it meets the minimum of 380px
  const targetWidth = getTargetWidth(aiPanelWidth);

  // Sync AI Panel state with ResizableThreePaneLayout
  useAIPanelSync({
    isDesktop,
    layoutRef,
    isAIPanelHydrated,
    isAIPanelVisible,
    aiPanelPosition: panelState.position,
    targetWidth,
  });

  // Reset mobile panel when switching to desktop
  React.useEffect(() => {
    if (isDesktop) {
      setMobilePanel("center");
    }
  }, [isDesktop]);

  const handleToggleLeft = React.useCallback(() => {
    togglePanel({
      isDesktop,
      setMobilePanel,
      target: "left",
      onDesktopToggle: () => layoutRef.current?.toggleLeft(),
    });
  }, [isDesktop]);

  const handleToggleRight = React.useCallback(() => {
    togglePanel({
      isDesktop,
      setMobilePanel,
      target: "right",
      onDesktopToggle: toggleAIPanel,
    });
  }, [isDesktop, toggleAIPanel]);

  const mobileRightPanel = cloneRightPanel(rightPanel, () => setMobilePanel("center"));
  const desktopPanel = cloneRightPanel(rightPanel, () => setAIPanelVisible(false));

  const handleSaveConfig = React.useCallback(
    (config: SidebarUserConfig) => {
      applySidebarConfig(actions, config);
    },
    [actions]
  );

  const handleLayoutChange = React.useCallback(
    (layout: [number, number, number]) => {
      applyLayoutChange(layout, {
        isAIPanelMain: panelState.isMain,
        isAIPanelLeft: panelState.isLeft,
        isAIPanelVisible,
        setAIPanelWidth,
        setAIPanelVisible,
      });
    },
    [panelState.isLeft, panelState.isMain, isAIPanelVisible, setAIPanelWidth, setAIPanelVisible]
  );

  const panelMinSizes = getPanelMinSizes(panelState.isLeft, panelState.isRight);
  const {
    leftPanel: desktopLeftPanel,
    rightPanel: desktopRightPanel,
    centerPanel: desktopCenterPanel,
  } = getDesktopPanels({
    isAIPanelLeft: panelState.isLeft,
    isAIPanelRight: panelState.isRight,
    isAIPanelMain: panelState.isMain,
    isAIPanelVisible,
    desktopPanel,
    children,
  });
  const defaultLayout = getDefaultLayout({
    isAIPanelLeft: panelState.isLeft,
    isAIPanelRight: panelState.isRight,
    isAIPanelVisible,
    targetWidth,
  });

  const handleCustomizeOpen = React.useCallback(() => setCustomizeOpen(true), []);
  const handleCustomizeClose = React.useCallback(() => setCustomizeOpen(false), []);

  const defaultSidebar = (
    <DefaultSidebar
      state={state}
      actions={actions}
      userConfig={userConfig}
      groups={sidebarGroups}
      isLoading={isLoading}
      customizeOpen={customizeOpen}
      onCustomizeOpen={handleCustomizeOpen}
      onCustomizeClose={handleCustomizeClose}
      onSaveConfig={handleSaveConfig}
      sidebarProps={sidebarProps}
      workspaceName={workspaceName}
      workspaceAvatarUrl={workspaceAvatarUrl}
    />
  );

  const sidebarElement = sidebar ? sidebar : defaultSidebar;

  return (
    <>
      {commandPalette}
      {createDocumentDialog}
      {importModals}
      <div className="fixed inset-0 flex w-full overflow-hidden font-sans text-foreground bg-background">
        {sidebarElement}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <Header
            onToggleLeft={handleToggleLeft}
            onToggleRight={handleToggleRight}
            isRightPanelOpen={isAIPanelVisible}
            globalActions={headerActions}
            appName={appName}
            {...headerProps}
          />

          <div className="flex-1 overflow-hidden relative">
            {isDesktop ? (
              <ResizableThreePaneLayout
                ref={layoutRef}
                layoutUnit="pixel"
                defaultLayout={defaultLayout}
                minSizes={panelMinSizes}
                minWidthsPx={panelMinSizes}
                leftPanel={desktopLeftPanel}
                centerPanel={desktopCenterPanel}
                rightPanel={desktopRightPanel}
                onLayoutChange={handleLayoutChange}
              />
            ) : (
              <MobileLayout
                mobilePanel={mobilePanel}
                mobileRightPanel={mobileRightPanel}
                state={state}
                actions={actions}
                isLoading={isLoading}
                onOpenCustomize={handleCustomizeOpen}
                sidebarProps={sidebarProps}
                workspaceName={workspaceName}
                workspaceAvatarUrl={workspaceAvatarUrl}
              >
                {children}
              </MobileLayout>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
