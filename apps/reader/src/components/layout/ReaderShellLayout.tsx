"use client";

import { type Collaborator, PresenceAvatars } from "@/components/collab/PresenceAvatars";
import { SyncStatusIndicator } from "@/components/collab/SyncStatusIndicator";
import { CreateDocumentDialog } from "@/components/documents/CreateDocumentDialog";
import { FeedsSidebarSection } from "@/components/feeds/FeedsSidebarSection";
import { RssManagementModal } from "@/components/feeds/RssManagementModal";
import { ContentComposer } from "@/components/import/ContentComposer";
import { ImportStatus } from "@/components/import/ImportStatus";
import { CommandPalette, useCommandPalette } from "@/components/ui/CommandPalette";
import { useToast } from "@/components/ui/Toast";
import { useImportContextOptional } from "@/context/ImportContext";
import { useAIPanelState, useSidebarCollapsed } from "@/context/PanelStateContext";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentActions } from "@/hooks/useDocumentActions";
import { useDocumentHeader } from "@/hooks/useDocumentHeader";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { buildEditorPath } from "@/i18n/paths";
import { useSyncStatus } from "@/lib/collab/useSyncStatus";
import { getPresenceColorByIndex } from "@/lib/theme/presenceColors";
import { FeedProvider } from "@/providers/FeedProvider";
import {
  AppShell,
  DEFAULT_SIDEBAR_GROUPS,
  ReaderShellProvider,
  type SidebarItemRenderProps,
} from "@ku0/shell";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

const DEMO_COLLABORATORS: Collaborator[] = [
  { id: "1", name: "Alice", color: getPresenceColorByIndex(1) },
  { id: "2", name: "Bob", color: getPresenceColorByIndex(7) },
];

interface ReaderShellLayoutProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  isDesktop?: boolean;
  docId?: string;
}

function resolveI18nArgs(
  defaultValueOrValues?: string | Record<string, string | number>,
  valuesOrDefault?: Record<string, string | number> | string
) {
  const hasValues = typeof defaultValueOrValues === "object" && defaultValueOrValues !== null;
  const defaultValue =
    typeof defaultValueOrValues === "string"
      ? defaultValueOrValues
      : typeof valuesOrDefault === "string"
        ? valuesOrDefault
        : undefined;
  const values = hasValues
    ? (defaultValueOrValues as Record<string, string | number>)
    : typeof valuesOrDefault === "object" && valuesOrDefault !== null
      ? valuesOrDefault
      : undefined;
  return { defaultValue, values };
}

