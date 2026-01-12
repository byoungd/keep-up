"use client";

import { reactKeys } from "@handlewithcare/react-prosemirror";
import type { DirtyInfo } from "@keepup/core";
import {
  type AIGatewayWriteOptions,
  type AIGatewayWriteResult,
  AI_INTENT_META,
  BridgeController,
  type DivergenceResult,
  EditorAdapterPM,
  type LoroRuntime,
  type UndoController,
  applyAIGatewayWrite,
  assignMissingBlockIds,
  createEmptyDoc,
  createLoroRuntime,
  createUndoController,
  getRootBlocks,
  hasGatewayMetadata,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
} from "@keepup/lfcc-bridge";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { type EditorState, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

import type { FailClosedPayload } from "@/components/lfcc/DevFailClosedBanner";
import type { LfccEditorContextValue } from "@/components/lfcc/LfccEditorContext";
import { useLoroBroadcastSync } from "@/hooks/useLoroBroadcastSync";
import { useLoroPersistence } from "@/hooks/useLoroPersistence";
import { useLoroPollingSync } from "@/hooks/useLoroPollingSync";
import { useLoroWebSocketSync } from "@/hooks/useLoroWebSocketSync";
import type { PerfSample } from "@/lib/annotations/annotationPlugin";
import { createAnnotationPlugin } from "@/lib/annotations/annotationPlugin";
import { attachAnnotationRepo, detachAnnotationRepo } from "@/lib/annotations/annotationRepoBridge";
import { useCommentStore } from "@/lib/annotations/commentStore";
import { type AIMenuState, createAIMenuPlugin } from "@/lib/editor/aiMenuPlugin";
import { createAutoLinkPlugin } from "@/lib/editor/autoLinkPlugin";
import { createBlockBehaviorsPlugin } from "@/lib/editor/blockBehaviors";
import { type BlockHandleState, createBlockHandlePlugin } from "@/lib/editor/blockHandlePlugin";
import { createBlockMoveAnimationPlugin } from "@/lib/editor/blockMoveAnimationPlugin";
import { createHistoryTrackerPlugin } from "@/lib/editor/historyTrackerPlugin";
import { createInputRulesPlugin } from "@/lib/editor/inputRulesPlugin";
import { createKeymapPlugin } from "@/lib/editor/keymapPlugin";
import { createMarkdownPastePlugin } from "@/lib/editor/markdownPastePlugin";
import { createPastePipelinePlugin } from "@/lib/editor/pastePipelinePlugin";
import { createRemoteCursorPlugin, injectCursorStyles } from "@/lib/editor/remoteCursorPlugin";
import { type SlashMenuState, createSlashMenuPlugin } from "@/lib/editor/slashMenuPlugin";
import type { DiagnosticsSyncSummary } from "@/lib/lfcc/diagnosticsBundle";
import { createEditorSchemaValidator } from "@/lib/lfcc/editorSchemaValidator";
import { usePolicyDegradationStore } from "@/lib/lfcc/policyDegradationStore";
import { dropCursor } from "prosemirror-dropcursor";
import { columnResizing, tableEditing } from "prosemirror-tables";

export type SyncMode = "broadcast" | "websocket" | "polling" | "none";

export type LfccBridgeOptions = {
  seed?: (runtime: LoroRuntime) => void;
  onFailClosed?: (payload: FailClosedPayload) => void;
  enableHandles?: boolean;
  enableHistory?: boolean;
  onDirtyInfo?: (info: DirtyInfo) => void;
  onError?: (error: Error) => void;
  onDivergence?: (result: DivergenceResult) => void;
  enablePerf?: boolean;
  onPerfSample?: (sample: PerfSample) => void;
  enableSlashMenu?: boolean;
  onSlashMenuStateChange?: (state: SlashMenuState) => void;
  enableBlockBehaviors?: boolean;
  enableBlockHandle?: boolean;
  onBlockHandleStateChange?: (state: BlockHandleState) => void;
  enablePersistence?: boolean;
  /** Sync mode: broadcast (local cross-tab), websocket (server), polling (HTTP), or none */
  syncMode?: SyncMode;
  /** WebSocket server URL (required when syncMode is 'websocket') */
  websocketUrl?: string;
  /** User display name for presence */
  displayName?: string;
  /** @deprecated Use syncMode instead */
  enableSync?: boolean;
  /** Enable remote cursor decorations (default: true when websocket mode) */
  enableRemoteCursors?: boolean;
  enableAI?: boolean;
  onAIMenuStateChange?: (state: AIMenuState | null) => void;
  token?: string;
  /** React components for node views */
  reactNodeViews?: Record<
    string,
    React.ComponentType<import("@handlewithcare/react-prosemirror").NodeViewComponentProps>
  >;
};

export function useLfccBridge(docId: string, peerId = "1", options: LfccBridgeOptions = {}) {
  const [contextValue, setContextValue] = React.useState<LfccEditorContextValue | null>(null);
  const setPolicyDegradation = usePolicyDegradationStore((s) => s.setDegradation);
  const [runtime, setRuntime] = React.useState<LoroRuntime | null>(null);
  const [slashMenuState, setSlashMenuState] = React.useState<SlashMenuState | null>(null);
  const [editorState, setEditorState] = React.useState<EditorState | null>(null);
  const [bridge, setBridge] = React.useState<BridgeController | null>(null);
  // P0-1: Track undo controller for sync-aware undo/redo
  const [undoController, setUndoController] = React.useState<UndoController | null>(null);
  const editorStateRef = React.useRef<EditorState | null>(null);

  // Determine sync mode
  const syncMode: SyncMode =
    options.syncMode ?? (options.enableSync === false ? "none" : "broadcast");

  const wsEnabled =
    syncMode === "websocket" || process.env.NEXT_PUBLIC_SYNC_TRANSPORT === "websocket";

  const pollingEnabled =
    syncMode === "polling" || process.env.NEXT_PUBLIC_SYNC_TRANSPORT === "polling";

  React.useEffect(() => {
    if (slashMenuState !== undefined) {
      setContextValue((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.slashMenuState === slashMenuState) {
          return prev;
        }
        return { ...prev, slashMenuState };
      });
    }
  }, [slashMenuState]);

  // Compose persistence and sync hooks
  const { status: persistenceStatus } = useLoroPersistence(runtime, docId, {
    enabled: options.enablePersistence ?? true,
  });

  useLoroBroadcastSync(runtime, docId, {
    enabled: syncMode === "broadcast",
  });

  const wsUrl =
    process.env.NEXT_PUBLIC_SYNC_TRANSPORT === "websocket" || syncMode === "websocket"
      ? process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3030"
      : undefined;

  const token = options.token;

  const websocketSync = useLoroWebSocketSync(runtime, {
    serverUrl: wsUrl ?? "ws://localhost:3030",
    docId,
    displayName: options.displayName,
    enabled: wsEnabled,
    token,
  });

  const pollingUrl =
    process.env.NEXT_PUBLIC_SYNC_HTTP_URL ??
    (wsUrl ? wsUrl.replace(/^ws/, "http") : "http://localhost:3030");

  const pollingSync = useLoroPollingSync(runtime, {
    serverUrl: pollingUrl,
    docId,
    enabled: pollingEnabled,
    token,
  });

  const activeSync = pollingEnabled ? pollingSync : websocketSync;

  // P1-2: Compute sync summary with stable dependencies
  const syncSummaryBase = React.useMemo<DiagnosticsSyncSummary>(
    () => ({
      state: activeSync.connectionState,
      error: activeSync.error,
      pendingUpdates: activeSync.pendingUpdates,
      lastSyncAt: activeSync.lastSyncAt,
      docId,
      clientId: activeSync.clientId,
      sessionId: activeSync.sessionId,
      role: activeSync.role,
      peers: activeSync.peers,
      effectiveManifest: activeSync.effectiveManifest,
      policyDegraded: activeSync.policyDegraded,
      policyDegradation: activeSync.policyDegradation,
    }),
    [
      activeSync.clientId,
      activeSync.connectionState,
      activeSync.error,
      activeSync.effectiveManifest,
      activeSync.lastSyncAt,
      activeSync.pendingUpdates,
      activeSync.policyDegradation,
      activeSync.policyDegraded,
      activeSync.peers,
      activeSync.role,
      activeSync.sessionId,
      docId,
    ]
  );

  // P1-2: Defer non-critical sync summary updates to reduce render priority
  const syncSummary = React.useDeferredValue(syncSummaryBase);

  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const syncSummaryRef = React.useRef(syncSummary);
  React.useEffect(() => {
    syncSummaryRef.current = syncSummary;
  }, [syncSummary]);

  useLfccInit({
    docId,
    peerId,
    syncMode,
    optionsRef,
    setRuntime,
    setContextValue,
    syncSummaryRef,
    setSlashMenuState,
    setEditorState,
    setBridge,
    // P0-1: Pass setUndoController for sync-aware undo/redo
    setUndoController,
  });

  React.useEffect(() => {
    setContextValue((prev) => {
      if (!prev || prev.syncSummary === syncSummary) {
        return prev;
      }
      return { ...prev, syncSummary };
    });
  }, [syncSummary]);

  React.useEffect(() => {
    setPolicyDegradation(syncSummary.policyDegraded ?? false, syncSummary.policyDegradation ?? []);
  }, [setPolicyDegradation, syncSummary.policyDegraded, syncSummary.policyDegradation]);

  // Update remote cursors - use ref to avoid re-render loop
  const viewRef = React.useRef<EditorView | null>(null);
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || syncMode !== "websocket") {
      return;
    }

    injectCursorStyles();

    const cursors = websocketSync.peers
      .filter((p): p is typeof p & { cursor: NonNullable<typeof p.cursor> } => p.cursor != null)
      .map((p) => ({
        clientId: p.clientId,
        displayName: p.displayName,
        color: p.color,
        blockId: p.cursor.blockId,
        offset: p.cursor.offset,
        lastSeen: Date.now(),
      }));

    if (cursors.length > 0) {
      import("@/lib/editor/remoteCursorPlugin").then(({ remoteCursorPluginKey }) => {
        if (view && !view.isDestroyed) {
          const tr = view.state.tr.setMeta(remoteCursorPluginKey, {
            type: "update",
            cursors,
          });
          view.dispatch(tr);
        }
      });
    }
  }, [websocketSync.peers, syncMode]);

  // Interface for ProseMirror component
  // In uncontrolled mode (defaultState), the library manages EditorState internally.
  // We only need to sync document changes to Loro.
  // WeakSet only prevents same object reuse, which is sufficient for preventing infinite loops
  // with the bridge's syncToLoro -> setEditorState cycle.
  const processedTrs = React.useRef(new WeakSet<import("prosemirror-state").Transaction>());
  const idTrCache = React.useRef(
    new WeakMap<
      import("prosemirror-state").Transaction,
      import("prosemirror-state").Transaction | null
    >()
  );

  // Interface for ProseMirror component
  // In uncontrolled mode (defaultState), the library manages EditorState internally.
  // We only need to sync document changes to Loro.
  const handleDispatchTransaction = React.useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transaction dispatch logic requires sequential checks
    (tr: import("prosemirror-state").Transaction) => {
      const baseState = viewRef.current?.state ?? editorStateRef.current;
      if (!baseState) {
        return;
      }

      // P0-3: Fast path - check WeakSet first (most common case)
      if (processedTrs.current.has(tr)) {
        return;
      }

      // Mark as processed
      processedTrs.current.add(tr);

      if (tr.getMeta(AI_INTENT_META) === true && !hasGatewayMetadata(tr)) {
        const error = new Error("AI write rejected: missing gateway metadata");
        console.error("[LFCC][ai-gateway] rejected AI write without gateway metadata");
        throw error;
      }
      // Apply original tr to get intermediate state
      const intermediateState = baseState.apply(tr);

      // Check for missing IDs in the intermediate state
      // Use cache to ensure deterministic behavior in Strict Mode
      let idTr = idTrCache.current.get(tr);
      if (idTr === undefined) {
        if (runtime) {
          try {
            idTr = assignMissingBlockIds(intermediateState, () => nextBlockId(runtime.doc));
            if (idTr) {
              console.info(
                `[LFCC] Appending ${idTr.steps.length} ID assignment steps to transaction`
              );
              // If we have ID fixes, append them to the ORIGINAL transaction
              // This ensures Loro receives a single atomic transaction that results in a valid tree
              for (const step of idTr.steps) {
                tr.step(step);
              }
            }
          } catch (e) {
            console.error("[LFCC] Block ID assignment failed:", e);
            idTr = null;
          }
        } else {
          idTr = null;
        }
        idTrCache.current.set(tr, idTr);
      }

      // Apply the (possibly modified) tr to get final state
      const finalState = baseState.apply(tr);

      const view = viewRef.current;
      if (view && !view.isDestroyed) {
        view.updateState(finalState);
      }

      editorStateRef.current = finalState;
      setEditorState(finalState);

      // SIDE EFFECT: Sync to Loro
      // Safe to do here because we guard against double-execution with WeakSet
      // SIDE EFFECT: Sync to Loro
      // Safe to do here because we guard against double-execution with WeakSet at function start
      if (bridge && runtime) {
        try {
          // Sync to Loro
          if (tr.docChanged) {
            bridge.syncTransactionToLoro(tr);
          }
        } catch (err) {
          console.error("[LFCC] Loro sync failed:", err);
        }
      }
    },
    [bridge, runtime]
  );

  const handleDispatchRef = React.useRef(handleDispatchTransaction);
  React.useEffect(() => {
    handleDispatchRef.current = handleDispatchTransaction;
  }, [handleDispatchTransaction]);

  React.useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  const handleCreatedView = React.useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      // Register global harness for E2E FIRST - this must happen regardless of bridge state
      // Pass the controlled dispatch handler so E2E tests use the correct path
      // P0-1: Pass undoController for sync-aware undo/redo
      registerE2EHarness(view, handleDispatchRef, runtime, undoController);

      // Only update bridge if available
      if (bridge) {
        bridge.setView(view);
      }

      setContextValue((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.view === view) {
          return prev;
        }
        return { ...prev, view };
      });
    },
    [bridge, runtime, undoController]
  );

  // Clean up harness on unmount
  React.useEffect(() => {
    return () => {
      viewRef.current = null;
      if (typeof window !== "undefined") {
        const globalAny = window as unknown as Record<string, unknown>;
        if (globalAny.__lfccView) {
          globalAny.__lfccView = undefined;
        }
        // MUST use defineProperty to clear these because they are currently getters
        Object.defineProperty(globalAny, "__lfccUndo", { value: undefined, configurable: true });
        Object.defineProperty(globalAny, "__lfccRedo", { value: undefined, configurable: true });
        Object.defineProperty(globalAny, "__lfccSetContent", {
          value: undefined,
          configurable: true,
        });
        Object.defineProperty(globalAny, "__lfccClearContent", {
          value: undefined,
          configurable: true,
        });
        Object.defineProperty(globalAny, "__applyAIGatewayWrite", {
          value: undefined,
          configurable: true,
        });
        Object.defineProperty(globalAny, "__AI_INTENT_META", {
          value: undefined,
          configurable: true,
        });
        Object.defineProperty(globalAny, "pmTextSelection", {
          value: undefined,
          configurable: true,
        });
      }
    };
  }, []);

  return {
    contextValue,
    persistenceStatus,
    syncSummary,
    editorState,
    handleDispatchTransaction,
    handleCreatedView,
    bridge,
    reactNodeViews: options.reactNodeViews,
  };
}

