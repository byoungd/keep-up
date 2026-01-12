/**
 * LFCC Annotation Controller
 *
 * Handles annotation persistence and operations.
 * Toolbar is a thin caller; all state management lives here.
 */

import { getAnnotationRepo } from "@/lib/annotations/annotationRepoBridge";
import { useCommentStore } from "@/lib/annotations/commentStore";
import { absoluteFromAnchor, anchorFromAbsolute } from "@/lib/kernel/anchors";
import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation, AnnotationColor } from "@/lib/kernel/types";
import { saveImmediately } from "@/lib/persistence/persistenceManager";
import type { DisplayAnnoState, StoredAnnoState } from "@keepup/core";
import type {
  AnnotationRecord,
  ChainPolicy,
  LoroRuntime,
  SpanChain,
  SpanChainPolicy,
  SpanList,
  VerificationState,
} from "@keepup/lfcc-bridge";
import { pmSelectionToSpanList } from "@keepup/lfcc-bridge";
import type { Node as PmNode } from "prosemirror-model";
import { type EditorState, type Selection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  type BlockIndex,
  type ResolvedAnnotation,
  buildBlockIndex,
  resolveAnnotationRanges,
} from "@/lib/annotations/annotationResolution";
import { isVerifiedDisplayState } from "@/lib/annotations/verification";
import { reportEditorError } from "@/lib/editor/errorReporter";

// ============================================================================
// Types
// ============================================================================

export type CreateAnnotationInput = {
  id?: string;
  spanList: SpanList;
  chain?: SpanChain;
  policy?: SpanChainPolicy;
  content: string;
  color?: AnnotationColor;
  createdAtMs?: number;
  storedState?: StoredAnnoState;
  displayState?: DisplayAnnoState;
  verified?: boolean;
};

export type CreateFromSelectionInput = {
  view: EditorView;
  runtime: LoroRuntime;
  color?: AnnotationColor;
  chainPolicy?: SpanChainPolicy;
  strict?: boolean;
};

export type CreateFromSelectionResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; error: string; debugPayload: Record<string, unknown> };

export type UpdateAnnotationRangeInput = {
  annotationId: string;
  spanList: SpanList;
  chain?: SpanChain;
  content?: string;
  color?: AnnotationColor;
  displayState?: DisplayAnnoState;
  verified?: boolean;
};

export type UpdateAnnotationRangeFromSelectionInput = {
  annotationId: string;
  selection: Selection;
  state: EditorState;
  runtime: LoroRuntime;
  chainPolicy?: SpanChainPolicy;
  strict?: boolean;
};

export type UpdateAnnotationRangeResult =
  | { ok: true; annotation: Annotation }
  | { ok: false; error: string; debugPayload: Record<string, unknown> };

export type ScrollToAnnotationResult =
  | { status: "missing" }
  | { status: "orphan"; blockId: string | null; scrolled: boolean }
  | { status: "scrolled"; displayState: DisplayAnnoState }
  | { status: "no_target"; displayState: DisplayAnnoState };

export type AnnotationController = {
  createAnnotation: (input: CreateAnnotationInput) => Annotation;
  createFromSelection: (input: CreateFromSelectionInput) => CreateFromSelectionResult;
  updateAnnotationRange: (input: UpdateAnnotationRangeInput) => Annotation;
  updateAnnotationRangeFromSelection: (
    input: UpdateAnnotationRangeFromSelectionInput
  ) => UpdateAnnotationRangeResult;
  scrollToAnnotation: (annotationId: string) => ScrollToAnnotationResult;
  getAnnotation: (annotationId: string) => Annotation | undefined;
  getAllAnnotations: () => Annotation[];
  removeAnnotation: (annotationId: string) => void;
  updateAnnotationState: (annotationId: string, displayState: DisplayAnnoState) => void;
  updateAnnotationColor: (annotationId: string, color: AnnotationColor) => void;
  getSortedAnnotations: () => Annotation[];
  navigateToNextAnnotation: () => boolean;
  navigateToPreviousAnnotation: () => boolean;
  healBrokenChains: (
    state: EditorState,
    runtime: LoroRuntime,
    preResolved?: ResolvedAnnotation[]
  ) => boolean;
};

let focusTimeoutId: number | null = null;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHAIN_POLICY: SpanChainPolicy = {
  kind: "required_order",
  maxInterveningBlocks: 0,
};