export function ReaderShellLayout({
  children,
  rightPanel,
  isDesktop = true,
  docId = "demo-doc",
}: ReaderShellLayoutProps) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "";
  const locale = useLocale();
  const translate = useTranslations();
  const { open } = useCommandPalette();
  const { toast } = useToast();
  const { createDocument, loading: createLoading } = useDocumentActions();
  const { title, sourceType } = useDocumentHeader(docId);
  const syncStatus = useSyncStatus();
  const importContext = useImportContextOptional();
  const [createDocOpen, setCreateDocOpen] = React.useState(false);
  const [showAddFeedModal, setShowAddFeedModal] = React.useState(false);
  const { isCollapsed, toggleCollapsed, setIsCollapsed, width, setWidth } = useSidebarCollapsed();
  const {
    isVisible,
    toggle,
    setVisible,
    width: aiPanelWidth,
    setWidth: setAIPanelWidth,
    position: aiPanelPosition,
    setPosition: setAIPanelPosition,
    isHydrated,
  } = useAIPanelState();

  const handleOpenSearch = React.useCallback(() => {
    open(user?.displayName ? `${user.displayName} ` : undefined);
  }, [open, user?.displayName]);

  const handleOpenImport = React.useCallback(() => {
    importContext?.openImportModal();
  }, [importContext]);

  const handleOpenFeedModal = React.useCallback(() => {
    setShowAddFeedModal(true);
  }, []);

  const renderItemChildren = React.useCallback(
    ({ item, activePath }: SidebarItemRenderProps) => {
      if (item.id !== "feeds" || !activePath.startsWith("/feeds")) {
        return null;
      }

      return (
        <div className="ml-4 pl-2 border-l border-border/30 my-1 animate-in slide-in-from-left-1 duration-200 fade-in-0">
          <FeedProvider>
            <FeedsSidebarSection onAddFeed={handleOpenFeedModal} />
          </FeedProvider>
        </div>
      );
    },
    [handleOpenFeedModal]
  );

  const handleCreateDocument = React.useCallback(
    async (titleValue: string) => {
      try {
        const createdId = await createDocument(titleValue);
        setCreateDocOpen(false);
        toast(`Created "${titleValue}"`, "success");
        router.push(buildEditorPath(createdId, locale));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create document";
        toast(message, "error");
      }
    },
    [createDocument, router, toast, locale]
  );

  React.useEffect(() => {
    const handleNewDocument = () => {
      setCreateDocOpen(true);
    };
    window.addEventListener("open-create-document", handleNewDocument);
    return () => window.removeEventListener("open-create-document", handleNewDocument);
  }, []);

  const shellContextValue = React.useMemo(() => {
    return {
      user: user
        ? {
            id: user.id,
            email: user.email,
            imageUrl: user.avatarUrl,
            fullName: user.displayName,
          }
        : undefined,
      router: {
        push: router.push,
        replace: router.replace,
        back: router.back,
        forward: router.forward,
        pathname,
      },
      components: {
        Link,
      },
      i18n: {
        t: (
          key: string,
          defaultValueOrValues?: string | Record<string, string | number>,
          valuesOrDefault?: Record<string, string | number> | string
        ) => {
          const { defaultValue, values } = resolveI18nArgs(defaultValueOrValues, valuesOrDefault);
          try {
            return translate(key, values);
          } catch {
            return defaultValue ?? key;
          }
        },
      },
      aiPanel: {
        isVisible,
        toggle,
        setVisible,
        width: aiPanelWidth,
        setWidth: setAIPanelWidth,
        position: aiPanelPosition,
        setPosition: setAIPanelPosition,
        isHydrated,
      },
      sidebar: {
        isCollapsed,
        toggle: toggleCollapsed,
        setCollapsed: setIsCollapsed,
        width,
        setWidth,
      },
    };
  }, [
    user,
    router,
    pathname,
    translate,
    isVisible,
    toggle,
    setVisible,
    aiPanelWidth,
    setAIPanelWidth,
    aiPanelPosition,
    setAIPanelPosition,
    isHydrated,
    isCollapsed,
    toggleCollapsed,
    setIsCollapsed,
    width,
    setWidth,
  ]);

  const importModals = (
    <>
      <ContentComposer
        open={importContext?.isModalOpen ?? false}
        onOpenChange={(openValue) => {
          if (!openValue) {
            importContext?.closeImportModal();
          }
        }}
        prefillUrl={importContext?.prefillUrl}
      />
      {showAddFeedModal ? (
        <FeedProvider>
          <RssManagementModal open={showAddFeedModal} onOpenChange={setShowAddFeedModal} />
        </FeedProvider>
      ) : null}
    </>
  );

  return (
    <ReaderShellProvider
      value={shellContextValue}
      sidebarConfig={{
        initialGroups: DEFAULT_SIDEBAR_GROUPS,
        configKey: "reader-sidebar-config-v1",
      }}
    >
      <AppShell
        isDesktop={isDesktop}
        rightPanel={rightPanel}
        commandPalette={<CommandPalette />}
        createDocumentDialog={
          <CreateDocumentDialog
            open={createDocOpen}
            onOpenChange={setCreateDocOpen}
            onCreate={handleCreateDocument}
            loading={createLoading}
          />
        }
        importModals={importModals}
        headerProps={{
          title,
          sourceType: sourceType ?? "local",
          syncIndicator: <SyncStatusIndicator status={syncStatus} />,
          presenceAvatars: <PresenceAvatars collaborators={DEMO_COLLABORATORS} />,
        }}
        sidebarProps={{
          onOpenSearch: handleOpenSearch,
          onOpenImport: handleOpenImport,
          onOpenFeedModal: handleOpenFeedModal,
          importStatus: <ImportStatus />,
          renderItemChildren,
        }}
        appName="Reader"
      >
        {children}
      </AppShell>
    </ReaderShellProvider>
  );
}