function registerE2EHarness(
  view: EditorView,
  handleDispatchRef: React.MutableRefObject<(tr: import("prosemirror-state").Transaction) => void>,
  runtime: LoroRuntime | null,
  undoController: UndoController | null
): void {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_ENABLE_E2E_HOOKS === "false") {
    return;
  }

  const globalAny = window as unknown as {
    __lfccView: EditorView;
    __lfccUndo: () => boolean;
    __lfccRedo: () => boolean;
    __lfccSetContent: (text: string) => boolean;
    __lfccClearContent: () => boolean;
    __lfccForceCommit: () => void;
    __applyAIGatewayWrite?: (payload: AIGatewayWriteOptions) => AIGatewayWriteResult;
    __AI_INTENT_META?: string;
    __lfccUndoState: () => string;
    pmTextSelection?: typeof TextSelection;
  };
  globalAny.__lfccView = view;
  globalAny.pmTextSelection = TextSelection;

  // Use configurable getters to ensure we always use the latest state from the view
  // and allow re-definition or clearing

  // P0-1 FIX: Use enhanced UndoController with sync-awareness
  Object.defineProperty(globalAny, "__lfccUndo", {
    get: () => () => {
      if (undoController) {
        return undoController.undo();
      }
      if (runtime && !runtime.isDegraded()) {
        runtime.undoManager.undo();
        return true;
      }
      console.warn("[E2E Harness] Undo skipped: runtime not available or degraded");
      return false;
    },
    configurable: true,
  });
  Object.defineProperty(globalAny, "__lfccRedo", {
    get: () => () => {
      if (undoController) {
        return undoController.redo();
      }
      if (runtime && !runtime.isDegraded()) {
        runtime.undoManager.redo();
        return true;
      }
      console.warn("[E2E Harness] Redo skipped: runtime not available or degraded");
      return false;
    },
    configurable: true,
  });
  // P0-1: Expose undo state for E2E diagnostics
  Object.defineProperty(globalAny, "__lfccUndoState", {
    get: () => () => undoController?.getState() ?? "unknown",
    configurable: true,
  });
  Object.defineProperty(globalAny, "__lfccSetContent", {
    get:
      () =>
      (text: string): boolean => {
        try {
          const { state } = view;
          const { schema } = state;
          const paragraph = schema.nodes.paragraph;
          const docNode = schema.nodes.doc;

          if (!paragraph || !docNode) {
            return false;
          }

          const lines = text.split(/\r?\n/);
          const paragraphNodes = lines.map((line, index) => {
            const blockId = runtime ? nextBlockId(runtime.doc) : `e2e-${Date.now()}-${index}`;
            return paragraph.create(
              { block_id: blockId },
              line.length > 0 ? [schema.text(line)] : []
            );
          });
          const nextDoc = docNode.create(null, paragraphNodes);
          const tr = state.tr.replaceWith(0, state.doc.content.size, nextDoc);
          let endPos: number | null = null;
          tr.doc.descendants((node, pos) => {
            if (!node.isTextblock) {
              return true;
            }
            endPos = pos + 1 + node.content.size;
            return true;
          });
          if (endPos !== null) {
            tr.setSelection(TextSelection.create(tr.doc, endPos, endPos));
          }

          // Use the controlled dispatch path
          handleDispatchRef.current(tr);
          return true;
        } catch (e) {
          console.error("[E2E Harness] __lfccSetContent failed:", e);
          return false;
        }
      },
    configurable: true,
  });

  // E2E hook for clearing content - uses controlled dispatch path
  Object.defineProperty(globalAny, "__lfccClearContent", {
    get: () => (): boolean => {
      try {
        const { state } = view;
        const { schema } = state;
        const paragraph = schema.nodes.paragraph;
        const docNode = schema.nodes.doc;

        if (!paragraph || !docNode) {
          return false;
        }

        const emptyParagraph = paragraph.create(null, []);
        const emptyDoc = docNode.create(null, [emptyParagraph]);
        const tr = state.tr.replaceWith(0, state.doc.content.size, emptyDoc);
        // Reset selection into the empty paragraph so keyboard input works immediately.
        try {
          tr.setSelection(TextSelection.create(tr.doc, 1, 1));
        } catch {
          // Fallback to default selection mapping if position is invalid.
        }

        // Use the controlled dispatch path
        handleDispatchRef.current(tr);
        view.focus();
        return true;
      } catch (e) {
        console.error("[E2E Harness] __lfccClearContent failed:", e);
        return false;
      }
    },
    configurable: true,
  });

  // E2E hook for forcing Loro commit - creates undo step boundary
  // Uses a trick: temporarily set mergeInterval to 0 to force a new undo step
  Object.defineProperty(globalAny, "__lfccForceCommit", {
    get: () => (): void => {
      if (runtime && !runtime.isDegraded()) {
        // Commit any pending changes first
        runtime.doc.commit({ origin: "e2e-force" });
        // The mergeInterval is configured in LoroRuntime constructor
        // and commits within that interval are grouped together.
        // For E2E, we just ensure any pending changes are committed.
      }
    },
    configurable: true,
  });

  Object.defineProperty(globalAny, "__applyAIGatewayWrite", {
    get:
      () =>
      (payload: AIGatewayWriteOptions): AIGatewayWriteResult =>
        applyAIGatewayWrite(view, payload),
    configurable: true,
  });

  Object.defineProperty(globalAny, "__AI_INTENT_META", {
    value: AI_INTENT_META,
    configurable: true,
  });
}

