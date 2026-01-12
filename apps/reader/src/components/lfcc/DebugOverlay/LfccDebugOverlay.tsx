"use client";

import type { DirtyInfo } from "@keepup/core";
import {
  DEFAULT_NEIGHBOR_EXPANSION_POLICY,
  DEFAULT_POLICY_MANIFEST,
  computePolicyManifestHash,
  validateSyncManifest,
} from "@keepup/core";
import { type LoroRuntime, pmSelectionToSpanList } from "@keepup/lfcc-bridge";
import { shouldEnableDebugOverlay } from "@keepup/overlay";
import type { EditorView } from "prosemirror-view";
import * as React from "react";

import {
  type DebugSnapshot,
  copySnapshotToClipboard,
  createEmptySnapshot,
  shortenId,
  truncateMessage,
} from "./debugSnapshot";
import { ActionsSection } from "./sections/ActionsSection";
import { AnnotationsSection } from "./sections/AnnotationsSection";
import { DirtySection } from "./sections/DirtySection";
import { DocumentSection } from "./sections/DocumentSection";
import { FocusSection } from "./sections/FocusSection";
import { NetworkSection } from "./sections/NetworkSection";
import { PerfSection } from "./sections/PerfSection";
import { SelectionSection } from "./sections/SelectionSection";

import { useLfccEditorContext } from "@/components/lfcc/LfccEditorContext";
import { annotationController } from "@/lib/annotations/annotationController";
import { buildBlockIndex, resolveAnnotationRanges } from "@/lib/annotations/annotationResolution";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation } from "@/lib/kernel/types";
import { useLfccDebugStore } from "@/lib/lfcc/debugStore";
import { runIntegrityScan } from "@/lib/lfcc/integrityScan";
import { useReproBundle } from "@/lib/lfcc/useReproBundle";

const UPDATE_INTERVAL_MS = 400;
const DEFAULT_CHAIN_POLICY = { kind: "required_order" as const, maxInterveningBlocks: 0 };

function classifyDirtyReason(dirtyInfo: DirtyInfo | null): string | null {
  if (!dirtyInfo) {
    return null;
  }
  if (dirtyInfo.opCodes.includes("OP_BLOCK_SPLIT")) {
    return "split";
  }
  if (dirtyInfo.opCodes.includes("OP_BLOCK_JOIN")) {
    return "join";
  }
  if (dirtyInfo.opCodes.includes("OP_REORDER")) {
    return "reorder";
  }
  if (dirtyInfo.opCodes.includes("OP_TEXT_EDIT") || dirtyInfo.opCodes.includes("OP_MARK_EDIT")) {
    return "inline";
  }
  if (dirtyInfo.opCodes.length > 0) {
    return dirtyInfo.opCodes[0] ?? null;
  }
  return null;
}

