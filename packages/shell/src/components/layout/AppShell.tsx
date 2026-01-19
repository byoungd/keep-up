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
  type SidebarGroupRenderer,
  type SidebarItemRenderer,
  type SidebarNewAction,
  SidebarRail,
} from "./sidebar";

export interface RightPanelProps {
  onClose?: () => void;
  [key: string]: unknown;
}

export interface AppShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  /** Optional auxiliary/context panel for main AI layouts */
  auxPanel?: React.ReactNode;
  /** Preview panel to show in right position when AI is in main mode */
  previewPanel?: React.ReactNode;
  /** Whether preview panel is visible */
  isPreviewVisible?: boolean;
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
    renderGroup?: SidebarGroupRenderer;
    newAction?: SidebarNewAction;
    showSearch?: boolean;
  };
  headerActions?: React.ReactNode;
  appName?: string;
  layoutStyle?: "default" | "arc";
}

const PANEL_MIN_SIZES_PX: [number, number, number] = [240, 400, 380];
const noop = () => undefined;

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
  hasAuxPanel: boolean;
  isAuxPanelLeft: boolean;
  isAuxPanelVisible: boolean;
  setAuxPanelWidth: (width: number) => void;
  setAuxPanelVisible: (visible: boolean) => void;
};

type AuxPanelState = {
  content: React.ReactNode | null;
  hasPanel: boolean;
  isVisible: boolean;
  position: "left" | "right";
  width: number;
  setWidth: (width: number) => void;
  setVisible: (visible: boolean) => void;
  toggle?: () => void;
};