const DEFAULT_DISPLAY_STATE: DisplayAnnoState = "active_unverified";
const DEFAULT_STORED_STATE: StoredAnnoState = "active";

// ============================================================================
// Helpers
// ============================================================================

function generateAnnotationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildChain(spanList: SpanList, chain?: SpanChain, policy?: SpanChainPolicy): SpanChain {
  if (chain) {
    return chain;
  }
  return {
    policy: policy ?? DEFAULT_CHAIN_POLICY,
    order: spanList.map((span) => span.blockId),
  };
}

function mapChainPolicyToRepo(policy: SpanChainPolicy): ChainPolicy {
  if (policy.kind === "bounded_gap") {
    return { mode: "bounded_gap", gap: policy.maxInterveningBlocks };
  }
  if (policy.kind === "strict_adjacency") {
    return { mode: "strict_adjacency", gap: policy.maxInterveningBlocks };
  }
  return { mode: "required_order", gap: policy.maxInterveningBlocks };
}

function mapDisplayStateToVerification(state: DisplayAnnoState): VerificationState {
  switch (state) {
    case "active":
      return "active";
    case "active_partial":
      return "active_partial";
    case "active_unverified":
      return "active_unverified";
    case "broken_grace":
      return "broken_grace";
    case "orphan":
      return "orphan";
  }
}

function buildRepoRecord(params: {
  annotationId: string;
  spanList: SpanList;
  chainPolicy: SpanChainPolicy;
  content: string;
  color?: AnnotationColor;
  displayState: DisplayAnnoState;
  createdAtMs: number;
  updatedAtMs: number;
}): AnnotationRecord {
  return {
    annotationId: params.annotationId,
    kind: "highlight",
    createdAtMs: params.createdAtMs,
    updatedAtMs: params.updatedAtMs,
    spanList: params.spanList,
    chainPolicy: mapChainPolicyToRepo(params.chainPolicy),
    verificationState: mapDisplayStateToVerification(params.displayState),
    content: params.content,
    color: params.color,
  };
}

function collectBlockIds(view: EditorView, from: number, to: number): string[] {
  const ids: string[] = [];
  view.state.doc.nodesBetween(from, to, (node: PmNode) => {
    const blockId = node.attrs?.block_id;
    if (typeof blockId === "string" && blockId.trim() !== "") {
      ids.push(blockId);
    }
  });
  return Array.from(new Set(ids));
}

