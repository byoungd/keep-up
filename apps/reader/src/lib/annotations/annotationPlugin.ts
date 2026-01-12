import type { FailClosedPayload } from "@/components/lfcc/DevFailClosedBanner";
import { BRIDGE_ORIGIN_META, buildGapDecorations } from "@keepup/lfcc-bridge";
import type { AnnotationWithRanges, LoroRuntime } from "@keepup/lfcc-bridge";
import type { Node as PMNode } from "prosemirror-model";
import { type EditorState, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { annotationController } from "@/lib/annotations/annotationController";
import {
  type BlockIndex,
  type ResolvedAnnotation,
  buildBlockIndex,
  resolveAnnotationRanges,
  resolveAnnotationsForDecorations,
} from "@/lib/annotations/annotationResolution";
import { buildDecorationsIncremental } from "@/lib/annotations/decorationCache";
import { subscribeToDecorationChanges } from "@/lib/annotations/storeSubscription";
import { isVerifiedDisplayState } from "@/lib/annotations/verification";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation } from "@/lib/kernel/types";

export const annotationPluginKey = new PluginKey("lfcc-annotation-plugin");

type AnnotationPluginOptions = {
  runtime: LoroRuntime;
  onFailClosed?: (payload: FailClosedPayload) => void;
  enableHandles?: boolean;
  enablePerf?: boolean;
  onPerfSample?: (sample: PerfSample) => void;
};

// --- Performance Monitoring ---

export type PerfSample = {
  dragUpdatesPerSecond: number;
  resolutionCallsPerSecond: number;
  decorationRebuildsPerSecond: number;
  avgResolutionDurationMs: number;
  p95ResolutionDurationMs: number;
};

class PerfMonitor {
  private enabled: boolean;
  private dragUpdates = 0;
  private resolveCycles = 0;
  private lastReportMs = 0;
  private onSample?: (sample: PerfSample) => void;

  constructor(enablePerf: boolean, onSample?: (sample: PerfSample) => void) {
    this.enabled =
      enablePerf ||
      (typeof window !== "undefined" &&
        (window as { __LFCC_DRAG_PERF__?: boolean }).__LFCC_DRAG_PERF__ === true);
    this.onSample = onSample;
  }

  get isEnabled() {
    return this.enabled;
  }

  recordDragUpdate() {
    if (this.enabled) {
      this.dragUpdates++;
    }
    this.tryReport();
  }

  recordResolveCycle() {
    if (this.enabled) {
      this.resolveCycles++;
    }
    this.tryReport();
  }

