"use client";

import { Download, Redo2, Undo2 } from "lucide-react";
import * as React from "react";

import { ConnectionBadge } from "@/components/ConnectionBadge";
import { GhostText } from "@/components/ai/GhostText";
import { AnnotationManager } from "@/components/annotations/AnnotationManager";
import { HighlightOverlay } from "@/components/annotations/HighlightOverlay";
import { SelectionToolbar } from "@/components/annotations/SelectionToolbar";
import { useFailClosedBanner } from "@/components/annotations/useFailClosedBanner";
import { useSelectionToolbarActions } from "@/components/annotations/useSelectionToolbarActions";
import { AIContextMenu } from "@/components/editor/AIContextMenu";
import { BlockHandlePortal } from "@/components/editor/BlockHandlePortal";
import { SlashMenuPortal } from "@/components/editor/SlashMenuPortal";
import { ExportDialog } from "@/components/export/ExportDialog";
import { ReaderShellLayout } from "@/components/layout/ReaderShellLayout";
import { SplitPaneLayout } from "@/components/layout/SplitPaneLayout";
import { LfccDebugOverlay } from "@/components/lfcc/DebugOverlay/LfccDebugOverlay";
import { DivergenceBanner, useDivergenceState } from "@/components/lfcc/DivergenceBanner";
import { LfccDragLayer } from "@/components/lfcc/LfccDragLayer";
import { LfccEditorProvider } from "@/components/lfcc/LfccEditorContext";
import { PolicyDegradationBanner } from "@/components/lfcc/PolicyDegradationBanner";
import { ShowcaseScriptPanel } from "@/components/lfcc/ShowcaseScriptPanel";
import { createLfccSeeder } from "@/components/lfcc/seedLfccDemo";
import { useLfccBridge } from "@/components/lfcc/useLfccBridge";
import { Button } from "@/components/ui/Button";
import {
  KeyboardShortcutsModal,
  useKeyboardShortcutsModal,
} from "@/components/ui/KeyboardShortcutsModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { GhostTextProvider, useGhostText } from "@/context/GhostTextContext";
import {
  KeyboardShortcutsProvider,
  useKeyboardShortcuts,
} from "@/context/KeyboardShortcutsContext";
import { useAnnotationNavigation } from "@/hooks/useAnnotationNavigation";
import { useDeepLinking } from "@/hooks/useDeepLinking";
import { useExportDialog } from "@/hooks/useExportDialog";
import { useFocusMode } from "@/hooks/useFocusMode";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useQuickAnnotation } from "@/hooks/useQuickAnnotation";
import { useSelectionContext } from "@/hooks/useSelectionContext";
import type { AIMenuState } from "@/lib/editor/aiMenuPlugin";
import type { BlockHandleState } from "@/lib/editor/blockHandlePlugin";
import { useReactNodeViews } from "@/lib/editor/useReactNodeViews";
import { useAnnotationStore } from "@/lib/kernel/store";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import { useReproBundle } from "@/lib/lfcc/useReproBundle";
import { ProseMirror, ProseMirrorDoc } from "@handlewithcare/react-prosemirror";
import { useEditorEffect } from "@handlewithcare/react-prosemirror";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

/**
 * EditorGhostTextOverlay - Renders ghost text within the editor.
 * Connects to GhostTextContext for AI-powered inline suggestions.
 */
function EditorGhostTextOverlay(): React.ReactElement | null {
  const { state, accept, acceptWord, acceptLine, reject } = useGhostText();

  if (!state.visible) {
    return null;
  }

  return (
    <GhostText
      text={state.text}
      visible={state.visible}
      isStreaming={state.isStreaming}
      onAccept={accept}
      onAcceptWord={acceptWord}
      onAcceptLine={acceptLine}
      onReject={reject}
      className="absolute bottom-0 left-0"
    />
  );
}

function EditorBridge({
  onView,
}: { onView: (view: import("prosemirror-view").EditorView) => void }) {
  useEditorEffect(
    (view) => {
      if (view) {
        onView(view);
      }
    },
    [onView]
  );
  return null;
}

const AIPanel = dynamic(() => import("@/components/layout/AIPanel").then((mod) => mod.AIPanel), {
  loading: () => <Skeleton className="h-full w-full bg-surface-1/30" />,
  ssr: false,
});

export default function EditorPage() {
  return (
    <KeyboardShortcutsProvider>
      <EditorPageContent />
    </KeyboardShortcutsProvider>
  );
}

// Parse seed param: "1k", "10k", "liquid-refactor", or number
type SeedValue = number | "liquid-refactor" | undefined;