function useInjectedDebugOverlayCss(enabled: boolean): void {
  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const id = "lfcc-debug-overlay-css";
    const existing = document.getElementById(id);
    if (existing) {
      return;
    }

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
.lfcc-debug-overlay-root {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 99999;
  --lfcc-debug-bg: rgba(20,20,25,0.95);
  --lfcc-debug-bg-strong: rgba(20,20,25,0.92);
  --lfcc-debug-bg-header: rgba(30,30,40,0.9);
  --lfcc-debug-bg-section: rgba(40,40,50,0.4);
  --lfcc-debug-border: rgba(255,255,255,0.12);
  --lfcc-debug-border-soft: rgba(255,255,255,0.08);
  --lfcc-debug-border-strong: rgba(255,255,255,0.16);
  --lfcc-debug-text: rgba(255,255,255,0.9);
  --lfcc-debug-text-strong: rgba(255,255,255,0.95);
  --lfcc-debug-text-muted: rgba(255,255,255,0.7);
  --lfcc-debug-text-dim: rgba(255,255,255,0.55);
  --lfcc-debug-text-soft: rgba(255,255,255,0.5);
  --lfcc-debug-title: var(--color-accent-cyan);
  --lfcc-debug-toggle-border: rgba(0,0,0,0.12);
  --lfcc-debug-shadow: 0 12px 40px rgba(0,0,0,0.45);
  --lfcc-debug-badge-bg: rgba(255,255,255,0.06);
  --lfcc-debug-badge-border: rgba(255,255,255,0.14);
  --lfcc-debug-accent: rgba(122,183,255,0.95);
  --lfcc-debug-accent-border: rgba(122,183,255,0.5);
  --lfcc-debug-accent-bg: rgba(122,183,255,0.12);
  --lfcc-debug-accent-bg-strong: rgba(122,183,255,0.18);
  --lfcc-debug-accent-soft: rgba(122,183,255,0.08);
  --lfcc-debug-accent-soft-border: rgba(122,183,255,0.25);
  --lfcc-debug-ok-border: rgba(76,175,80,0.45);
  --lfcc-debug-ok-bg: rgba(76,175,80,0.12);
  --lfcc-debug-warn-border: rgba(255,152,0,0.45);
  --lfcc-debug-warn-bg: rgba(255,152,0,0.12);
  --lfcc-debug-error-border: rgba(244,67,54,0.5);
  --lfcc-debug-error-bg: rgba(244,67,54,0.14);
  --lfcc-debug-error-fill: rgba(244,67,54,0.08);
  --lfcc-debug-alert-border: rgba(255,230,0,0.6);
  --lfcc-debug-alert-bg: rgba(255,230,0,0.1);
  --lfcc-debug-alert-outline: rgba(255,230,0,0.55);
  --lfcc-debug-scan-ok: rgba(155,255,166,0.95);
  --lfcc-debug-scan-fail: rgba(255,155,155,0.95);
  --lfcc-debug-meta: rgba(255,255,255,0.65);
  --lfcc-debug-row-bg: rgba(255,255,255,0.04);
  --lfcc-debug-row-border: rgba(255,255,255,0.1);
  --lfcc-debug-anno-border: rgba(0,0,0,0.25);
}
.lfcc-debug-toggle-btn { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--lfcc-debug-toggle-border); background: var(--lfcc-debug-bg-strong); color: var(--lfcc-debug-text); font-size: 12px; font-weight: 600; cursor: pointer; }
.lfcc-debug-panel { width: 420px; max-height: calc(100vh - 32px); overflow: auto; border-radius: 12px; border: 1px solid var(--lfcc-debug-border); background: var(--lfcc-debug-bg); color: var(--lfcc-debug-text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; box-shadow: var(--lfcc-debug-shadow); }
.lfcc-debug-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--lfcc-debug-bg-header); border-bottom: 1px solid var(--lfcc-debug-border); }
.lfcc-debug-title { font-size: 12px; font-weight: 700; color: var(--lfcc-debug-title); }
.lfcc-debug-close { border: none; background: transparent; color: var(--lfcc-debug-text-muted); cursor: pointer; font-size: 18px; line-height: 1; padding: 0 4px; }
.lfcc-debug-close:hover { color: var(--lfcc-debug-text-strong); }
.lfcc-debug-section { border-bottom: 1px solid var(--lfcc-debug-border-soft); }
.lfcc-debug-section-header { width: 100%; border: none; background: var(--lfcc-debug-bg-section); color: var(--lfcc-debug-text); cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 8px 12px; }
.lfcc-debug-section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lfcc-debug-text-dim); }
.lfcc-debug-section-chevron { color: var(--lfcc-debug-text-dim); width: 14px; text-align: center; }
.lfcc-debug-section-badge { margin-left: auto; font-size: 10px; border: 1px solid var(--lfcc-debug-badge-border); padding: 1px 6px; border-radius: 999px; color: var(--lfcc-debug-text); background: var(--lfcc-debug-badge-bg); }
.lfcc-debug-section-content { padding: 8px 12px; }
.lfcc-debug-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 2px 0; }
.lfcc-debug-label { color: var(--lfcc-debug-text-dim); font-size: 11px; }
.lfcc-debug-value { color: var(--lfcc-debug-text); font-size: 11px; text-align: right; }
.lfcc-debug-mono { font-variant-ligatures: none; }
.lfcc-debug-small { font-size: 10px; }
.lfcc-debug-muted { color: var(--lfcc-debug-text-soft); }
.lfcc-debug-divider { height: 1px; background: var(--lfcc-debug-border-soft); margin: 8px 0; }
.lfcc-debug-sublist { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.lfcc-debug-tag { display: inline-flex; align-items: center; border: 1px solid var(--lfcc-debug-border-strong); border-radius: 999px; padding: 1px 6px; font-size: 10px; color: var(--lfcc-debug-text); background: var(--lfcc-debug-badge-bg); }
.lfcc-debug-tag--sm { padding: 0 6px; }
.lfcc-debug-tag--ok { border-color: var(--lfcc-debug-ok-border); background: var(--lfcc-debug-ok-bg); }
.lfcc-debug-tag--warn { border-color: var(--lfcc-debug-warn-border); background: var(--lfcc-debug-warn-bg); }
.lfcc-debug-tag--error { border-color: var(--lfcc-debug-error-border); background: var(--lfcc-debug-error-bg); }
.lfcc-debug-error { margin-top: 6px; padding: 8px; border-radius: 8px; border: 1px solid var(--lfcc-debug-error-border); background: var(--lfcc-debug-error-fill); }
.lfcc-debug-error-msg { margin-top: 4px; font-size: 10px; color: var(--lfcc-debug-text); }
.lfcc-debug-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.lfcc-debug-btn { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--lfcc-debug-accent-border); background: var(--lfcc-debug-accent-bg); color: var(--lfcc-debug-text-strong); font-size: 11px; cursor: pointer; }
.lfcc-debug-btn:hover { background: var(--lfcc-debug-accent-bg-strong); }
.lfcc-debug-btn--active { border-color: var(--lfcc-debug-alert-border); background: var(--lfcc-debug-alert-bg); }
.lfcc-debug-scan-result { font-size: 11px; color: var(--lfcc-debug-text); }
.lfcc-debug-scan-result--ok { color: var(--lfcc-debug-scan-ok); }
.lfcc-debug-scan-result--fail { color: var(--lfcc-debug-scan-fail); }
.lfcc-debug-copy-status { font-size: 10px; color: var(--lfcc-debug-scan-ok); }
.lfcc-debug-anno-list { display: flex; flex-direction: column; gap: 6px; }
.lfcc-debug-anno-row { width: 100%; text-align: left; border-radius: 10px; border: 1px solid var(--lfcc-debug-row-border); background: var(--lfcc-debug-row-bg); padding: 8px 10px; cursor: pointer; }
.lfcc-debug-anno-row--hover { background: var(--lfcc-debug-accent-soft); border-color: var(--lfcc-debug-accent-soft-border); }
.lfcc-debug-anno-header { display: flex; align-items: center; gap: 8px; }
.lfcc-debug-anno-meta { margin-top: 6px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 10px; color: var(--lfcc-debug-meta); }
.lfcc-debug-anno-color { width: 10px; height: 10px; border-radius: 999px; border: 1px solid var(--lfcc-debug-anno-border); }
.lfcc-debug-outlines .lfcc-annotation { outline: 2px dashed var(--lfcc-debug-alert-outline) !important; outline-offset: 2px; }
`;

    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [enabled]);
}

function buildOverlaySnapshot(params: {
  runtime: LoroRuntime;
  view: EditorView;
  annotations: Annotation[];
  focusedAnnotationId: string | null;
  lastDirtyInfo: DirtyInfo | null;
  lastDirtyTimestamp: number | null;
  manifestHash: string | null;
  anchorEncodingVersion: string | null;
  contextHash: string | null;
  perfSample: {
    dragUpdatesPerSecond: number;
    resolutionCallsPerSecond: number;
    decorationRebuildsPerSecond: number;
    avgResolutionDurationMs: number;
    p95ResolutionDurationMs: number;
  };
  errors: Array<{ timestamp: number; code: string; message: string }>;
}): DebugSnapshot {
  const {
    runtime,
    view,
    annotations,
    focusedAnnotationId,
    lastDirtyInfo,
    lastDirtyTimestamp,
    manifestHash,
    anchorEncodingVersion,
    contextHash,
    perfSample,
    errors,
  } = params;

  const next = createEmptySnapshot();
  const blockIndex = buildBlockIndex(view.state);

  next.document = {
    docId: runtime.doc.peerIdStr,
    frontier: JSON.stringify(runtime.frontiers),
    blockCount: blockIndex.blockOrder.length,
    lastTxType: lastDirtyInfo?.opCodes?.[0] ?? null,
    lastTxClassification: classifyDirtyReason(lastDirtyInfo),
    lastTxTimestamp: lastDirtyTimestamp,
    manifestHash,
    anchorEncodingVersion,
  };

  const selection = view.state.selection;
  if (!selection.empty) {
    try {
      const mapped = pmSelectionToSpanList(selection, view.state, runtime, {
        strict: true,
        chainPolicy: DEFAULT_CHAIN_POLICY,
      });

      next.selection = {
        fromTo: { from: selection.from, to: selection.to },
        selectionType: selection.constructor.name,
        spanList: mapped.spanList,
        chainPolicy: DEFAULT_CHAIN_POLICY,
        mappingMode: "strict",
        lastError:
          mapped.spanList.length === 0
            ? { code: "EMPTY_SPAN_LIST", message: "Selection produced empty span list" }
            : null,
        contextHash,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      next.selection = {
        fromTo: { from: selection.from, to: selection.to },
        selectionType: selection.constructor.name,
        spanList: [],
        chainPolicy: DEFAULT_CHAIN_POLICY,
        mappingMode: "strict",
        lastError: { code: "FAIL_CLOSED", message },
        contextHash,
      };
    }
  } else {
    next.selection = {
      fromTo: null,
      selectionType: "none",
      spanList: [],
      chainPolicy: null,
      mappingMode: "strict",
      lastError: null,
      contextHash,
    };
  }

  next.annotations = annotations.map((annotation) => {
    const resolved = resolveAnnotationRanges(annotation, runtime, view.state, blockIndex);
    const resolvedBlockIds = Array.from(new Set(resolved.ranges.map((range) => range.blockId)));
    return {
      id: annotation.id,
      shortId: shortenId(annotation.id),
      color: annotation.color,
      storedState: annotation.storedState,
      displayState: annotation.displayState,
      verified: annotation.verified,
      spansCount: annotation.spans?.length ?? 0,
      resolvedBlockIds,
    };
  });

  const focused = focusedAnnotationId
    ? (annotations.find((entry) => entry.id === focusedAnnotationId) ?? null)
    : null;

  next.focus = {
    focusedAnnotationId,
    focusSource: null,
    decorationCount: focused?.spans?.length ?? 0,
    orderingKeyPreview: focused?.chain?.order?.slice(0, 8) ?? [],
  };

  next.dirty = {
    touchedBlockIds: lastDirtyInfo?.touchedBlocks ?? [],
    neighborExpansionK: DEFAULT_NEIGHBOR_EXPANSION_POLICY.neighbor_expand_k,
    reason: classifyDirtyReason(lastDirtyInfo),
    spansReResolved: 0,
    annotationsReVerified: 0,
  };

  next.perf = {
    dragUpdatesPerSecond: perfSample.dragUpdatesPerSecond,
    resolutionCallsPerSecond: perfSample.resolutionCallsPerSecond,
    decorationRebuildsPerSecond: perfSample.decorationRebuildsPerSecond,
    avgResolutionDurationMs: perfSample.avgResolutionDurationMs,
    p95ResolutionDurationMs: perfSample.p95ResolutionDurationMs,
  };

  next.recentErrors = errors;
  return next;
}

export function LfccDebugOverlay() {
  const lfcc = useLfccEditorContext();
  const isDev = process.env.NODE_ENV !== "production";
  const enabled = isDev && shouldEnableDebugOverlay();

  const { download: downloadReproBundle } = useReproBundle();

  useInjectedDebugOverlayCss(enabled);

  const annotationsMap = useAnnotationStore((s) => s.annotations);
  const focusedAnnotationId = useAnnotationStore((s) => s.focusedAnnotationId);
  const annotations = React.useMemo(() => Object.values(annotationsMap), [annotationsMap]);

  const dirtyInfoHistory = useLfccDebugStore((state) => state.dirtyInfoHistory);
  const lastDirtyInfo = useLfccDebugStore((state) => state.lastDirtyInfo);
  const errors = useLfccDebugStore((state) => state.errors);
  const perf = useLfccDebugStore((state) => state.perf);
  const lastScanResult = useLfccDebugStore((state) => state.lastScanResult);
  const setScanResult = useLfccDebugStore((state) => state.setScanResult);
  const lastContextHash = useLfccDebugStore((state) => state.lastContextHash);

  const manifestForHash = React.useMemo(() => {
    const candidate = lfcc?.syncSummary?.effectiveManifest;
    if (validateSyncManifest(candidate)) {
      return candidate;
    }
    return DEFAULT_POLICY_MANIFEST;
  }, [lfcc?.syncSummary?.effectiveManifest]);

  const [manifestHash, setManifestHash] = React.useState<string | null>(null);
  const anchorEncodingVersion = manifestForHash.anchor_encoding?.version ?? null;

  React.useEffect(() => {
    let active = true;
    const compute = async () => {
      try {
        const hash = await computePolicyManifestHash(manifestForHash);
        if (active) {
          setManifestHash(hash);
        }
      } catch {
        if (active) {
          setManifestHash(null);
        }
      }
    };
    compute();
    return () => {
      active = false;
    };
  }, [manifestForHash]);

  const [visible, setVisible] = React.useState(true);
  const [isOutlinesEnabled, setIsOutlinesEnabled] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState(createEmptySnapshot);

  const dirtyRef = React.useRef(dirtyInfoHistory);
  const errorsRef = React.useRef(errors);

  dirtyRef.current = dirtyInfoHistory;
  errorsRef.current = errors;

  React.useEffect(() => {
    if (!enabled || !lfcc) {
      return;
    }

    const id = window.setInterval(() => {
      const dirtyEntries = dirtyRef.current;
      const lastDirtyEntry = dirtyEntries.length > 0 ? dirtyEntries[dirtyEntries.length - 1] : null;
      const lastDirtyTimestamp = lastDirtyEntry?.timestamp ?? null;
      const start = Math.max(0, errorsRef.current.length - 6);
      const recentErrors = errorsRef.current.slice(start).map((entry) => ({
        timestamp: entry.timestamp,
        code: entry.code,
        message: truncateMessage(entry.message),
      }));

      setSnapshot(
        buildOverlaySnapshot({
          runtime: lfcc.runtime,
          view: lfcc.view,
          annotations,
          focusedAnnotationId,
          lastDirtyInfo,
          lastDirtyTimestamp,
          manifestHash,
          anchorEncodingVersion,
          contextHash: lastContextHash,
          perfSample: perf,
          errors: recentErrors,
        })
      );
    }, UPDATE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [
    annotations,
    anchorEncodingVersion,
    enabled,
    focusedAnnotationId,
    lastContextHash,
    lastDirtyInfo,
    lfcc,
    manifestHash,
    perf,
  ]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }
    const editorEl = lfcc?.view.dom.closest("[data-lfcc-editor-root]") ?? lfcc?.view.dom;
    editorEl?.classList.toggle("lfcc-debug-outlines", isOutlinesEnabled);
    return () => {
      editorEl?.classList.remove("lfcc-debug-outlines");
    };
  }, [enabled, isOutlinesEnabled, lfcc]);

  const handleForceIntegrityScan = React.useCallback(async () => {
    if (!lfcc) {
      return;
    }
    try {
      const result = await runIntegrityScan({
        view: lfcc.view,
        annotations,
        lastDirtyInfo,
      });
      setScanResult({ ok: result.ok, failureCount: result.failureCount });
    } catch (_error) {
      setScanResult({ ok: false, failureCount: 1 });
    }
  }, [annotations, lastDirtyInfo, lfcc, setScanResult]);

  const handleDumpSnapshot = React.useCallback(() => {
    void copySnapshotToClipboard(snapshot);
  }, [snapshot]);

  const handleDumpReproBundle = React.useCallback(() => {
    downloadReproBundle();
  }, [downloadReproBundle]);

  const handleToggleOutlines = React.useCallback(() => {
    setIsOutlinesEnabled((prev) => !prev);
  }, []);

  if (!enabled || !lfcc) {
    return null;
  }

  if (!visible) {
    return (
      <div className="lfcc-debug-overlay-root">
        <button
          type="button"
          className="lfcc-debug-toggle-btn"
          onClick={() => setVisible(true)}
          aria-label="Show LFCC Debug overlay"
        >
          LFCC Debug
        </button>
      </div>
    );
  }

  return (
    <div className="lfcc-debug-overlay-root">
      <dialog className="lfcc-debug-panel" open aria-label="LFCC debug overlay">
        <div className="lfcc-debug-header">
          <span className="lfcc-debug-title">LFCC Debug</span>
          <button
            type="button"
            className="lfcc-debug-close"
            onClick={() => setVisible(false)}
            aria-label="Close debug overlay"
          >
            x
          </button>
        </div>

        <DocumentSection data={snapshot.document} />
        <SelectionSection data={snapshot.selection} />
        <AnnotationsSection
          data={snapshot.annotations}
          onScrollTo={(annotationId) => annotationController.scrollToAnnotation(annotationId)}
        />
        <FocusSection data={snapshot.focus} />
        <DirtySection data={snapshot.dirty} />
        <PerfSection data={snapshot.perf} />
        <NetworkSection
          simState={{ enabled: false, latencyMs: 0, dropRate: 0, partitioned: false }}
          stats={{
            messagesSent: 0,
            messagesReceived: 0,
            bytesUp: 0,
            bytesDown: 0,
            lastLatencyMs: 0,
          }}
        />
        <ActionsSection
          onForceIntegrityScan={handleForceIntegrityScan}
          onDumpSnapshot={handleDumpSnapshot}
          onDumpReproBundle={handleDumpReproBundle}
          onToggleOutlines={handleToggleOutlines}
          isOutlinesEnabled={isOutlinesEnabled}
          lastScanResult={lastScanResult}
        />
      </dialog>
    </div>
  );
}