function createPlugins(
  runtime: LoroRuntime,
  options: LfccBridgeOptions,
  setSlashMenuState: React.Dispatch<React.SetStateAction<SlashMenuState | null>>,
  _sendCursor?: (blockId: string, offset: number) => void
) {
  return [
    ...((options.enableBlockBehaviors ?? true)
      ? [createBlockBehaviorsPlugin({ runtime: runtime as unknown as LoroRuntime })]
      : []),
    // P0 FIX: PM history is disabled by default; Loro undoManager handles undo/redo
    ...((options.enableHistory ?? false)
      ? [history()]
      : [
          keymap({
            "Mod-z": () => {
              runtime.undoManager.undo();
              return true;
            },
            "Mod-y": () => {
              runtime.undoManager.redo();
              return true;
            },
            "Mod-Shift-z": () => {
              runtime.undoManager.redo();
              return true;
            },
          }),
        ]),
    createAnnotationPlugin({
      runtime: runtime as unknown as LoroRuntime,
      onFailClosed: options.onFailClosed,
      enableHandles: options.enableHandles ?? true,
      enablePerf: options.enablePerf ?? false,
      onPerfSample: options.onPerfSample,
    }),
    ...((options.enableAI ?? true)
      ? [createAIMenuPlugin({ onStateChange: options.onAIMenuStateChange })]
      : []),
    ...((options.enableSlashMenu ?? true)
      ? [createSlashMenuPlugin({ onStateChange: setSlashMenuState })]
      : []),
    ...((options.enableBlockHandle ?? true)
      ? [createBlockHandlePlugin({ onStateChange: options.onBlockHandleStateChange })]
      : []),
    ...((options.enableRemoteCursors ?? true) ? [createRemoteCursorPlugin()] : []),
    // Drop Cursor
    dropCursor({ class: "lfcc-drop-cursor", color: "var(--color-accent-indigo)", width: 2 }),
    createPastePipelinePlugin(),
    createMarkdownPastePlugin(),
    createInputRulesPlugin(pmSchema),
    createKeymapPlugin(pmSchema),
    createAutoLinkPlugin(pmSchema),
    createHistoryTrackerPlugin(),
    createBlockMoveAnimationPlugin(),
    columnResizing(),
    tableEditing(),
    reactKeys(),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions (extracted for complexity reduction)
// ─────────────────────────────────────────────────────────────────────────────

async function initRuntime(
  docId: string,
  peerId: string,
  syncMode: SyncMode,
  options: LfccBridgeOptions
) {
  const { loadDocSnapshot } = await import("@/hooks/useLoroPersistence");
  const snapshot = await loadDocSnapshot(docId).catch(() => null);

  const runtime = createLoroRuntime({ peerId: peerId as unknown as `${number}` });

  if (snapshot) {
    runtime.doc.import(snapshot);
  } else {
    if (syncMode !== "websocket") {
      options.seed?.(runtime);
    }
    if (!options.seed && syncMode !== "websocket" && getRootBlocks(runtime.doc).length === 0) {
      createEmptyDoc(runtime.doc);
    }
  }

  useCommentStore.getState().init(runtime);
  attachAnnotationRepo(runtime as unknown as LoroRuntime);

  return runtime;
}

function initBridge(
  runtime: LoroRuntime,
  options: LfccBridgeOptions,
  syncMode: SyncMode,
  setSlashMenuState: React.Dispatch<React.SetStateAction<SlashMenuState | null>>,
  setEditorState: React.Dispatch<
    React.SetStateAction<import("prosemirror-state").EditorState | null>
  >
) {
  const plugins = createPlugins(runtime, options, setSlashMenuState);
  const adapter = new EditorAdapterPM({ plugins });

  const bridge = new BridgeController({
    runtime: runtime as unknown as LoroRuntime,
    adapter,
    onDirtyInfo: options.onDirtyInfo,
    onError: options.onError,
    onDivergence: options.onDivergence,
    bootstrapPeerId: syncMode === "websocket" ? 0 : undefined,
    schemaValidator: createEditorSchemaValidator(adapter.schema),
    // PERF-008: Use bridge's optimized sync path for React state updates
    onStateChange: (state) => setEditorState(state),
  });

  return { bridge, adapter };
}

function useLfccInit({
  docId,
  peerId,
  syncMode,
  optionsRef,
  setRuntime,
  setContextValue,
  syncSummaryRef,
  setSlashMenuState,
  setEditorState,
  setBridge,
  // P0-1: Add setUndoController for sync-aware undo/redo
  setUndoController,
}: {
  docId: string;
  peerId: string;
  syncMode: SyncMode;
  optionsRef: React.MutableRefObject<LfccBridgeOptions>;
  setRuntime: (rt: LoroRuntime | null) => void;
  setContextValue: (val: LfccEditorContextValue | null) => void;
  syncSummaryRef: React.MutableRefObject<DiagnosticsSyncSummary>;
  setSlashMenuState: React.Dispatch<React.SetStateAction<SlashMenuState | null>>;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setBridge: (bridge: BridgeController | null) => void;
  // P0-1: UndoController setter
  setUndoController: (controller: UndoController | null) => void;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: setUndoController is a stable setter from useState
  React.useEffect(() => {
    let isMounted = true;
    let bridgeInstance: BridgeController | null = null;
    let unsubscribeDoc: (() => void) | null = null;

    const start = async () => {
      try {
        const options = optionsRef.current;
        const runtime = await initRuntime(docId, peerId, syncMode, options);
        if (!isMounted) {
          return;
        }

        setRuntime(runtime);

        // P0-1: Create sync-aware UndoController
        const undoCtrl = createUndoController(runtime);
        setUndoController(undoCtrl);

        const { bridge, adapter } = initBridge(
          runtime,
          options,
          syncMode,
          setSlashMenuState,
          setEditorState
        );
        bridgeInstance = bridge;
        setBridge(bridge);

        // P0-3 FIX: Explicitly attach annotation repo to runtime to enable Store sync
        attachAnnotationRepo(runtime);

        // PERF-008: Delegate sync to bridge.onStateChange callback.
        // The bridge handles optimized sync from Loro and notifies React.
        // PERF-009: Batch rapid remote events with microtask queue to reduce re-renders.
        const _syncPending = false;
        let hasUndoRedoPending = false; // P0-1: Track if any pending event was undo/redo

        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Loro event handler needs complex branching for sync logic
        unsubscribeDoc = runtime.doc.subscribe((event) => {
          // Simplified Sync Logic (P0-3 Fix):
          // To ensure correctness and E2E reliability, we sync on ALL events
          // unless they are explicitly generated by the bridge itself (infinite loop prevention).
          const isBridgeInternal =
            event.origin?.startsWith("lfcc-bridge") || event.origin?.startsWith("sys:");
          if (isBridgeInternal) {
            return;
          }

          const isUndoRedo = event.origin === "undo" || event.origin === "redo";
          if (isUndoRedo) {
            hasUndoRedoPending = true;
          }

          if (bridgeInstance) {
            try {
              // Synchronous sync for immediate UI updates
              bridgeInstance.syncFromLoro();

              if (hasUndoRedoPending) {
                undoCtrl.notifySyncComplete();
                hasUndoRedoPending = false;
              }
            } catch (e) {
              console.error("[LFCC] Sync failed:", e);
              hasUndoRedoPending = false;
            }
          }
        });

        const initialDoc = projectLoroToPm(runtime.doc, adapter.schema);
        const state = adapter.createState(initialDoc);
        setEditorState(state);

        setContextValue({
          view: null as unknown as EditorView,
          runtime: runtime as unknown as LoroRuntime,
          slashMenuState: null,
          syncSummary: syncSummaryRef.current,
        });
      } catch (e) {
        console.error("Init failed:", e);
      }
    };

    start();

    return () => {
      isMounted = false;
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
      useCommentStore.getState().disconnect();
      detachAnnotationRepo();
      setContextValue(null);
      if (bridgeInstance) {
        bridgeInstance.destroy();
      }
      setRuntime(null);
      setBridge(null);
    };
  }, [
    docId,
    peerId,
    syncMode,
    setRuntime,
    setContextValue,
    setSlashMenuState,
    setEditorState,
    setBridge,
    optionsRef,
    syncSummaryRef,
  ]);
}
