"use client";

import { CreateDocumentDialog } from "@/components/documents/CreateDocumentDialog";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { useRouter } from "@/i18n/navigation";
import { buildEditorPath } from "@/i18n/paths";
import { useSidebarConfig } from "@/lib/sidebar";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import * as React from "react";
import { Header } from "./Header";
import {
  ResizableThreePaneLayout,
  type ResizableThreePaneLayoutHandle,
} from "./ResizableThreePaneLayout";
import { CustomizeSidebarModal, ResizableSidebar, Sidebar, SidebarRail } from "./sidebar";

interface AppShellProps {
  children: React.ReactNode;
  rightPanel?: React.ReactElement;
  isDesktop?: boolean;
}

// Interface for the prop we are injecting
interface RightPanelProps {
  onClose?: () => void;
}

import { useAIPanelState } from "@/context/PanelStateContext";

// Static configuration for resize limits (Pixels)
// [Left Min, Center Min, Right Min]
const PANEL_MIN_SIZES_PX: [number, number, number] = [240, 400, 380];

export function AppShell({ children, rightPanel, isDesktop = true }: AppShellProps) {
  const layoutRef = React.useRef<ResizableThreePaneLayoutHandle>(null);
  const [mobilePanel, setMobilePanel] = React.useState<"center" | "left" | "right">("center");
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [createDocOpen, setCreateDocOpen] = React.useState(false);
  const { userConfig, actions, state, isLoading } = useSidebarConfig();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const locale = useLocale();
  const { createDocument, loading: createLoading } = useDocumentActions();
  const {
    isVisible: isAIPanelVisible,
    toggle: toggleAIPanel,
    setVisible: setAIPanelVisible,
    isHydrated,
    width: aiPanelWidth,
    setWidth: setAIPanelWidth,
  } = useAIPanelState();
  const workspaceName = user?.displayName ?? "Workspace";
  const workspaceAvatarUrl = user?.avatarUrl;

  // Listen for "new-document" custom event from command palette
  React.useEffect(() => {
    const handleNewDocument = () => {
      setCreateDocOpen(true);
    };
    window.addEventListener("open-create-document", handleNewDocument);
    return () => window.removeEventListener("open-create-document", handleNewDocument);
  }, []);

  // Handle document creation
  const handleCreateDocument = React.useCallback(
    async (title: string) => {
      try {
        const docId = await createDocument(title);
        setCreateDocOpen(false);
        toast(`Created "${title}"`, "success");
        // Navigate to editor with the new document
        router.push(buildEditorPath(docId, locale));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create document";
        toast(message, "error");
      }
    },
    [createDocument, router, toast, locale]
  );

  // Sync AI Panel state with ResizableThreePaneLayout
  React.useEffect(() => {
    if (isDesktop && layoutRef.current && isHydrated) {
      if (isAIPanelVisible) {
        layoutRef.current.expandRight();
      } else {
        layoutRef.current.collapseRight();
      }
    }
  }, [isAIPanelVisible, isDesktop, isHydrated]);

  // Reset mobile panel when switching to desktop
  React.useEffect(() => {
    if (isDesktop) {
      setMobilePanel("center");
    }
  }, [isDesktop]);

  const handleToggleLeft = () => {
    if (isDesktop) {
      layoutRef.current?.toggleLeft();
    } else {
      setMobilePanel((prev) => (prev === "left" ? "center" : "left"));
    }
  };

  const handleToggleRight = () => {
    if (isDesktop) {
      toggleAIPanel();
    } else {
      setMobilePanel((prev) => (prev === "right" ? "center" : "right"));
    }
  };

  const mobileRightPanel = rightPanel
    ? React.cloneElement(rightPanel as React.ReactElement<RightPanelProps>, {
        onClose: () => setMobilePanel("center"),
      })
    : null;

  // For desktop right panel closure, we wire it to the toggle
  const desktopRightPanel = rightPanel
    ? React.cloneElement(rightPanel as React.ReactElement<RightPanelProps>, {
        onClose: () => setAIPanelVisible(false),
      })
    : null;

  const handleSaveConfig = React.useCallback(
    (config: typeof userConfig) => {
      actions.setBadgeStyle(config.badgeStyle);
      actions.setCollapseMode(config.collapseMode);
      for (const [itemId, itemConfig] of Object.entries(config.items)) {
        actions.updateItemVisibility(itemId, itemConfig.visibility);
      }
      for (const [groupId, groupConfig] of Object.entries(config.groups)) {
        actions.reorderItems(groupId, groupConfig.itemOrder);
      }
    },
    [actions]
  );

  const handleLayoutChange = React.useCallback(
    (layout: [number, number, number]) => {
      // layout is [left, center, right]
      const rightW = layout[2];

      if (rightW > 1) {
        // Panel is open
        setAIPanelWidth(rightW);
        if (!isAIPanelVisible) {
          setAIPanelVisible(true);
        }
      } else {
        // Panel is closed via drag
        if (isAIPanelVisible) {
          setAIPanelVisible(false);
        }
      }
    },
    [setAIPanelWidth, isAIPanelVisible, setAIPanelVisible]
  );

  // Prefer stored width, but ensure it's at least the default 30% when opening
  // If stored width is 0 (first run), default to 450px
  // Also ensure it meets the minimum of 380px
  const targetWidth = aiPanelWidth > 0 ? Math.max(aiPanelWidth, 380) : 450;

  return (
    <>
      <CommandPalette />
      <CreateDocumentDialog
        open={createDocOpen}
        onOpenChange={setCreateDocOpen}
        onCreate={handleCreateDocument}
        loading={createLoading}
      />
      <div className="flex h-screen w-full overflow-hidden font-sans text-foreground bg-background">
        {/* Resizable Linear-style Sidebar (Desktop) */}
        <ResizableSidebar
          className="hidden lg:flex"
          collapseMode={state.collapseMode}
          collapsedContent={
            <SidebarRail
              state={state}
              isLoading={isLoading}
              onOpenCustomize={() => setCustomizeOpen(true)}
              workspaceName={workspaceName}
              workspaceAvatarUrl={workspaceAvatarUrl}
            />
          }
        >
          <Sidebar
            state={state}
            actions={actions}
            isLoading={isLoading}
            onOpenCustomize={() => setCustomizeOpen(true)}
            workspaceName={workspaceName}
            workspaceAvatarUrl={workspaceAvatarUrl}
          />
        </ResizableSidebar>

        {/* Customize Sidebar Modal */}
        <CustomizeSidebarModal
          open={customizeOpen}
          onClose={() => setCustomizeOpen(false)}
          userConfig={userConfig}
          onSave={handleSaveConfig}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <Header
            onToggleLeft={handleToggleLeft}
            onToggleRight={handleToggleRight}
            isRightPanelOpen={isAIPanelVisible}
          />

          <div className="flex-1 overflow-hidden relative">
            {isDesktop ? (
              <ResizableThreePaneLayout
                ref={layoutRef}
                layoutUnit="pixel"
                defaultLayout={
                  isAIPanelVisible
                    ? [0, 0, targetWidth] // Left 0 (unused), Center fluid, Right target
                    : [0, 0, 0]
                }
                minSizes={PANEL_MIN_SIZES_PX}
                minWidthsPx={PANEL_MIN_SIZES_PX} // Redundant but consistent for type safety
                leftPanel={null}
                centerPanel={children}
                rightPanel={desktopRightPanel}
                onLayoutChange={handleLayoutChange}
              />
            ) : (
              <div className="h-full w-full relative">
                {/* Mobile View Logic */}
                {mobilePanel === "left" && (
                  <div className="absolute inset-0 z-20 bg-background flex flex-col">
                    <Sidebar
                      className="w-full h-full"
                      state={state}
                      actions={actions}
                      isLoading={isLoading}
                      onOpenCustomize={() => setCustomizeOpen(true)}
                      workspaceName={workspaceName}
                      workspaceAvatarUrl={workspaceAvatarUrl}
                    />
                  </div>
                )}
                {mobilePanel === "right" && (
                  <div className="absolute inset-0 z-20 bg-background">{mobileRightPanel}</div>
                )}
                {/* Center always rendered but covered if panel open */}
                <div className={cn("h-full w-full", mobilePanel !== "center" && "hidden")}>
                  {children}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