function parseSeedValue(seedParam: string | null): SeedValue {
  if (!seedParam) {
    return undefined;
  }
  if (seedParam === "liquid-refactor") {
    return "liquid-refactor";
  }
  if (seedParam === "1k") {
    return 1000;
  }
  if (seedParam === "10k") {
    return 10000;
  }
  const num = Number(seedParam);
  return !Number.isNaN(num) ? num : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component wiring remains centralized.
function EditorPageContent() {
  const isDev = process.env.NODE_ENV !== "production";
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [hydrated, setHydrated] = React.useState(false);
  const t = useTranslations("EditorPage");
  const { toast } = useToast();
  const nodeViews = useReactNodeViews();

  // URL parameters for demo compatibility
  const searchParams = useSearchParams();
  const docId = searchParams?.get("doc") || "1";
  const peerId = searchParams?.get("peer") || "1";
  const syncModeParam = searchParams?.get("syncMode");
  const seedParam = searchParams?.get("seed");
  const seedValue = React.useMemo(() => parseSeedValue(seedParam), [seedParam]);
  const showShowcase = searchParams?.get("showcase") === "1";
  const splitDocId = searchParams?.get("split");

  const [reproStatus, setReproStatus] = React.useState<"idle" | "exported" | "error">("idle");
  const [isReadOnly, setIsReadOnly] = React.useState(false);
  const [blockHandleState, setBlockHandleState] = React.useState<BlockHandleState | null>(null);
  const [aiMenuState, setAiMenuState] = React.useState<AIMenuState | null>(null);
  const closeAIMenu = React.useCallback(() => setAiMenuState(null), []);

  const addDirtyInfo = useLfccDebugStore((state) => state.addDirtyInfo);
  const addError = useLfccDebugStore((state) => state.addError);
  const setPerfSample = useLfccDebugStore((state) => state.setPerfSample);
  const { download } = useReproBundle();

  // Divergence state management
  const { divergence, handleDivergence, clearDivergence, isDiverged } = useDivergenceState();

  const failClosedBanner = useFailClosedBanner(isDev);
  const handleFailClosed = React.useCallback(
    (info: { message: string; payload: Record<string, unknown> }) => {
      addError({
        code: "FAIL_CLOSED",
        message: info.message,
        payload: info.payload,
        source: "selection",
      });
      failClosedBanner.showFailClosed(info);
    },
    [addError, failClosedBanner]
  );

  const failClosedState = React.useMemo(
    () => ({
      failClosed: failClosedBanner.failClosed,
      showFailClosed: handleFailClosed,
      clearFailClosed: failClosedBanner.clearFailClosed,
    }),
    [failClosedBanner.failClosed, failClosedBanner.clearFailClosed, handleFailClosed]
  );

  const {
    contextValue,
    syncSummary,
    editorState,
    handleDispatchTransaction,
    handleCreatedView,
    bridge,
    reactNodeViews,
  } = useLfccBridge(docId, peerId, {
    seed: React.useMemo(() => createLfccSeeder(seedValue), [seedValue]),
    onFailClosed: handleFailClosed,
    enableHandles: isDev,
    enableHistory: false, // P0: Use Loro UndoManager instead of PM history
    enablePerf: isDev,
    onPerfSample: setPerfSample,
    onDirtyInfo: addDirtyInfo,
    onDivergence: handleDivergence,
    onBlockHandleStateChange: setBlockHandleState,
    onAIMenuStateChange: setAiMenuState,
    reactNodeViews: nodeViews,
    syncMode:
      syncModeParam === "websocket" || syncModeParam === "broadcast" || syncModeParam === "polling"
        ? syncModeParam
        : undefined,
    onError: (error) =>
      addError({
        code: "BRIDGE_ERROR",
        message: error.message,
        stack: error.stack,
        source: "bridge",
      }),
  });

  const isRoleReadOnly = syncSummary.role === "viewer";
  const effectiveReadOnly = isReadOnly || isRoleReadOnly;

  const annotationsById = useAnnotationStore((state) => state.annotations);
  const forcedDivergenceRef = React.useRef(false);
  const triggerForceDivergence = React.useCallback(() => {
    if (forcedDivergenceRef.current) {
      return;
    }
    forcedDivergenceRef.current = true;
    handleDivergence({
      diverged: true,
      editorChecksum: "forced-editor",
      loroChecksum: "forced-loro",
      reason: "Forced divergence for testing",
    });
  }, [handleDivergence]);

  const { missingAnnotationId } = useDeepLinking({
    view: contextValue?.view ?? null,
    searchParams,
    annotationsById,
    toast,
  });

  // Policy degradation notification
  const policyDegradeNotifiedRef = React.useRef(false);
  React.useEffect(() => {
    if (!syncSummary.policyDegraded || policyDegradeNotifiedRef.current) {
      return;
    }
    policyDegradeNotifiedRef.current = true;
    const reasons =
      syncSummary.policyDegradation && syncSummary.policyDegradation.length > 0
        ? syncSummary.policyDegradation.map((s) => s.reason).join("; ")
        : "Policy tightened by server";
    toast(`Compatibility mode: ${reasons}`, "warning");
  }, [syncSummary.policyDegraded, syncSummary.policyDegradation, toast]);

  // Reload and read-only handlers
  const handleReload = React.useCallback(() => {
    clearDivergence();
    window.location.reload();
  }, [clearDivergence]);

  const handleReadOnly = React.useCallback(() => {
    setIsReadOnly(true);
  }, []);

  // Apply read-only mode to editor
  React.useEffect(() => {
    if (!contextValue?.view || contextValue.view.isDestroyed) {
      return;
    }
    contextValue.view.setProps({
      editable: () => !effectiveReadOnly,
    });
  }, [contextValue, effectiveReadOnly]);

  React.useEffect(() => {
    const force =
      searchParams?.get("forceDivergence") ??
      new URLSearchParams(window.location.search).get("forceDivergence");
    if (force !== "1") {
      return;
    }
    triggerForceDivergence();
  }, [searchParams, triggerForceDivergence]);

  React.useEffect(() => {
    const handler = () => triggerForceDivergence();
    const globalAny = window as Window & { __lfccForceDivergence?: () => void };
    globalAny.__lfccForceDivergence = handler;
    window.addEventListener("lfcc-force-divergence", handler);
    return () => {
      if (globalAny.__lfccForceDivergence === handler) {
        globalAny.__lfccForceDivergence = undefined;
      }
      window.removeEventListener("lfcc-force-divergence", handler);
    };
  }, [triggerForceDivergence]);

  useSelectionToolbarActions({
    lfcc: contextValue,
    onFailClosed: handleFailClosed,
  });

  // Keyboard-first experience hooks
  useAnnotationNavigation();
  useQuickAnnotation();
  useFocusMode();
  const {
    isOpen: isShortcutsModalOpen,
    open: openShortcutsModal,
    close: closeShortcutsModal,
  } = useKeyboardShortcutsModal();

  // Export dialog (triggered by /export slash command)
  const { isOpen: isExportOpen, close: closeExport } = useExportDialog();

  // Register Cmd+/ shortcut for keyboard shortcuts modal
  const { registerShortcut, unregisterShortcut } = useKeyboardShortcuts();
  React.useEffect(() => {
    registerShortcut({
      id: "keyboard-shortcuts",
      label: "Keyboard Shortcuts",
      keys: ["cmd", "/"],
      description: "Show all keyboard shortcuts",
      section: "Help",
      action: openShortcutsModal,
    });
    return () => unregisterShortcut("keyboard-shortcuts");
  }, [registerShortcut, unregisterShortcut, openShortcutsModal]);

  const { selectedText, pageContext, selectionSpans } = useSelectionContext(
    contextValue?.view ?? null,
    contextValue?.runtime ?? null
  );

  const handleDumpRepro = React.useCallback(() => {
    const ok = download();
    if (!ok) {
      setReproStatus("error");
      return;
    }

    setReproStatus("exported");
    window.setTimeout(() => setReproStatus("idle"), 2000);
  }, [download]);

  // P0: Check undo/redo availability from Loro UndoManager
  const canUndo = contextValue?.runtime ? contextValue.runtime.undoManager.canUndo() : false;
  const canRedo = contextValue?.runtime ? contextValue.runtime.undoManager.canRedo() : false;

  const handleUndo = React.useCallback(() => {
    // P0: Use Loro UndoManager for CRDT-native undo
    if (contextValue?.runtime && !contextValue.runtime.isDegraded()) {
      contextValue.runtime.undoManager.undo();
    }
  }, [contextValue]);

  const handleRedo = React.useCallback(() => {
    // P0: Use Loro UndoManager for CRDT-native redo
    if (contextValue?.runtime && !contextValue.runtime.isDegraded()) {
      contextValue.runtime.undoManager.redo();
    }
  }, [contextValue]);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const effectiveDesktop = hydrated && isDesktop;

  /* Bold Stable Mode: GRAD-axis (Default: ON) */
  const [boldStableMode] = React.useState<"grad" | "native">("grad");

  const editorPanel = (
    <main className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 bg-background/70 px-6 py-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("title")}</h1>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
          <ConnectionBadge state={syncSummary.state} pendingUpdates={syncSummary.pendingUpdates} />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label={t("undo")}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label={t("redo")}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          {isDev && (
            <Button size="sm" variant="ghost" onClick={handleDumpRepro} aria-label={t("dumpRepro")}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          {isDev && reproStatus === "exported" && (
            <span className="text-xs text-muted-foreground">{t("exported")}</span>
          )}
          {isDev && reproStatus === "error" && (
            <span className="text-xs text-red-600">{t("noEditorYet")}</span>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          className={`h-full overflow-auto px-6 py-6 lg:pr-[320px] ${boldStableMode === "grad" ? "lfcc-bold-stable-grad" : ""}`}
        >
          {editorState && (
            <div className="lfcc-editor relative" data-lfcc-editor data-testid="lfcc-editor">
              {/* Highlight Overlay (z-0) renders behind ProseMirror content (z-1) */}
              <HighlightOverlay />
              <ProseMirror
                state={editorState}
                dispatchTransaction={handleDispatchTransaction}
                nodeViews={reactNodeViews}
              >
                <EditorBridge onView={handleCreatedView} />
                <ProseMirrorDoc as={<div className="outline-none w-full h-full min-h-[500px]" />} />
                <EditorGhostTextOverlay />
              </ProseMirror>
            </div>
          )}
        </div>
        <aside
          data-testid="annotation-panel-container"
          className="absolute right-0 top-0 hidden h-full w-[320px] border-l border-border/40 bg-surface-0/95 shadow-sm lg:block"
          aria-label="Annotations panel"
        >
          <AnnotationManager
            docId={docId}
            syncSummary={syncSummary}
            onReload={handleReload}
            onReadOnly={handleReadOnly}
            isReadOnly={effectiveReadOnly}
            missingAnnotationId={missingAnnotationId}
          />
        </aside>
      </div>
    </main>
  );

  return (
    <GhostTextProvider
      options={{
        onAccept: (_text) => {
          // TODO: Insert accepted text at cursor position via ProseMirror transaction
        },
        onReject: () => {
          // TODO: Track rejection for analytics
        },
      }}
    >
      <LfccEditorProvider value={contextValue}>
        <LfccDragLayer>
          <SelectionToolbar failClosedState={failClosedState} isReadOnly={effectiveReadOnly} />
          <ReaderShellLayout
            isDesktop={effectiveDesktop}
            docId={docId}
            rightPanel={
              <AIPanel
                onClose={() => undefined}
                selectedText={selectedText}
                pageContext={pageContext}
                docId={docId}
                selectionSpans={selectionSpans}
                editorView={contextValue?.view}
                runtime={contextValue?.runtime}
              />
            }
          >
            <div className="h-full flex flex-col bg-surface-1/30">
              {/* Policy Degradation Banner */}
              {syncSummary.policyDegraded && syncSummary.policyDegradation && (
                <PolicyDegradationBanner reasons={syncSummary.policyDegradation} />
              )}

              {/* Divergence Banner */}
              {isDiverged && divergence && (
                <DivergenceBanner
                  info={divergence}
                  docId={docId}
                  onReload={handleReload}
                  onDismiss={clearDivergence}
                  onReadOnly={handleReadOnly}
                  isReadOnly={effectiveReadOnly}
                />
              )}

              {failClosedBanner.failClosed && (
                <div className="px-4 py-2 bg-amber-100 text-amber-900 text-sm">
                  {t("noEditorYet")}
                </div>
              )}

              {splitDocId ? (
                <SplitPaneLayout
                  primary={editorPanel}
                  secondary={
                    // Placeholder for secondary editor - reusing basic structure for now
                    // In a real implementation, we would recursively render another EditorPageContent or a dedicated SecondaryEditor component
                    <section
                      className="h-full w-full flex items-center justify-center bg-surface-2 text-muted-foreground"
                      aria-label="Secondary view"
                    >
                      <div className="text-center p-6">
                        <h2 className="font-medium mb-2">Secondary View</h2>
                        <p className="text-sm">Document ID: {splitDocId}</p>
                        {/* TODO: Implement full secondary editor here */}
                      </div>
                    </section>
                  }
                  initialRatio={0.5}
                  minSizePercent={20}
                />
              ) : (
                editorPanel
              )}
            </div>
          </ReaderShellLayout>
          <SlashMenuPortal />
          <BlockHandlePortal state={blockHandleState} />
          <AIContextMenu state={aiMenuState} onClose={closeAIMenu} bridge={bridge} />
        </LfccDragLayer>
        <LfccDebugOverlay />
        <KeyboardShortcutsModal isOpen={isShortcutsModalOpen} onClose={closeShortcutsModal} />
        <ExportDialog isOpen={isExportOpen} onClose={closeExport} documentTitle="LFCC Document" />
        {showShowcase && (
          <ShowcaseScriptPanel
            onReset={handleReload}
            className="fixed bottom-4 left-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] md:left-6"
          />
        )}
      </LfccEditorProvider>
    </GhostTextProvider>
  );
}
