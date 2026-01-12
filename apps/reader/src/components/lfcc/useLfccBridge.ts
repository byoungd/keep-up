"use client";

import { reactKeys } from "@handlewithcare/react-prosemirror";
import type { DirtyInfo } from "@keepup/core";
import {
  BridgeController,
  type DivergenceResult,
  EditorAdapterPM,
  type LoroRuntime,
  assignMissingBlockIds,
  createEmptyDoc,
  createLoroRuntime,
  nextBlockId,
  pmSchema,
  projectLoroToPm,
} from "@keepup/lfcc-bridge";
import { history } from "prosemirror-history";
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
import type { AIMenuState } from "@/lib/editor/aiMenuPlugin";
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

  const syncSummary = React.useMemo<DiagnosticsSyncSummary>(
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
  // PERF-010: Track processed transactions to avoid double-sync in Strict Mode
  // and ensure deterministic Block ID generation across render cycles
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
      if (!processedTrs.current.has(tr)) {
        processedTrs.current.add(tr);

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
      registerE2EHarness(view, handleDispatchRef, runtime);

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
    [bridge, runtime]
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
  runtime: LoroRuntime | null
): void {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_ENABLE_E2E_HOOKS === "false") {
    return;
  }

  const globalAny = window as unknown as {
    __lfccView: EditorView;
    __lfccUndo: () => void;
    __lfccRedo: () => void;
    __lfccSetContent: (text: string) => boolean;
    __lfccClearContent: () => boolean;
    __lfccForceCommit: () => void;
    pmTextSelection?: typeof TextSelection;
  };
  globalAny.__lfccView = view;
  globalAny.pmTextSelection = TextSelection;

  // Use configurable getters to ensure we always use the latest state from the view
  // and allow re-definition or clearing

  // P0 FIX: Use Loro UndoManager for E2E hooks as PM history is disabled
  Object.defineProperty(globalAny, "__lfccUndo", {
    get: () => () => {
      if (runtime && !runtime.isDegraded()) {
        runtime.undoManager.undo();
      } else {
        console.warn("[E2E Harness] Undo skipped: runtime not available or degraded");
      }
    },
    configurable: true,
  });
  Object.defineProperty(globalAny, "__lfccRedo", {
    get: () => () => {
      if (runtime && !runtime.isDegraded()) {
        runtime.undoManager.redo();
      } else {
        console.warn("[E2E Harness] Redo skipped: runtime not available or degraded");
      }
    },
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

        // Use the controlled dispatch path
        handleDispatchRef.current(tr);
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
    ...((options.enableHistory ?? false) ? [history()] : []),
    createAnnotationPlugin({
      runtime: runtime as unknown as LoroRuntime,
      onFailClosed: options.onFailClosed,
      enableHandles: options.enableHandles ?? true,
      enablePerf: options.enablePerf ?? false,
      onPerfSample: options.onPerfSample,
    }),
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
    if (!options.seed && syncMode !== "websocket" && !runtime.doc.getMap("blocks").size) {
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
}) {
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

        const { bridge, adapter } = initBridge(
          runtime,
          options,
          syncMode,
          setSlashMenuState,
          setEditorState
        );
        bridgeInstance = bridge;
        setBridge(bridge);

        // PERF-008: Delegate sync to bridge.onStateChange callback.
        // The bridge handles optimized sync from Loro and notifies React.
        // PERF-009: Batch rapid remote events with microtask queue to reduce re-renders.
        let syncPending = false;
        unsubscribeDoc = runtime.doc.subscribe((event) => {
          // Sync from Loro if the event is remote OR if it's a local undo/redo
          const isRemote = event.by !== "local";
          const isUndoRedo = event.origin === "undo" || event.origin === "redo";

          if ((isRemote || isUndoRedo) && bridgeInstance && !syncPending) {
            syncPending = true;
            queueMicrotask(() => {
              syncPending = false;
              if (bridgeInstance) {
                try {
                  bridgeInstance.syncFromLoro();
                } catch (e) {
                  console.error("[LFCC] Remote sync failed:", e);
                }
              }
            });
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