function scrollToBlockId(blockId: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const escapedId = blockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const target = document.querySelector<HTMLElement>(`[data-block-id="${escapedId}"]`);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

// Smartly expand selection to include adjacent trailing punctuation.
// Helps with common user intent where "Word." is desired but "Word" is selected.
function expandSelectionToPunctuation(selection: Selection, state: EditorState): Selection {
  try {
    const { to } = selection;
    // Check next character
    const nextChar = state.doc.textBetween(to, to + 1);

    // Broad regex for any punctuation mark (Unicode aware)
    // Includes .,:;!? and CJK variants, as well as quotes/brackets if adjacent
    if (/^[\p{P}]$/u.test(nextChar)) {
      // Expand selection to include the punctuation mark
      // Removed prevChar check to be more aggressive in capturing user intent
      return TextSelection.create(state.doc, selection.from, to + 1);
    }
  } catch {
    // Ignore out of range errors
  }
  return selection;
}

// ============================================================================
// Controller Implementation
// ============================================================================

export const annotationController: AnnotationController = {
  /**
   * Create annotation from pre-computed spanList
   */
  createAnnotation: (input) => {
    const { spanList } = input;
    if (!spanList || spanList.length === 0) {
      throw new Error("Cannot create annotation without spans");
    }

    const chain = buildChain(spanList, input.chain, input.policy);
    const createdAtMs = input.createdAtMs ?? Date.now();
    const displayState = input.displayState ?? DEFAULT_DISPLAY_STATE;
    const verified = input.verified ?? isVerifiedDisplayState(displayState);

    const first = spanList[0];
    const last = spanList[spanList.length - 1];

    const annotation: Annotation = {
      id: input.id ?? generateAnnotationId(),
      start: anchorFromAbsolute(first.blockId, first.start, "after"),
      end: anchorFromAbsolute(last.blockId, last.end, "before"),
      content: input.content,
      color: input.color,
      storedState: input.storedState ?? DEFAULT_STORED_STATE,
      displayState,
      createdAtMs,
      spans: spanList,
      chain,
      verified,
    };

    const repo = getAnnotationRepo();
    if (repo) {
      repo.create(
        buildRepoRecord({
          annotationId: annotation.id,
          spanList,
          chainPolicy: chain.policy,
          content: annotation.content,
          color: annotation.color,
          displayState: annotation.displayState,
          createdAtMs,
          updatedAtMs: createdAtMs,
        })
      );
    }

    useAnnotationStore.getState().addAnnotation(annotation);

    // Persist immediately to ensure creation survives page refresh
    saveImmediately().catch((err) => {
      console.error("[annotationController] Failed to persist creation:", err);
    });

    return annotation;
  },

  /**
   * Create annotation directly from ProseMirror selection
   * Handles strict mapping and returns result or error with debug payload
   */
  createFromSelection: (input) => {
    const { view, runtime, color, chainPolicy, strict } = input;
    const policy = chainPolicy ?? DEFAULT_CHAIN_POLICY;
    const selection = view.state.selection;
    const strictMode = strict ?? true;

    // Smart Punctuation Expansion
    const expandedSelection = expandSelectionToPunctuation(selection, view.state);

    try {
      const { spanList, chain, verified } = pmSelectionToSpanList(
        expandedSelection,
        view.state,
        // biome-ignore lint/suspicious/noExplicitAny: Bridging core types with editor runtime
        runtime as any,
        { strict: strictMode, chainPolicy: policy }
      );

      if (spanList.length === 0) {
        return {
          ok: false,
          error: "Selection produced empty span list",
          debugPayload: {
            blockIds: collectBlockIds(view, selection.from, selection.to),
            selection: { from: selection.from, to: selection.to },
            policy: { strict: strictMode, chainPolicy: policy },
          },
        };
      }

      const content = view.state.doc.textBetween(
        expandedSelection.from,
        expandedSelection.to,
        "\n"
      );

      const annotation = annotationController.createAnnotation({
        spanList,
        chain,
        content,
        color,
        displayState: verified ? "active" : "active_unverified",
        verified,
      });

      return { ok: true, annotation };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      reportEditorError(err, {
        operation: "createFromSelection",
        extra: {
          blockIds: collectBlockIds(view, selection.from, selection.to),
          selection: { from: selection.from, to: selection.to },
          policy: { strict: strictMode, chainPolicy: policy },
        },
      });
      return {
        ok: false,
        error: err.message,
        debugPayload: {
          blockIds: collectBlockIds(view, selection.from, selection.to),
          selection: { from: selection.from, to: selection.to },
          policy: { strict: strictMode, chainPolicy: policy },
          message: err.message,
        },
      };
    }
  },

  /**
   * Update annotation spans directly (no mapping)
   */
  updateAnnotationRange: (input) => {
    const annotation = useAnnotationStore.getState().annotations[input.annotationId];
    if (!annotation) {
      throw new Error(`Annotation ${input.annotationId} not found`);
    }

    const { spanList } = input;
    if (!spanList || spanList.length === 0) {
      throw new Error("Cannot update annotation without spans");
    }

    const policy = input.chain?.policy ?? annotation.chain?.policy ?? DEFAULT_CHAIN_POLICY;
    const chain = input.chain ?? buildChain(spanList, annotation.chain, policy);
    const displayState = input.displayState ?? annotation.displayState;
    const verified = input.verified ?? isVerifiedDisplayState(displayState);

    const first = spanList[0];
    const last = spanList[spanList.length - 1];

    const updatedFields: Partial<Annotation> = {
      start: anchorFromAbsolute(first.blockId, first.start, "after"),
      end: anchorFromAbsolute(last.blockId, last.end, "before"),
      content: input.content ?? annotation.content,
      color: input.color ?? annotation.color,
      spans: spanList,
      chain,
      displayState,
      verified,
    };

    const repo = getAnnotationRepo();
    if (repo) {
      repo.create(
        buildRepoRecord({
          annotationId: annotation.id,
          spanList,
          chainPolicy: chain.policy,
          content: updatedFields.content ?? "",
          color: updatedFields.color,
          displayState,
          createdAtMs: annotation.createdAtMs,
          updatedAtMs: Date.now(),
        })
      );
    }

    useAnnotationStore.getState().updateAnnotation(annotation.id, updatedFields);

    // Persist immediately to ensure update survives page refresh
    saveImmediately().catch((err) => {
      console.error("[annotationController] Failed to persist update:", err);
    });

    return { ...annotation, ...updatedFields };
  },

  /**
   * Update annotation range directly from a provided selection
   * Strict mapping fail-closed: no mutation on failure
   */
  updateAnnotationRangeFromSelection: (input) => {
    const { annotationId, selection, state, runtime, chainPolicy, strict } = input;
    const annotation = useAnnotationStore.getState().annotations[annotationId];
    if (!annotation) {
      return {
        ok: false,
        error: `Annotation ${annotationId} not found`,
        debugPayload: { annotationId },
      };
    }

    const policy = chainPolicy ?? annotation.chain?.policy ?? DEFAULT_CHAIN_POLICY;
    const strictMode = strict ?? true;

    // Smart Punctuation Expansion
    const expandedSelection = expandSelectionToPunctuation(selection, state);

    try {
      const { spanList, chain, verified } = pmSelectionToSpanList(
        expandedSelection,
        state,
        // biome-ignore lint/suspicious/noExplicitAny: Bridging core types with editor runtime
        runtime as any,
        { strict: strictMode, chainPolicy: policy }
      );

      if (spanList.length === 0) {
        return {
          ok: false,
          error: "Selection produced empty span list",
          debugPayload: {
            annotationId,
            selection: { from: selection.from, to: selection.to },
            policy: { strict: strictMode, chainPolicy: policy },
          },
        };
      }

      const content = state.doc.textBetween(expandedSelection.from, expandedSelection.to, "\n");
      const displayState = verified ? "active" : "active_unverified";

      const updated = annotationController.updateAnnotationRange({
        annotationId,
        spanList,
        chain,
        content,
        displayState,
        verified,
      });

      return { ok: true, annotation: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        error: message,
        debugPayload: {
          annotationId,
          selection: { from: selection.from, to: selection.to },
          policy: { strict: strictMode, chainPolicy: policy },
          message,
        },
      };
    }
  },

  /**
   * Scroll editor to annotation location
   */
  scrollToAnnotation: (annotationId) => {
    const annotation = useAnnotationStore.getState().annotations[annotationId];
    if (!annotation) {
      console.warn(`scrollToAnnotation: annotation ${annotationId} not found`);
      return { status: "missing" };
    }

    if (annotation.displayState === "orphan") {
      const decoded = absoluteFromAnchor(annotation.start);
      const blockId = decoded ? decoded.blockId : null;
      const scrolled = blockId ? scrollToBlockId(blockId) : false;
      return { status: "orphan", blockId, scrolled };
    }

    if (process.env.NODE_ENV !== "production") {
      document.body?.setAttribute("data-lfcc-scroll-target", annotationId);
    }

    if (typeof document === "undefined") {
      return { status: "no_target", displayState: annotation.displayState };
    }
    const escapedId = annotationId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(`.lfcc-annotation[data-annotation-id="${escapedId}"]`)
    );

    if (targets.length === 0) {
      console.warn(`scrollToAnnotation: highlight for ${annotationId} not found`);
      useAnnotationStore.getState().setFocusedAnnotationId(null);
      return { status: "no_target", displayState: annotation.displayState };
    }

    const store = useAnnotationStore.getState();
    store.setFocusedAnnotationId(annotationId);
    if (focusTimeoutId != null && typeof window !== "undefined") {
      window.clearTimeout(focusTimeoutId);
    }
    if (typeof window !== "undefined") {
      focusTimeoutId = window.setTimeout(() => {
        useAnnotationStore.getState().setFocusedAnnotationId(null);
        focusTimeoutId = null;
      }, 1200);
    }

    targets[0].scrollIntoView({ behavior: "smooth", block: "center" });
    return { status: "scrolled", displayState: annotation.displayState };
  },

  /**
   * Get annotation by ID
   */
  getAnnotation: (annotationId) => {
    return useAnnotationStore.getState().annotations[annotationId];
  },

  /**
   * Get all annotations
   */
  getAllAnnotations: () => {
    return Object.values(useAnnotationStore.getState().annotations);
  },

  /**
   * Remove annotation
   */
  removeAnnotation: (annotationId) => {
    const repo = getAnnotationRepo();
    if (repo) {
      repo.delete(annotationId);
    }

    useAnnotationStore.getState().removeAnnotation(annotationId);

    // Also delete associated comments to prevent orphans
    useCommentStore.getState().clearComments(annotationId);

    // Persist immediately to ensure deletion survives page refresh
    saveImmediately().catch((err) => {
      console.error("[annotationController] Failed to persist deletion:", err);
    });
  },

  /**
   * Update annotation display state
   */
  updateAnnotationState: (annotationId, displayState) => {
    const verified = isVerifiedDisplayState(displayState);
    const repo = getAnnotationRepo();
    if (repo) {
      repo.update(annotationId, { verificationState: mapDisplayStateToVerification(displayState) });
    }
    useAnnotationStore.getState().updateAnnotation(annotationId, {
      displayState,
      verified,
    });

    // Persist immediately to ensure state change survives page refresh
    saveImmediately().catch((err) => {
      console.error("[annotationController] Failed to persist state update:", err);
    });
  },

  /**
   * Update annotation color
   */
  updateAnnotationColor: (annotationId, color) => {
    const repo = getAnnotationRepo();
    if (repo) {
      repo.update(annotationId, { color });
    }
    useAnnotationStore.getState().updateAnnotation(annotationId, {
      color,
    });

    // Persist immediately to ensure color change survives page refresh
    saveImmediately().catch((err) => {
      console.error("[annotationController] Failed to persist color update:", err);
    });
  },

  /**
   * Get all annotations sorted by document order
   * Sorted by first span's blockId and start offset
   */
  getSortedAnnotations: () => {
    const annotations = Object.values(useAnnotationStore.getState().annotations);
    return annotations
      .filter((a) => a.displayState !== "orphan")
      .sort((a: Annotation, b: Annotation) => {
        const aSpan = a.spans?.[0];
        const bSpan = b.spans?.[0];
        if (!aSpan || !bSpan) {
          return 0;
        }
        // Compare blockIds lexicographically, then by start offset
        const blockCompare = aSpan.blockId.localeCompare(bSpan.blockId);
        if (blockCompare !== 0) {
          return blockCompare;
        }
        return aSpan.start - bSpan.start;
      });
  },

  /**
   * Navigate to next annotation in document order
   * Returns true if navigation occurred, false if no annotations
   */
  navigateToNextAnnotation: (): boolean => {
    const sorted = annotationController.getSortedAnnotations();
    if (sorted.length === 0) {
      return false;
    }

    const currentId = useAnnotationStore.getState().focusedAnnotationId;
    let nextIndex = 0;

    if (currentId) {
      const currentIndex = sorted.findIndex((a) => a.id === currentId);
      if (currentIndex !== -1) {
        nextIndex = (currentIndex + 1) % sorted.length;
      }
    }

    const nextAnnotation = sorted[nextIndex];
    if (nextAnnotation) {
      annotationController.scrollToAnnotation(nextAnnotation.id);
      return true;
    }
    return false;
  },

  /**
   * Navigate to previous annotation in document order
   * Returns true if navigation occurred, false if no annotations
   */
  navigateToPreviousAnnotation: (): boolean => {
    const sorted = annotationController.getSortedAnnotations();
    if (sorted.length === 0) {
      return false;
    }

    const currentId = useAnnotationStore.getState().focusedAnnotationId;
    let prevIndex = sorted.length - 1;

    if (currentId) {
      const currentIndex = sorted.findIndex((a) => a.id === currentId);
      if (currentIndex !== -1) {
        prevIndex = (currentIndex - 1 + sorted.length) % sorted.length;
      }
    }

    const prevAnnotation = sorted[prevIndex];
    if (prevAnnotation) {
      annotationController.scrollToAnnotation(prevAnnotation.id);
      return true;
    }
    return false;
  },

  /**
   * Heal broken annotation chains (e.g. after block reorder)
   * Detects "active_partial" annotations where blocks exist but are out of order.
   * Splits them into multiple valid annotations.
   */
  healBrokenChains: (
    state: EditorState,
    runtime: LoroRuntime,
    preResolved?: { id: string; state: DisplayAnnoState; missingBlockIds: string[] }[]
  ): boolean => healBrokenChainsInternal(state, runtime, preResolved),
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: healing logic spans multiple repair strategies
function healBrokenChainsInternal(
  state: EditorState,
  runtime: LoroRuntime,
  preResolved?: { id: string; state: DisplayAnnoState; missingBlockIds: string[] }[]
): boolean {
  // If preResolved is not provided, we must build blockIndex and resolve manually
  // But mostly we expect preResolved to be passed from the plugin loop
  let resolvedList = preResolved;
  let blockIndex: BlockIndex | undefined;

  if (!resolvedList) {
    blockIndex = buildBlockIndex(state);
    const annotations = annotationController.getAllAnnotations();
    resolvedList = annotations.map((a) => resolveAnnotationRanges(a, runtime, state, blockIndex));
  } else {
    // If preResolved is passed, we might still need blockIndex for sorting logic below
    // blockIndex is cheap if cached, so let's get it.
    blockIndex = buildBlockIndex(state);
  }

  let didHeal = false;

  for (const resolved of resolvedList) {
    // Check the RESOLVED state.
    // We aim to heal 'active_partial' (missing blocks or out of order).
    if (resolved.state !== "active_partial") {
      continue;
    }

    const annotation = annotationController.getAnnotation(resolved.id);
    if (!annotation || !annotation.spans) {
      continue;
    }

    // 1. Handle Missing Blocks: Filter them out.
    // This heals "middle delete" cases by pruning the ghost span.
    let spans = annotation.spans;
    if (resolved.missingBlockIds.length > 0) {
      spans = spans.filter((s) => !resolved.missingBlockIds.includes(s.blockId));
      didHeal = true; // Modifying spans is a heal action
    }

    if (spans.length === 0) {
      // Annotation completely gone
      annotationController.removeAnnotation(annotation.id);
      didHeal = true;
      continue;
    }

    // 2. Check Chain Continuity / Order
    // Use original span order (filtered) as the target order.
    const groups: SpanList[] = [];
    let currentGroup: SpanList = [];

    const policy = annotation.chain?.policy ?? DEFAULT_CHAIN_POLICY;
    const maxGap = policy.maxInterveningBlocks ?? 0;

    for (const span of spans) {
      if (currentGroup.length === 0) {
        currentGroup.push(span);
        continue;
      }

      const lastSpan = currentGroup[currentGroup.length - 1];
      const lastIndex = blockIndex.orderIndex.get(lastSpan.blockId) ?? -1;
      const currentIndex = blockIndex.orderIndex.get(span.blockId) ?? -1;

      // Check continuity based on policy
      let isContinuous = false;

      if (lastIndex === -1 || currentIndex === -1) {
        // Should not happen as we filtered missing blocks, but safe fallback
        isContinuous = false;
      } else if (lastSpan.blockId === span.blockId) {
        isContinuous = true;
      } else if (currentIndex > lastIndex) {
        const gap = currentIndex - lastIndex - 1;
        if (policy.kind === "strict_adjacency") {
          isContinuous = gap === 0;
        } else {
          // For required_order, we default to allowing 0 gap (strict) unless configured otherwise
          // Note: DEFAULT_CHAIN_POLICY is maxInterveningBlocks: 0
          isContinuous = gap <= maxGap;
        }
      } else {
        // Wrong order (currentIndex <= lastIndex) -> Split
        isContinuous = false;
      }

      if (isContinuous) {
        currentGroup.push(span);
      } else {
        groups.push(currentGroup);
        currentGroup = [span];
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // If we only have 1 group AND we didn't prune any blocks, then no change needed.
    // If we pruned blocks, we MUST update even if it's 1 group.
    if (groups.length <= 1) {
      if (didHeal && groups.length === 1) {
        // We pruned blocks, so update the single remaining group
        annotationController.updateAnnotationRange({
          annotationId: annotation.id,
          spanList: groups[0],
          // Reset state to active if it was verified, or keep unverified
          displayState: isVerifiedDisplayState(annotation.displayState)
            ? "active"
            : "active_unverified",
        });
      }
      continue;
    }

    // APPLY SPLIT
    didHeal = true;

    const firstGroup = groups[0];
    annotationController.updateAnnotationRange({
      annotationId: annotation.id,
      spanList: firstGroup,
      displayState: isVerifiedDisplayState(annotation.displayState)
        ? "active"
        : "active_unverified",
    });

    for (let i = 1; i < groups.length; i++) {
      const spanList = groups[i];
      annotationController.createAnnotation({
        spanList,
        chain: buildChain(spanList, undefined, policy),
        content: annotation.content,
        color: annotation.color,
        displayState: isVerifiedDisplayState(annotation.displayState)
          ? "active"
          : "active_unverified",
        verified: annotation.verified,
      });
    }
  }

  return didHeal;
}