  private tryReport() {
    if (!this.enabled) {
      return;
    }

    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    if (this.lastReportMs === 0) {
      this.lastReportMs = now;
      return;
    }

    if (now - this.lastReportMs < 1000) {
      return;
    }

    const sample: PerfSample = {
      dragUpdatesPerSecond: this.dragUpdates,
      resolutionCallsPerSecond: this.resolveCycles,
      decorationRebuildsPerSecond: this.resolveCycles,
      avgResolutionDurationMs: 0,
      p95ResolutionDurationMs: 0,
    };

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[LFCC] drag updates/s: ${this.dragUpdates}, resolve cycles/s: ${this.resolveCycles}`
      );
    }

    // Defer the sample reporting to escape the ProseMirror decoration calculation (render cycle)
    if (this.onSample) {
      const s = sample;
      const cb = this.onSample;
      Promise.resolve().then(() => cb(s));
    }

    this.dragUpdates = 0;
    this.resolveCycles = 0;
    this.lastReportMs = now;
  }
}

// --- Decoration Builders ---

const getAnnotations = () =>
  Object.values(useAnnotationStore.getState().annotations).sort((a, b) => a.id.localeCompare(b.id));

const toDecorationInput = (resolved: ResolvedAnnotation): AnnotationWithRanges => ({
  id: resolved.id,
  state: resolved.state,
  color: resolved.color,
  ranges: resolved.ranges,
});

/** Clear focused annotation if it's now invalid (orphaned or has no ranges) */
function clearInvalidFocusedAnnotation(resolved: ResolvedAnnotation[]): void {
  const focusedId = useAnnotationStore.getState().focusedAnnotationId;
  if (!focusedId) {
    return;
  }

  const focusedEntry = resolved.find((entry) => entry.id === focusedId);
  const isInvalid =
    !focusedEntry || focusedEntry.state === "orphan" || focusedEntry.ranges.length === 0;

  if (isInvalid) {
    useAnnotationStore.getState().setFocusedAnnotationId(null);
  }
}

type ActiveHandle = {
  annotationId: string;
  handleType: "start" | "end";
  color?: string;
};

const buildHandleDecorations = (
  resolved: ResolvedAnnotation[],
  activeHandle: ActiveHandle | null
): Decoration[] => {
  const decorations: Decoration[] = [];

  for (const entry of resolved) {
    if (entry.state === "orphan" || entry.ranges.length === 0) {
      continue;
    }

    const positions = entry.ranges.reduce(
      (acc, range) => ({
        min: Math.min(acc.min, range.from),
        max: Math.max(acc.max, range.to),
      }),
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    );

    if (!Number.isFinite(positions.min) || !Number.isFinite(positions.max)) {
      continue;
    }

    const isStartActive =
      activeHandle?.annotationId === entry.id && activeHandle.handleType === "start";
    const isEndActive =
      activeHandle?.annotationId === entry.id && activeHandle.handleType === "end";

    decorations.push(
      Decoration.widget(
        positions.min,
        () => createHandleElement(entry.id, "start", entry.color, isStartActive),
        {
          key: `handle:${entry.id}:start`,
          side: -1,
        }
      ),
      Decoration.widget(
        positions.max,
        () => createHandleElement(entry.id, "end", entry.color, isEndActive),
        {
          key: `handle:${entry.id}:end`,
          side: 1,
        }
      )
    );
  }

  return decorations;
};

const createHandleElement = (
  id: string,
  type: "start" | "end",
  color?: string,
  isDragging = false
) => {
  const el = document.createElement("span");
  const classNames = ["lfcc-annotation-handle", `lfcc-annotation-handle--${type}`];
  if (isDragging) {
    classNames.push("lfcc-annotation-handle--dragging");
  }
  el.className = classNames.join(" ");
  if (color) {
    el.classList.add(`lfcc-annotation--${color}`);
    el.setAttribute("data-annotation-color", color);
  }
  el.setAttribute("data-annotation-id", id);
  el.setAttribute("data-handle", type);
  el.setAttribute("contenteditable", "false");
  el.setAttribute("aria-hidden", "true");
  return el;
};

const buildFocusDecorations = (
  resolved: ResolvedAnnotation[],
  focusedAnnotationId: string | null,
  doc: PMNode
): DecorationSet => {
  if (!focusedAnnotationId) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  const ordered = [...resolved].sort((a, b) => a.id.localeCompare(b.id));

  for (const entry of ordered) {
    if (entry.id !== focusedAnnotationId || entry.state === "orphan") {
      continue;
    }

    const ranges = [...entry.ranges].sort((a, b) => a.spanId.localeCompare(b.spanId));
    for (const range of ranges) {
      decorations.push(
        Decoration.inline(
          range.from,
          range.to,
          { class: "lfcc-annotation--focus" },
          { key: `focus:${entry.id}:span:${range.spanId}` }
        )
      );
    }
  }

  return decorations.length === 0 ? DecorationSet.empty : DecorationSet.create(doc, decorations);
};

const syncDisplayStates = (resolved: ResolvedAnnotation[]) => {
  const store = useAnnotationStore.getState();

  // Collect all updates first, then batch apply
  const updates: Array<{ id: string; displayState: string; verified: boolean }> = [];

  for (const entry of resolved) {
    const current = store.annotations[entry.id];
    if (!current || current.displayState === entry.state) {
      continue;
    }
    updates.push({
      id: entry.id,
      displayState: entry.state,
      verified: isVerifiedDisplayState(entry.state),
    });
  }

  // Only update if there are actual changes
  if (updates.length === 0) {
    return;
  }

  // Batch update to avoid multiple store notifications
  // Use a single setState call with all updates
  useAnnotationStore.setState((state) => {
    const newAnnotations = { ...state.annotations };
    for (const update of updates) {
      if (newAnnotations[update.id]) {
        newAnnotations[update.id] = {
          ...newAnnotations[update.id],
          displayState: update.displayState as Annotation["displayState"],
          verified: update.verified,
        };
      }
    }
    return { annotations: newAnnotations };
  });
};

// --- Drag Controller ---

type DragState = {
  annotationId: string;
  anchorPos: number;
  handleType: "start" | "end";
  notified: boolean;
  initialSnapshot: AnnotationSnapshot | null;
  // Note: lastAppliedSelection removed - CRDT write only happens on drag end
};

type AnnotationSnapshot = Pick<
  Annotation,
  "start" | "end" | "content" | "spans" | "chain" | "displayState" | "verified" | "color"
>;

const snapshotAnnotation = (annotation: Annotation): AnnotationSnapshot => ({
  start: annotation.start,
  end: annotation.end,
  content: annotation.content,
  spans: annotation.spans ? annotation.spans.map((span) => ({ ...span })) : annotation.spans,
  chain: annotation.chain
    ? {
        ...annotation.chain,
        order: [...annotation.chain.order],
        policy: { ...annotation.chain.policy },
      }
    : annotation.chain,
  displayState: annotation.displayState,
  verified: annotation.verified,
  color: annotation.color,
});

/**
 * Ephemeral drag preview state - NOT persisted to CRDT.
 * Used by external overlay to render preview without triggering decoration rebuilds.
 */
export interface DragPreviewState {
  annotationId: string;
  color?: string;
  from: number;
  to: number;
  handleType: "start" | "end";
  /** Current mouse position for dragging handle */
  mouseX: number;
  mouseY: number;
}

// Global drag preview state and listeners for external overlay
let currentDragPreview: DragPreviewState | null = null;
const dragPreviewListeners = new Set<(state: DragPreviewState | null) => void>();

/** Subscribe to drag preview state changes. Returns unsubscribe function. */
export function subscribeToDragPreview(
  callback: (state: DragPreviewState | null) => void
): () => void {
  dragPreviewListeners.add(callback);
  // Immediately call with current state
  callback(currentDragPreview);
  return () => {
    dragPreviewListeners.delete(callback);
  };
}

/** Get current drag preview state (for initial render) */
export function getDragPreviewState(): DragPreviewState | null {
  return currentDragPreview;
}

function emitDragPreview(state: DragPreviewState | null) {
  currentDragPreview = state;
  for (const listener of dragPreviewListeners) {
    listener(state);
  }
}

class DragController {
  private dragState: DragState | null = null;
  private dragRaf: number | null = null;
  private pendingCoords: { left: number; top: number } | null = null;
  private activeHandle: ActiveHandle | null = null;

  constructor(
    private view: EditorView,
    private runtime: LoroRuntime,
    private perf: PerfMonitor,
    private onFailClosed?: (payload: FailClosedPayload) => void
  ) {
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  startDrag(
    event: PointerEvent,
    annotationId: string,
    anchorPos: number,
    handleType: "start" | "end",
    handle: HTMLElement
  ) {
    // Get annotation color for preview
    const annotation = useAnnotationStore.getState().annotations[annotationId];
    if (!annotation) {
      return;
    }
    const color = annotation.color;

    this.dragState = {
      annotationId,
      anchorPos,
      handleType,
      notified: false,
      initialSnapshot: snapshotAnnotation(annotation),
    };

    // Store color in activeHandle for preview
    this.activeHandle = { annotationId, handleType, color };

    this.view.dom.classList.add("lfcc-annotation-dragging");
    this.setActiveHandle({ annotationId, handleType });

    // Ghost the source annotation to avoid visual overlap with drag preview
    this.ghostSourceAnnotation(annotationId);

    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();

    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp, { once: true });
  }

  /**
   * Add ghost class to source annotation spans to fade them during drag.
   */
  private ghostSourceAnnotation(annotationId: string) {
    const spans = this.view.dom.querySelectorAll<HTMLElement>(
      `.lfcc-annotation[data-annotation-id="${annotationId}"]`
    );
    for (const span of spans) {
      span.classList.add("lfcc-annotation--ghosted");
    }
  }

  /**
   * Remove ghost class from all annotation spans.
   */
  private unghostAnnotations() {
    const ghosted = this.view.dom.querySelectorAll<HTMLElement>(".lfcc-annotation--ghosted");
    for (const span of ghosted) {
      span.classList.remove("lfcc-annotation--ghosted");
    }
  }

  private clearDrag() {
    this.dragState = null;
    this.pendingCoords = null;
    if (this.dragRaf != null) {
      window.cancelAnimationFrame(this.dragRaf);
      this.dragRaf = null;
    }
    this.view.dom.classList.remove("lfcc-annotation-dragging");
    this.setActiveHandle(null);

    // Restore source annotation opacity
    this.unghostAnnotations();

    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
  }

  getActiveHandle(): ActiveHandle | null {
    return this.activeHandle;
  }

  private setActiveHandle(activeHandle: ActiveHandle | null) {
    const isSameHandle =
      this.activeHandle?.annotationId === activeHandle?.annotationId &&
      this.activeHandle?.handleType === activeHandle?.handleType;
    if (isSameHandle) {
      return;
    }

    const handles = this.view.dom.querySelectorAll<HTMLElement>(".lfcc-annotation-handle");
    for (const handle of handles) {
      handle.classList.remove("lfcc-annotation-handle--dragging");
      handle.style.opacity = "";
      if (
        activeHandle &&
        handle.dataset.annotationId === activeHandle.annotationId &&
        handle.dataset.handle === activeHandle.handleType
      ) {
        handle.classList.add("lfcc-annotation-handle--dragging");
      }
    }
    this.activeHandle = activeHandle;
  }

  private handlePointerMove(event: PointerEvent) {
    if (!this.dragState) {
      return;
    }

    this.pendingCoords = { left: event.clientX, top: event.clientY };
    if (this.dragRaf != null) {
      return;
    }

    this.dragRaf = window.requestAnimationFrame(() => this.processDragFrame());
  }

  private restoreSnapshot() {
    if (!this.dragState?.initialSnapshot) {
      return;
    }

    useAnnotationStore
      .getState()
      .updateAnnotation(this.dragState.annotationId, this.dragState.initialSnapshot);
  }

  private failClosed(message: string, payload: Record<string, unknown>) {
    if (!this.dragState) {
      return;
    }

    if (!this.dragState.notified) {
      this.dragState.notified = true;
      this.onFailClosed?.({ message, payload });
    }

    this.restoreSnapshot();
  }

  private processDragFrame() {
    this.dragRaf = null;
    if (!this.dragState || !this.pendingCoords) {
      this.pendingCoords = null;
      return;
    }

    const coords = this.pendingCoords;
    this.pendingCoords = null;
    let posInfo = this.view.posAtCoords(coords);

    // FIX: If posAtCoords returns null (dragging in gutter), try clamping X to editor bounds
    if (!posInfo?.pos) {
      const editorRect = this.view.dom.getBoundingClientRect();
      const PADDING = 20; // Assume safe padding

      // Check if we are to the left or right of the editor
      let clampedX = coords.left;
      if (coords.left < editorRect.left) {
        clampedX = editorRect.left + PADDING;
      } else if (coords.left > editorRect.right) {
        clampedX = editorRect.right - PADDING;
      }

      // Retry with clamped X (keep original Y to find correct line)
      if (clampedX !== coords.left) {
        posInfo = this.view.posAtCoords({ left: clampedX, top: coords.top });
      }
    }

    if (!posInfo?.pos) {
      return;
    }

    // Clamp position to stay within text block content
    // This prevents annotation from including paragraph boundaries
    const clampedPos = this.clampToBlockContent(posInfo.pos);
    this.updateDragSelection(clampedPos, coords.left, coords.top);
  }

  /**
   * Clamps a document position to stay within its containing block's text content.
   * Prevents annotations from spanning block boundaries (the "newline" issue).
   */
  private clampToBlockContent(pos: number): number {
    const $pos = this.view.state.doc.resolve(pos);

    // Find the deepest text block (paragraph, heading, etc.)
    let depth = $pos.depth;
    while (depth > 0) {
      const node = $pos.node(depth);
      if (node.isTextblock) {
        const blockStart = $pos.start(depth);
        const blockEnd = blockStart + node.content.size;

        // Clamp to [blockStart, blockEnd] (content bounds, not node bounds)
        if (pos < blockStart) {
          return blockStart;
        }
        if (pos > blockEnd) {
          return blockEnd;
        }
        return pos;
      }
      depth--;
    }

    return pos;
  }

  private updateDragSelection(pos: number, mouseX: number, mouseY: number) {
    const dragState = this.dragState;
    if (!dragState) {
      return;
    }

    const { annotationId, anchorPos, handleType } = dragState;
    let targetPos = pos;

    // Smart Punctuation Expansion
    if (handleType === "end") {
      try {
        const nextChar = this.view.state.doc.textBetween(targetPos, targetPos + 1);
        if (/^[.,:;!?]$/.test(nextChar)) {
          const prevChar = this.view.state.doc.textBetween(targetPos - 1, targetPos);
          if (prevChar.trim() !== "") {
            targetPos += 1;
          }
        }
      } catch {
        // Ignore
      }
    }

    // Calculate from/to based on handle type
    const rawFrom = handleType === "start" ? targetPos : anchorPos;
    const rawTo = handleType === "start" ? anchorPos : targetPos;
    const from = Math.min(rawFrom, rawTo);
    const to = Math.max(rawFrom, rawTo);

    // Emit preview state for external overlay
    // PERFORMANCE OPTIMIZATION: NO CRDT write during drag - only visual preview.
    // Final CRDT commit happens in handlePointerUp to avoid per-frame overhead.
    const color = this.activeHandle?.color;
    emitDragPreview({
      annotationId,
      color,
      from,
      to,
      handleType,
      mouseX,
      mouseY,
    });

    this.perf.recordDragUpdate();
  }

  private handlePointerUp() {
    // Commit final range to CRDT on drag end
    // PERFORMANCE: This is the ONLY CRDT write for the entire drag operation.
    const dragState = this.dragState;
    if (dragState && currentDragPreview && !dragState.notified) {
      const { annotationId } = dragState;
      const { from, to } = currentDragPreview;

      const selection = TextSelection.create(this.view.state.doc, from, to);
      const result = annotationController.updateAnnotationRangeFromSelection({
        annotationId,
        selection,
        state: this.view.state,
        runtime: this.runtime,
        strict: true,
      });

      if (!result.ok) {
        this.failClosed(result.error, result.debugPayload);
      }
    }

    // Clear preview and drag state
    emitDragPreview(null);
    this.clearDrag();

    // Force decoration rebuild to restore handles after drag
    // Use setTimeout to ensure this happens after current event cycle
    // Mark with BRIDGE_ORIGIN_META to skip Loro sync (UI-only update)
    setTimeout(() => {
      if (!this.view.isDestroyed) {
        this.view.dispatch(
          this.view.state.tr.setMeta("addToHistory", false).setMeta(BRIDGE_ORIGIN_META, "loro")
        );
      }
    }, 0);
  }
}

// --- Helper to extract handle data from event ---

const getHandleData = (
  event: PointerEvent
): { handle: HTMLElement; annotationId: string; handleType: "start" | "end" } | null => {
  const target = event.target as HTMLElement | null;
  const handle = target?.closest<HTMLElement>(".lfcc-annotation-handle");
  if (!handle) {
    return null;
  }

  const annotationId = handle.getAttribute("data-annotation-id");
  const handleType = handle.getAttribute("data-handle") as "start" | "end" | null;

  if (!annotationId || (handleType !== "start" && handleType !== "end")) {
    return null;
  }

  return { handle, annotationId, handleType };
};

// WeakMap to store selection blockers per EditorView DOM, avoiding direct DOM property pollution
const selectionBlockerMap = new WeakMap<HTMLElement, (e: Event) => void>();

// --- Main Plugin Factory ---

export function createAnnotationPlugin({
  runtime,
  onFailClosed,
  enableHandles = true,
  enablePerf = false,
  onPerfSample,
}: AnnotationPluginOptions): Plugin {
  let cachedDoc: PMNode | null = null;
  let cachedIndex: BlockIndex | null = null;
  const perf = new PerfMonitor(enablePerf, onPerfSample);
  let dragController: DragController | null = null;

  const getBlockIndex = (state: EditorState): BlockIndex => {
    if (cachedDoc === state.doc && cachedIndex) {
      return cachedIndex;
    }
    const index = buildBlockIndex(state);
    cachedDoc = state.doc;
    cachedIndex = index;
    return index;
  };

  let isSelecting = false; // Shared closure state for drag tracking
  let hasMoved = false; // Track if pointer moved (to distinguish click vs drag)
  let pointerDownPos: { x: number; y: number } | null = null;

  const handlePointerDown = (view: EditorView, event: PointerEvent): boolean => {
    const data = getHandleData(event);
    if (!data) {
      return false;
    }

    const { handle, annotationId, handleType } = data;

    const annotation = useAnnotationStore.getState().annotations[annotationId];
    if (!annotation) {
      return true;
    }

    const resolved = resolveAnnotationRanges(
      annotation,
      runtime,
      view.state,
      getBlockIndex(view.state)
    );
    if (resolved.ranges.length === 0) {
      return true;
    }

    const minFrom = Math.min(...resolved.ranges.map((range) => range.from));
    const maxTo = Math.max(...resolved.ranges.map((range) => range.to));
    const anchorPos = handleType === "start" ? maxTo : minFrom;

    if (!Number.isFinite(anchorPos)) {
      return true;
    }

    if (!dragController) {
      dragController = new DragController(view, runtime, perf, onFailClosed);
    }
    dragController.startDrag(event, annotationId, anchorPos, handleType, handle);
    return true;
  };

  // ... existing handleClick ...

  return new Plugin({
    key: annotationPluginKey,
    props: {
      decorations(state) {
        const annotations = getAnnotations();

        if (annotations.length === 0) {
          return DecorationSet.empty;
        }

        const blockIndex = getBlockIndex(state);
        perf.recordResolveCycle();

        const { resolved, chainOrders } = resolveAnnotationsForDecorations(
          annotations,
          runtime,
          state,
          blockIndex
        );

        const annotationRanges = resolved.map(toDecorationInput);
        const focusedAnnotationId = useAnnotationStore.getState().focusedAnnotationId;

        // PERF-004: Use incremental decoration building with caching
        const inlineDecorations = buildDecorationsIncremental(resolved, state.doc);

        // CRITICAL FIX: During text selection, forcefully exclude ALL widget decorations (handles and gaps)
        // to prevent them from breaking the browser's native selection behavior.
        // display: none via CSS is undetermined on some browsers if the element exists in DOM.
        if (isSelecting) {
          return DecorationSet.create(state.doc, [
            ...inlineDecorations.find(),
            // No handles, no gaps, no focus rings (optional, but safer)
          ]);
        }

        const gapDecorations = buildGapDecorations(
          annotationRanges,
          chainOrders,
          state.doc,
          "subtle"
        );

        // D4: During drag, skip handle rebuilds - overlay renders preview handles
        const isDragging = currentDragPreview !== null;
        const activeHandle = dragController?.getActiveHandle() ?? null;
        const handleDecorations =
          enableHandles && !isDragging ? buildHandleDecorations(resolved, activeHandle) : [];

        const focusDecorations = buildFocusDecorations(
          resolved,
          focusedAnnotationId ?? null,
          state.doc
        );

        return DecorationSet.create(state.doc, [
          ...inlineDecorations.find(),
          ...gapDecorations.find(),
          ...handleDecorations,
          ...focusDecorations.find(),
        ]);
      },
      handleDOMEvents: {
        pointerdown: (view, event) => {
          const isHandleClick = handlePointerDown(view, event);

          // CRITICAL: Check if this is a text selection start (not a handle click)
          if (!isHandleClick) {
            isSelecting = true;
            hasMoved = false; // Reset movement tracking
            pointerDownPos = { x: event.clientX, y: event.clientY };
            // NOTE: We do NOT install the selectionchange blocker here.
            // It will be installed on first pointermove (when we know it's a drag).
            // This allows simple clicks to work naturally with ProseMirror.
          }
          return false;
        },
        pointermove: (view, _event) => {
          // Track that pointer moved - this distinguishes drag from click
          if (isSelecting && !hasMoved) {
            const dragThreshold = 4;
            if (pointerDownPos) {
              const deltaX = _event.clientX - pointerDownPos.x;
              const deltaY = _event.clientY - pointerDownPos.y;
              if (deltaX * deltaX + deltaY * deltaY < dragThreshold * dragThreshold) {
                return false;
              }
            }
            hasMoved = true;

            // NOW install the selectionchange blocker - only for actual drags
            // This prevents ProseMirror from snapping selection to decoration boundaries.
            const selectionBlocker = (e: Event) => {
              if (isSelecting) {
                e.stopImmediatePropagation();
              }
            };
            selectionBlockerMap.set(view.dom as HTMLElement, selectionBlocker);
            document.addEventListener("selectionchange", selectionBlocker, { capture: true });
          }
          return false;
        },
        pointerup: (view, event) => {
          if (isSelecting) {
            handlePointerUpDOM(view, event);
            isSelecting = false;
            hasMoved = false;
            pointerDownPos = null;
          }
          return false;
        },
        // Safety net for lost pointer calls
        blur: (_view) => {
          if (isSelecting) {
            // Remove selectionchange blocker on blur
            const blocker = selectionBlockerMap.get(_view.dom as HTMLElement);
            if (blocker) {
              document.removeEventListener("selectionchange", blocker, { capture: true });
              selectionBlockerMap.delete(_view.dom as HTMLElement);
            }
            isSelecting = false;
            hasMoved = false;
            pointerDownPos = null;
          }
          return false;
        },
      },
    },
    view(view) {
      let destroyed = false;
      const shouldAttachPointerHandlers = !(view.dom as HTMLElement & { pmViewDesc?: unknown })
        .pmViewDesc;

      const onPointerDownFallback = (event: PointerEvent) => {
        if (!shouldAttachPointerHandlers) {
          return;
        }
        handlePointerDown(view, event);
      };

      // Track last doc change to prevent refresh transactions from interfering with cursor
      let lastDocChangeTime = 0;
      let prevDoc = view.state.doc; // Track previous doc to detect changes
      const DOC_CHANGE_COOLDOWN_MS = 100; // Wait 100ms after doc change before allowing refresh

      // PERF-003: Use optimized subscription that only triggers on decoration-relevant changes
      const unsubscribe = subscribeToDecorationChanges(() => {
        if (!destroyed && !isSelecting && currentDragPreview === null) {
          // CRITICAL FIX: Skip refresh after recent doc changes
          // The plugin's update() method already triggers decoration rebuilds
          // when the document changes, so additional refresh is redundant
          // and can interfere with cursor positioning after Enter/typing
          const now = performance.now();
          if (now - lastDocChangeTime < DOC_CHANGE_COOLDOWN_MS) {
            // Simply skip - don't schedule delayed refresh
            // Decorations are already being rebuilt via update()
            return;
          }
          const tr = view.state.tr.setMeta(annotationPluginKey, { refresh: true });
          tr.setMeta("addToHistory", false);
          view.dispatch(tr);

          // NEW: Attempt to heal broken chains (e.g. split on reorder)
          // Doing this here ensures it happens after document updates settle
          annotationController.healBrokenChains(view.state, runtime);
        }
      });

      let hoveredAnnotationId: string | null = null;

      const getAnnotationIdFromTarget = (target: EventTarget | null): string | null => {
        if (!(target instanceof HTMLElement)) {
          return null;
        }
        const container = target.closest<HTMLElement>("[data-annotation-id]");
        if (!container || !view.dom.contains(container)) {
          return null;
        }
        return container.getAttribute("data-annotation-id");
      };

      // Handle visibility on annotation hover
      const showHandlesForAnnotation = (annotationId: string) => {
        const handles = view.dom.querySelectorAll<HTMLElement>(
          `.lfcc-annotation-handle[data-annotation-id="${annotationId}"]`
        );
        for (const handle of handles) {
          handle.style.opacity = "1";
          handle.style.pointerEvents = "auto";
        }
      };

      const hideHandlesForAnnotation = (annotationId: string) => {
        // Don't hide if this annotation is focused
        const focusedId = useAnnotationStore.getState().focusedAnnotationId;
        if (focusedId === annotationId) {
          return;
        }
        const handles = view.dom.querySelectorAll<HTMLElement>(
          `.lfcc-annotation-handle[data-annotation-id="${annotationId}"]`
        );
        for (const handle of handles) {
          handle.style.opacity = "";
          handle.style.pointerEvents = "";
        }
      };

      const onMouseOver = (e: MouseEvent) => {
        if (view.dom.classList.contains("lfcc-annotation-dragging")) {
          return;
        }
        const id = getAnnotationIdFromTarget(e.target);
        if (!id || id === hoveredAnnotationId) {
          return;
        }
        if (hoveredAnnotationId) {
          hideHandlesForAnnotation(hoveredAnnotationId);
        }
        hoveredAnnotationId = id;
        showHandlesForAnnotation(id);
      };

      const onMouseOut = (e: MouseEvent) => {
        if (view.dom.classList.contains("lfcc-annotation-dragging")) {
          return;
        }
        const id = getAnnotationIdFromTarget(e.target);
        if (!id) {
          return;
        }
        const relatedId = getAnnotationIdFromTarget(e.relatedTarget);
        if (relatedId === id) {
          return;
        }
        if (hoveredAnnotationId === id) {
          hideHandlesForAnnotation(id);
          hoveredAnnotationId = null;
        }
      };

      const onMouseLeave = () => {
        if (hoveredAnnotationId) {
          hideHandlesForAnnotation(hoveredAnnotationId);
          hoveredAnnotationId = null;
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (view.dom.classList.contains("lfcc-annotation-dragging")) {
          return;
        }
        if (!hoveredAnnotationId) {
          return;
        }
        const id = getAnnotationIdFromTarget(event.target);
        if (!id) {
          hideHandlesForAnnotation(hoveredAnnotationId);
          hoveredAnnotationId = null;
        }
      };

      const onDocumentPointerMove = (event: PointerEvent) => {
        if (view.dom.classList.contains("lfcc-annotation-dragging")) {
          return;
        }
        if (!hoveredAnnotationId) {
          return;
        }
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        if (!(hit instanceof HTMLElement)) {
          hideHandlesForAnnotation(hoveredAnnotationId);
          hoveredAnnotationId = null;
          return;
        }
        const insideEditor = view.dom.contains(hit);
        if (!insideEditor) {
          hideHandlesForAnnotation(hoveredAnnotationId);
          hoveredAnnotationId = null;
          return;
        }
        const id = getAnnotationIdFromTarget(hit);
        if (!id) {
          hideHandlesForAnnotation(hoveredAnnotationId);
          hoveredAnnotationId = null;
        }
      };

      view.dom.addEventListener("mouseover", onMouseOver);
      view.dom.addEventListener("mouseout", onMouseOut);
      view.dom.addEventListener("mouseleave", onMouseLeave);
      view.dom.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointermove", onDocumentPointerMove);
      if (shouldAttachPointerHandlers) {
        view.dom.addEventListener("pointerdown", onPointerDownFallback);
      }

      // Subscribe to focusedAnnotationId changes to show handles when annotation is focused
      let previousFocusedId: string | null = useAnnotationStore.getState().focusedAnnotationId;
      const unsubscribeFocus = useAnnotationStore.subscribe((state) => {
        const focusedId = state.focusedAnnotationId;
        if (focusedId === previousFocusedId) {
          return;
        }
        // Hide handles for previously focused annotation (if not hovered)
        if (
          previousFocusedId &&
          previousFocusedId !== focusedId &&
          previousFocusedId !== hoveredAnnotationId
        ) {
          hideHandlesForAnnotation(previousFocusedId);
        }
        // Show handles for newly focused annotation
        if (focusedId) {
          showHandlesForAnnotation(focusedId);
        }
        previousFocusedId = focusedId;
      });

      return {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ProseMirror plugin update handles multiple editor transitions in one place
        update(viewUpdate) {
          if (destroyed) {
            return;
          }

          // Track doc changes to implement cooldown or trigger logic
          const docChanged = viewUpdate.state.doc !== prevDoc;
          if (docChanged) {
            lastDocChangeTime = performance.now();
            prevDoc = viewUpdate.state.doc;
          }

          const annotations = getAnnotations();
          if (annotations.length === 0) {
            return;
          }

          const blockIndex = getBlockIndex(viewUpdate.state);
          perf.recordResolveCycle();

          const { resolved } = resolveAnnotationsForDecorations(
            annotations,
            runtime,
            viewUpdate.state,
            blockIndex
          );

          if (docChanged) {
            // NEW: Heal broken chains on document change
            // We pass the resolved list so it knows the current state (active_partial)
            const didHeal = annotationController.healBrokenChains(
              viewUpdate.state,
              runtime,
              resolved
            );
            if (didHeal) {
              // If healing mutated the store/annotations, skip sync this cycle
              // The mutation will trigger another update cycle anyway
              return;
            }
          }

          clearInvalidFocusedAnnotation(resolved);
          syncDisplayStates(resolved);
        },
        destroy() {
          destroyed = true;
          view.dom.removeEventListener("mouseover", onMouseOver);
          view.dom.removeEventListener("mouseout", onMouseOut);
          view.dom.removeEventListener("mouseleave", onMouseLeave);
          view.dom.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointermove", onDocumentPointerMove);
          if (shouldAttachPointerHandlers) {
            view.dom.removeEventListener("pointerdown", onPointerDownFallback);
          }
          unsubscribe();
          unsubscribeFocus();
        },
      };
    },
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pointer handling coordinates DOM state cleanup for multiple drag scenarios
function handlePointerUpDOM(view: EditorView, event: Event) {
  // Remove the selectionchange blocker if it was installed (only for drags)
  const blocker = selectionBlockerMap.get(view.dom as HTMLElement);
  if (blocker) {
    document.removeEventListener("selectionchange", blocker, { capture: true });
    selectionBlockerMap.delete(view.dom as HTMLElement);
  }

  // Sync range selections to ProseMirror
  const domSelection = window.getSelection();
  if (domSelection && domSelection.rangeCount > 0 && !domSelection.isCollapsed) {
    try {
      const range = domSelection.getRangeAt(0);

      // Validate that the selection is within the editor
      if (!view.dom.contains(range.commonAncestorContainer)) {
        return;
      }

      const startPos = view.posAtDOM(range.startContainer, range.startOffset);
      const endPos = view.posAtDOM(range.endContainer, range.endOffset);

      // Validate positions are within document bounds
      const docSize = view.state.doc.content.size;
      if (
        startPos !== null &&
        endPos !== null &&
        startPos >= 0 &&
        endPos >= 0 &&
        startPos <= docSize &&
        endPos <= docSize
      ) {
        const from = Math.min(startPos, endPos);
        const to = Math.max(startPos, endPos);

        // Only create selection if it's a valid range
        if (to > from) {
          const selection = TextSelection.create(view.state.doc, from, to);
          const tr = view.state.tr.setSelection(selection);
          tr.setMeta("addToHistory", false);
          view.dispatch(tr);
        }
      }
    } catch {
      // posAtDOM can throw if the node isn't in the editor
    }
    return;
  }

  // For clicks (collapsed selection), sync to the click coordinates.
  if (!(event instanceof MouseEvent) || event.button !== 0) {
    return;
  }

  const coords = { left: event.clientX, top: event.clientY };
  const posInfo = view.posAtCoords(coords);
  if (!posInfo) {
    return;
  }

  const current = view.state.selection;
  if (current.from === posInfo.pos && current.to === posInfo.pos) {
    return;
  }

  const selection = TextSelection.create(view.state.doc, posInfo.pos, posInfo.pos);
  const tr = view.state.tr.setSelection(selection);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
}