type AuxLayoutState = {
  isActive: boolean;
  isVisible: boolean;
  width?: number;
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

function getPanelMinSizes({
  isAIPanelLeft,
  isAIPanelRight,
  isAuxPanelLeft,
  isAuxPanelRight,
}: {
  isAIPanelLeft: boolean;
  isAIPanelRight: boolean;
  isAuxPanelLeft: boolean;
  isAuxPanelRight: boolean;
}): [number, number, number] {
  return [
    isAIPanelLeft || isAuxPanelLeft ? PANEL_MIN_SIZES_PX[2] : PANEL_MIN_SIZES_PX[0],
    PANEL_MIN_SIZES_PX[1],
    isAIPanelRight || isAuxPanelRight ? PANEL_MIN_SIZES_PX[2] : 0,
  ];
}

function resolveAuxPanelState({
  auxPanel,
  panelProp,
  previewPanel,
  isPreviewVisible,
  fallbackWidth,
}: {
  auxPanel: ReturnType<typeof useReaderShell>["auxPanel"];
  panelProp?: React.ReactNode;
  previewPanel?: React.ReactNode;
  isPreviewVisible: boolean;
  fallbackWidth: number;
}): AuxPanelState {
  const content = panelProp ?? previewPanel ?? null;
  return {
    content,
    hasPanel: Boolean(content),
    isVisible: auxPanel?.isVisible ?? isPreviewVisible,
    position: auxPanel?.position ?? "right",
    width: auxPanel?.width ?? fallbackWidth,
    setWidth: auxPanel?.setWidth ?? noop,
    setVisible: auxPanel?.setVisible ?? noop,
    toggle: auxPanel?.toggle,
  };
}

function resolveAuxLayoutState({
  panelState,
  auxState,
  targetWidth,
}: {
  panelState: PanelState;
  auxState: AuxPanelState;
  targetWidth: number;
}): AuxLayoutState {
  if (!panelState.isMain || !auxState.hasPanel) {
    return { isActive: false, isVisible: false };
  }
  return {
    isActive: true,
    isVisible: auxState.isVisible,
    width: targetWidth,
  };
}

function resolveHeaderConfig({
  panelState,
  hasAuxPanel,
  isAuxPanelVisible,
  auxPanelPosition,
  isAIPanelVisible,
  i18n,
}: {
  panelState: PanelState;
  hasAuxPanel: boolean;
  isAuxPanelVisible: boolean;
  auxPanelPosition: "left" | "right";
  isAIPanelVisible: boolean;
  i18n: ReturnType<typeof useReaderShell>["i18n"];
}): Pick<HeaderProps, "isRightPanelOpen" | "rightPanelPosition" | "rightPanelLabel"> {
  if (panelState.isMain && hasAuxPanel) {
    return {
      isRightPanelOpen: isAuxPanelVisible,
      rightPanelPosition: auxPanelPosition,
      rightPanelLabel: i18n.t("Header.toggleContext", "Toggle Context Panel (⌘+2)"),
    };
  }
  return {
    isRightPanelOpen: isAIPanelVisible,
  };
}

function resolveDesktopToggle({
  panelState,
  hasAuxPanel,
  toggleAuxPanel,
  toggleAIPanel,
}: {
  panelState: PanelState;
  hasAuxPanel: boolean;
  toggleAuxPanel?: () => void;
  toggleAIPanel: () => void;
}): () => void {
  if (panelState.isMain && hasAuxPanel && toggleAuxPanel) {
    return toggleAuxPanel;
  }
  return toggleAIPanel;
}

function resolveMobileRightPanel({
  panelState,
  auxPanel,
  rightPanel,
  onClose,
}: {
  panelState: PanelState;
  auxPanel: React.ReactNode | null;
  rightPanel?: React.ReactNode;
  onClose: () => void;
}): React.ReactNode | null {
  const panel = panelState.isMain ? auxPanel : rightPanel;
  return clonePanel(panel ?? undefined, onClose);
}

function renderMainContent({
  isDesktop,
  layoutRef,
  defaultLayout,
  panelMinSizes,
  desktopLeftPanel,
  desktopCenterPanel,
  desktopRightPanel,
  handleLayoutChange,

  mobilePanel,
  mobileRightPanel,
  state,
  actions,
  isLoading,
  handleCustomizeOpen,
  sidebarProps,
  workspaceName,
  workspaceAvatarUrl,
}: {
  isDesktop: boolean;
  layoutRef: React.RefObject<ResizableThreePaneLayoutHandle | null>;
  defaultLayout: [number, number, number];
  panelMinSizes: [number, number, number];
  desktopLeftPanel: React.ReactNode | null;
  desktopCenterPanel: React.ReactNode;
  desktopRightPanel: React.ReactNode | null;
  handleLayoutChange: (layout: [number, number, number]) => void;

  mobilePanel: MobilePanel;
  mobileRightPanel: React.ReactNode | null;
  state: EffectiveSidebarState;
  actions: SidebarConfigActions;
  isLoading: boolean;
  handleCustomizeOpen: () => void;
  sidebarProps?: AppShellProps["sidebarProps"];
  workspaceName: string;
  workspaceAvatarUrl?: string;
}): React.ReactNode {
  if (isDesktop) {
    return (
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
    );
  }
  return (
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
      {desktopCenterPanel}
    </MobileLayout>
  );
}

function useResetMobilePanel({
  isDesktop,
  setMobilePanel,
}: {
  isDesktop: boolean;
  setMobilePanel: React.Dispatch<React.SetStateAction<MobilePanel>>;
}) {
  React.useEffect(() => {
    if (isDesktop) {
      setMobilePanel("center");
    }
  }, [isDesktop, setMobilePanel]);
}

function getDefaultLayout({
  isAIPanelLeft,
  isAIPanelRight,
  isAIPanelMain,
  isAIPanelVisible,
  isAuxPanelVisible,
  auxPanelPosition,
  targetWidth,
  auxTargetWidth,
}: {
  isAIPanelLeft: boolean;
  isAIPanelRight: boolean;
  isAIPanelMain: boolean;
  isAIPanelVisible: boolean;
  isAuxPanelVisible: boolean;
  auxPanelPosition: "left" | "right";
  targetWidth: number;
  auxTargetWidth: number;
}): [number, number, number] {
  if (isAIPanelLeft) {
    return [isAIPanelVisible ? targetWidth : 0, 0, 0];
  }
  if (isAIPanelRight) {
    return [0, 0, isAIPanelVisible ? targetWidth : 0];
  }
  if (isAIPanelMain && isAuxPanelVisible) {
    return auxPanelPosition === "left" ? [auxTargetWidth, 0, 0] : [0, 0, auxTargetWidth];
  }
  return [0, 0, 0];
}

function getDesktopPanels({
  isAIPanelLeft,
  isAIPanelRight,
  isAIPanelMain,
  isAIPanelVisible,
  desktopPanel,
  auxPanel,
  isAuxPanelVisible,
  auxPanelPosition,
  children,
}: {
  isAIPanelLeft: boolean;
  isAIPanelRight: boolean;
  isAIPanelMain: boolean;
  isAIPanelVisible: boolean;
  desktopPanel: React.ReactNode | null;
  auxPanel?: React.ReactNode | null;
  isAuxPanelVisible: boolean;
  auxPanelPosition: "left" | "right";
  children: React.ReactNode;
}): DesktopPanels {
  const leftPanel = isAIPanelLeft
    ? desktopPanel
    : isAIPanelMain && isAuxPanelVisible && auxPanelPosition === "left"
      ? auxPanel
      : null;
  let rightPanel: React.ReactNode | null = null;
  if (isAIPanelRight) {
    rightPanel = desktopPanel;
  } else if (isAIPanelMain && isAuxPanelVisible && auxPanelPosition === "right") {
    rightPanel = auxPanel ?? null;
  }
  const centerPanel = isAIPanelMain && isAIPanelVisible && desktopPanel ? desktopPanel : children;
  return { leftPanel, rightPanel, centerPanel };
}

function clonePanel(
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

function applyAuxLayoutChange(layout: [number, number, number], deps: LayoutChangeDeps): void {
  if (!deps.hasAuxPanel) {
    return;
  }
  const panelWidth = deps.isAuxPanelLeft ? layout[0] : layout[2];
  if (panelWidth > 1) {
    deps.setAuxPanelWidth(panelWidth);
    if (!deps.isAuxPanelVisible) {
      deps.setAuxPanelVisible(true);
    }
    return;
  }
  if (deps.isAuxPanelVisible) {
    deps.setAuxPanelVisible(false);
  }
}

function applyAIPanelLayoutChange(layout: [number, number, number], deps: LayoutChangeDeps): void {
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

function applyLayoutChange(layout: [number, number, number], deps: LayoutChangeDeps): void {
  if (deps.isAIPanelMain) {
    applyAuxLayoutChange(layout, deps);
    return;
  }
  applyAIPanelLayoutChange(layout, deps);
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
      newAction={sidebarProps?.newAction}
      showSearch={sidebarProps?.showSearch}
      workspaceName={workspaceName}
      workspaceAvatarUrl={workspaceAvatarUrl}
      onOpenFeedModal={sidebarProps?.onOpenFeedModal}
      importModals={sidebarProps?.importModals}
      importStatus={sidebarProps?.importStatus}
      renderItemChildren={sidebarProps?.renderItemChildren}
      renderGroup={sidebarProps?.renderGroup}
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
        <div className="absolute inset-0 z-20 flex flex-col">
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
      {mobilePanel === "right" && <div className="absolute inset-0 z-20">{mobileRightPanel}</div>}
      <div className={cn("h-full w-full bg-canvas", mobilePanel !== "center" && "hidden")}>
        {children}
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const {
    children,
    rightPanel,
    previewPanel,
    isPreviewVisible = false,
    isDesktop = true,
    createDocumentDialog,
    commandPalette,
    importModals,
    headerProps,
    sidebarProps,
    appName,
    headerActions,
    sidebar,
    layoutStyle = "default",
  } = props;
  const layoutRef = React.useRef<ResizableThreePaneLayoutHandle | null>(null);
  const [mobilePanel, setMobilePanel] = React.useState<MobilePanel>("center");
  const [customizeOpen, setCustomizeOpen] = React.useState(false);

  const {
    user,
    aiPanel,
    auxPanel,
    i18n,
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
  const auxState = resolveAuxPanelState({
    auxPanel,
    panelProp: props.auxPanel,
    previewPanel,
    isPreviewVisible,
    fallbackWidth: aiPanelWidth,
  });
  const hasAuxPanel = auxState.hasPanel;
  const auxPanelPosition = auxState.position;
  const setAuxPanelWidth = auxState.setWidth;
  const setAuxPanelVisible = auxState.setVisible;
  const toggleAuxPanel = auxState.toggle;
  const auxPanelWidth = auxState.width;

  // Map context values to local names for compatibility with existing code
  // biome-ignore lint/style/noNonNullAssertion: Guarded by early return
  const state = sidebarState!;
  // biome-ignore lint/style/noNonNullAssertion: Guarded by early return
  const actions = sidebarActions!;
  const isLoading = sidebarIsLoading ?? false;

  const workspaceName = user?.fullName ?? user?.email ?? "Workspace";
  const workspaceAvatarUrl = user?.imageUrl;

  // Prefer stored width, but ensure it's at least the default 30% when opening
  // If stored width is 0 (first run), default to 450px
  // Also ensure it meets the minimum of 380px
  const targetWidth = getTargetWidth(aiPanelWidth);
  const auxTargetWidth = getTargetWidth(auxPanelWidth);
  const auxLayout = resolveAuxLayoutState({
    panelState,
    auxState,
    targetWidth: auxTargetWidth,
  });
  const isAuxPanelActive = auxLayout.isActive;

  // Sync AI Panel state with ResizableThreePaneLayout
  useAIPanelSync({
    isDesktop,
    layoutRef,
    isAIPanelHydrated,
    isAIPanelVisible,
    aiPanelPosition: panelState.position,
    targetWidth,
    auxPanelVisible: auxLayout.isVisible,
    auxPanelPosition: auxPanelPosition,
    auxPanelWidth: auxLayout.width,
  });

  // Reset mobile panel when switching to desktop
  useResetMobilePanel({ isDesktop, setMobilePanel });

  const handleToggleLeft = React.useCallback(() => {
    togglePanel({
      isDesktop,
      setMobilePanel,
      target: "left",
      onDesktopToggle: () => layoutRef.current?.toggleLeft(),
    });
  }, [isDesktop]);

  const handleToggleRight = React.useCallback(() => {
    const onDesktopToggle = resolveDesktopToggle({
      panelState,
      hasAuxPanel,
      toggleAuxPanel,
      toggleAIPanel,
    });
    togglePanel({
      isDesktop,
      setMobilePanel,
      target: "right",
      onDesktopToggle,
    });
  }, [isDesktop, panelState, hasAuxPanel, toggleAuxPanel, toggleAIPanel]);

  const mobileRightPanel = resolveMobileRightPanel({
    panelState,
    auxPanel: auxState.content,
    rightPanel,
    onClose: () => setMobilePanel("center"),
  });
  const desktopPanel = clonePanel(rightPanel, () => setAIPanelVisible(false));
  const auxPanelElement = clonePanel(auxState.content ?? undefined, () =>
    setAuxPanelVisible(false)
  );

  const handleSaveConfig = React.useCallback(
    (config: SidebarUserConfig) => {
      if (!sidebarActions) {
        return;
      }
      applySidebarConfig(sidebarActions, config);
    },
    [sidebarActions]
  );

  const handleLayoutChange = React.useCallback(
    (layout: [number, number, number]) => {
      applyLayoutChange(layout, {
        isAIPanelMain: panelState.isMain,
        isAIPanelLeft: panelState.isLeft,
        isAIPanelVisible,
        setAIPanelWidth,
        setAIPanelVisible,
        hasAuxPanel,
        isAuxPanelLeft: auxPanelPosition === "left",
        isAuxPanelVisible: auxLayout.isVisible,
        setAuxPanelWidth,
        setAuxPanelVisible,
      });
    },
    [
      panelState.isLeft,
      panelState.isMain,
      isAIPanelVisible,
      setAIPanelWidth,
      setAIPanelVisible,
      hasAuxPanel,
      auxPanelPosition,
      auxLayout.isVisible,
      setAuxPanelWidth,
      setAuxPanelVisible,
    ]
  );

  const panelMinSizes = getPanelMinSizes({
    isAIPanelLeft: panelState.isLeft,
    isAIPanelRight: panelState.isRight,
    isAuxPanelLeft: isAuxPanelActive && auxPanelPosition === "left",
    isAuxPanelRight: isAuxPanelActive && auxPanelPosition === "right",
  });
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
    auxPanel: auxPanelElement,
    isAuxPanelVisible: auxLayout.isVisible,
    auxPanelPosition,
    children,
  });
  const defaultLayout = getDefaultLayout({
    isAIPanelLeft: panelState.isLeft,
    isAIPanelRight: panelState.isRight,
    isAIPanelMain: panelState.isMain,
    isAIPanelVisible,
    isAuxPanelVisible: auxLayout.isVisible,
    auxPanelPosition,
    targetWidth,
    auxTargetWidth,
  });

  const handleCustomizeOpen = React.useCallback(() => setCustomizeOpen(true), []);
  const handleCustomizeClose = React.useCallback(() => setCustomizeOpen(false), []);

  // Safe defaults if accessing before init
  if (!sidebarState || !sidebarActions || !sidebarUserConfig || !sidebarGroups) {
    return null;
  }

  const defaultSidebar = (
    <DefaultSidebar
      state={sidebarState}
      actions={sidebarActions}
      userConfig={sidebarUserConfig}
      // biome-ignore lint/style/noNonNullAssertion: Guarded by early return
      groups={sidebarGroups!}
      isLoading={sidebarIsLoading ?? false}
      customizeOpen={customizeOpen}
      onCustomizeOpen={handleCustomizeOpen}
      onCustomizeClose={handleCustomizeClose}
      onSaveConfig={handleSaveConfig}
      sidebarProps={sidebarProps}
      workspaceName={workspaceName}
      workspaceAvatarUrl={workspaceAvatarUrl}
    />
  );

  const sidebarElement = sidebar ?? defaultSidebar;
  const headerConfig = resolveHeaderConfig({
    panelState,
    hasAuxPanel,
    isAuxPanelVisible: auxLayout.isVisible,
    auxPanelPosition,
    isAIPanelVisible,
    i18n,
  });

  return (
    <>
      {commandPalette}
      {createDocumentDialog}
      {importModals}
      <div className="fixed inset-0 w-full overflow-hidden font-sans text-foreground bg-theme-base">
        <div className="flex h-full w-full">
          {sidebarElement}

          {/* Main Content Area */}
          <div
            className={cn(
              "flex-1 flex flex-col min-w-0 relative overflow-hidden transition-all duration-200 ease-in-out",
              layoutStyle === "arc" && isDesktop
                ? "bg-canvas rounded-lg shadow-soft m-1.5 z-10"
                : "bg-canvas rounded-none z-0"
            )}
          >
            <Header
              onToggleLeft={handleToggleLeft}
              onToggleRight={handleToggleRight}
              isRightPanelOpen={headerConfig.isRightPanelOpen}
              rightPanelPosition={headerConfig.rightPanelPosition}
              rightPanelLabel={headerConfig.rightPanelLabel}
              globalActions={headerActions}
              appName={appName}
              {...headerProps}
            />

            <div className="flex-1 overflow-hidden relative shell-canvas">
              {renderMainContent({
                isDesktop,
                layoutRef,
                defaultLayout,
                panelMinSizes,
                desktopLeftPanel,
                desktopCenterPanel,
                desktopRightPanel,
                handleLayoutChange,

                mobilePanel,
                mobileRightPanel,
                state,
                actions,
                isLoading,
                handleCustomizeOpen,
                sidebarProps,
                workspaceName,
                workspaceAvatarUrl,
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
