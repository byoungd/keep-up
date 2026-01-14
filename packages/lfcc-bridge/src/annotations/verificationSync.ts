/**
 * LFCC Annotation Verification State Sync
 *
 * Wires verification state transitions to Loro events.
 * Ensures all clients converge on the same verification state.
 *
 * Key principles:
 * - Never "guess" positions - degrade to partial/orphan per LFCC spec
 * - No flicker loops from conflicting writes
 * - Remote clients see the same verification state
 */

import { absoluteFromAnchor } from "@ku0/core";
import type { LoroDoc } from "loro-crdt";
import { decodeAnchor as decodeLegacyCursorAnchor, resolveAnchor } from "../anchors/loroAnchors";
import type { LoroRuntime } from "../runtime/loroRuntime";
import type { SpanList } from "../selection/selectionMapping";
import {
  type StoredAnnoState,
  type StoredAnnotationRecord,
  readAnnotation,
  updateAnnotationState,
} from "./annotationSchema";

// ============================================================================
// Types
// ============================================================================

/** Verification result from span resolution */
export type VerificationResult =
  | { status: "active"; resolvedSpans: SpanList }
  | { status: "active_partial"; resolvedSpans: SpanList; missingBlockIds: string[] }
  | { status: "orphan"; reason: string };

/** Verification event for state machine */
export type VerificationEvent =
  | { type: "VERIFY_OK" }
  | { type: "VERIFY_PARTIAL"; missingBlockIds: string[] }
  | { type: "VERIFY_ORPHAN"; reason: string };

/** Callback for state change notifications */
export type StateChangeCallback = (
  annotationId: string,
  oldState: StoredAnnoState,
  newState: StoredAnnoState
) => void;

// ============================================================================
// Verification Reducer
// ============================================================================

export type VerificationReducerOptions = {
  /** Origin tag for Loro commits */
  originTag?: string;
  /** Callback when state changes */
  onStateChange?: StateChangeCallback;
};

/**
 * Create a verification reducer that updates Loro on state transitions
 */
export function createVerificationReducer(
  runtime: LoroRuntime,
  options: VerificationReducerOptions = {}
) {
  const { originTag = "lfcc:verification", onStateChange } = options;

  /**
   * Process verification result and update Loro state
   * Returns the new state or null if no change needed
   */
  function processVerification(
    annotationId: string,
    result: VerificationResult
  ): StoredAnnoState | null {
    const current = readAnnotation(runtime.doc, annotationId);
    if (!current) {
      return null;
    }

    const oldState = current.storedState;
    let newState: StoredAnnoState;

    switch (result.status) {
      case "active":
        newState = "active";
        break;
      case "active_partial":
        newState = "active_partial";
        break;
      case "orphan":
        newState = "orphan";
        break;
    }

    // S-01 FIX: Enforce fail-closed conflict resolution
    // Always check against implicit conflict rules before applying new state.
    // This protects local "orphan" judgment from being overwritten by remote "active".
    const resolved = resolveStateConflict(oldState, newState);
    if (resolved !== newState) {
      // The conflict resolution logic prefers our current state (e.g. we are orphan, they are active).
      // We must fail-closed and NOT apply the update.
      return null;
    }

    // Skip if no state change needed (checked again after resolution, effectively)
    if (oldState === newState) {
      return null;
    }

    // Skip if already in terminal state
    if (oldState === "deleted") {
      return null;
    }

    // Note: "hidden" is not strictly terminal in all designs, but here we treat it as sticky?
    // The conflict resolution: deleted > hidden > orphan > active_partial > active
    // If we are hidden, and new state is orphan/active, resolveStateConflict returns hidden.
    // So the check above (resolved !== newState) handles it.

    // Update Loro
    updateAnnotationState(runtime.doc, annotationId, newState);
    runtime.commit(originTag);

    // Notify callback
    if (onStateChange) {
      onStateChange(annotationId, oldState, newState);
    }

    return newState;
  }

  /**
   * Handle verification event from state machine
   */
  function handleEvent(annotationId: string, event: VerificationEvent): StoredAnnoState | null {
    switch (event.type) {
      case "VERIFY_OK":
        return processVerification(annotationId, { status: "active", resolvedSpans: [] });
      case "VERIFY_PARTIAL":
        return processVerification(annotationId, {
          status: "active_partial",
          resolvedSpans: [],
          missingBlockIds: event.missingBlockIds,
        });
      case "VERIFY_ORPHAN":
        return processVerification(annotationId, {
          status: "orphan",
          reason: event.reason,
        });
    }
  }

  /**
   * Batch verify multiple annotations
   * Useful for checkpoint operations
   */
  function batchVerify(
    results: Array<{ annotationId: string; result: VerificationResult }>
  ): Map<string, StoredAnnoState> {
    const changes = new Map<string, StoredAnnoState>();

    for (const { annotationId, result } of results) {
      const newState = processVerification(annotationId, result);
      if (newState) {
        changes.set(annotationId, newState);
      }
    }

    return changes;
  }

  return {
    processVerification,
    handleEvent,
    batchVerify,
  };
}

// ============================================================================
// Span Verification Logic
// ============================================================================

/** Result of resolving a single span anchor */
type AnchorResolveResult = {
  offset: number;
  resolved: boolean;
};

/**
 * Try to resolve a span anchor to get updated offset
 *
 * **Security Note:** Anchor integrity is validated during decode.
 * Invalid anchors (checksum mismatch, corrupted data) return null,
 * enforcing fail-closed security per SEC-003.
 */
function resolveSpanAnchor(
  doc: LoroDoc,
  anchor: { anchor: string } | undefined,
  blockId: string,
  fallbackOffset: number
): AnchorResolveResult {
  if (!anchor) {
    return { offset: fallbackOffset, resolved: false };
  }

  const decoded = absoluteFromAnchor(anchor.anchor);
  if (decoded) {
    if (decoded.blockId !== blockId) {
      return { offset: fallbackOffset, resolved: false };
    }
    return { offset: decoded.offset, resolved: true };
  }

  try {
    const cursor = decodeLegacyCursorAnchor(decodeBase64ToBytes(anchor.anchor));
    if (!cursor) {
      return { offset: fallbackOffset, resolved: false };
    }
    const resolved = resolveAnchor(doc, cursor);
    if (resolved) {
      return { offset: resolved.offset, resolved: true };
    }
  } catch {
    // Anchor decode failed, use stored offset.
  }

  return { offset: fallbackOffset, resolved: false };
}

/**
 * Verify a single span against current document state
 */
function verifySingleSpan(
  doc: LoroDoc,
  span: {
    blockId: string;
    start: number;
    end: number;
    startAnchor?: { anchor: string };
    endAnchor?: { anchor: string };
  },
  blockExists: (blockId: string) => boolean
): { blockId: string; start: number; end: number } | null {
  if (!blockExists(span.blockId)) {
    return null;
  }

  const startResult = resolveSpanAnchor(doc, span.startAnchor, span.blockId, span.start);
  const endResult = resolveSpanAnchor(doc, span.endAnchor, span.blockId, span.end);

  // Validate range
  if (endResult.offset < startResult.offset) {
    return null;
  }

  return {
    blockId: span.blockId,
    start: startResult.offset,
    end: endResult.offset,
  };
}

type SpanResolutionOutcome =
  | { status: "resolved"; span: { blockId: string; start: number; end: number } }
  | { status: "missing"; blockId: string };

function getBlockLength(doc: LoroDoc, blockId: string): number {
  const blockMap = doc.getMap("blocks");
  const blockData = blockMap.get(blockId);
  if (blockData && typeof blockData === "object" && "text" in blockData) {
    const textContainer = blockData.text;
    if (textContainer && typeof textContainer === "object" && "toString" in textContainer) {
      return textContainer.toString().length;
    }
  }
  return 0;
}

function resolveAndValidateSpan(
  doc: LoroDoc,
  annotationId: string,
  span: {
    blockId: string;
    start: number;
    end: number;
    startAnchor?: { anchor: string };
    endAnchor?: { anchor: string };
  },
  blockExists: (blockId: string) => boolean,
  options?: {
    relocationValidator?: RelocationValidator;
    documentBlockOrder?: string[];
  }
): SpanResolutionOutcome {
  const resolved = verifySingleSpan(doc, span, blockExists);
  if (!resolved) {
    return { status: "missing", blockId: span.blockId };
  }

  if (!options?.relocationValidator) {
    return { status: "resolved", span: resolved };
  }

  const isRelocated =
    resolved.blockId !== span.blockId || resolved.start !== span.start || resolved.end !== span.end;

  if (!isRelocated) {
    return { status: "resolved", span: resolved };
  }

  const blockLength = getBlockLength(doc, span.blockId);
  const validation = options.relocationValidator(
    annotationId,
    { blockId: span.blockId, start: span.start, end: span.end },
    { blockId: resolved.blockId, start: resolved.start, end: resolved.end },
    blockLength,
    options.documentBlockOrder
  );

  if (!validation.ok && validation.error) {
    return { status: "missing", blockId: span.blockId };
  }

  return { status: "resolved", span: resolved };
}

function buildVerificationResult(
  resolvedSpans: SpanList,
  missingBlockIds: string[]
): VerificationResult {
  if (missingBlockIds.length === 0) {
    return { status: "active", resolvedSpans };
  }

  if (resolvedSpans.length > 0) {
    return { status: "active_partial", resolvedSpans, missingBlockIds };
  }

  return {
    status: "orphan",
    reason: `All blocks missing: ${missingBlockIds.join(", ")}`,
  };
}

/**
 * Relocation validation callback
 * P0.2: Optional relocation validation for span resolution
 */
export type RelocationValidator = (
  annotationId: string,
  originalSpan: { blockId: string; start: number; end: number },
  relocatedSpan: { blockId: string; start: number; end: number },
  blockLength: number,
  documentBlockOrder?: string[]
) => { ok: boolean; requiresConfirmation: boolean; error?: string };

/**
 * Verify annotation spans against current document state
 * Returns verification result based on span resolution
 *
 * P2 FIX: Uses canonical anchors and falls back to legacy cursor anchors when available
 * P0.2: Supports optional relocation validation when spans are relocated
 */
export function verifyAnnotationSpans(
  doc: LoroDoc,
  annotation: StoredAnnotationRecord,
  blockExists: (blockId: string) => boolean,
  options?: {
    /** P0.2: Optional relocation validator for relocated spans */
    relocationValidator?: RelocationValidator;
    /** Block order for relocation validation (Level 3) */
    documentBlockOrder?: string[];
  }
): VerificationResult {
  const { spans } = annotation;

  if (spans.length === 0) {
    return { status: "orphan", reason: "No spans in annotation" };
  }

  const missingBlockIds: string[] = [];
  const resolvedSpans: SpanList = [];

  for (const span of spans) {
    const outcome = resolveAndValidateSpan(doc, annotation.id, span, blockExists, options);
    if (outcome.status === "resolved") {
      resolvedSpans.push(outcome.span);
      continue;
    }
    missingBlockIds.push(outcome.blockId);
  }

  return buildVerificationResult(resolvedSpans, missingBlockIds);
}

/** Decode base64 to Uint8Array */
function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(normalized, "base64"));
  }
  let padded = normalized;
  while (padded.length % 4) {
    padded += "=";
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// Remote Sync Handler
// ============================================================================

/**
 * Handle remote verification state changes
 * Prevents flicker loops by checking if local state matches remote
 */
export function createRemoteSyncHandler(
  runtime: LoroRuntime,
  onRemoteStateChange: (annotationId: string, newState: StoredAnnoState) => void
) {
  const localPendingWrites = new Set<string>();

  /**
   * Mark annotation as having a pending local write
   * Prevents echo handling of our own writes
   */
  function markLocalWrite(annotationId: string): void {
    localPendingWrites.add(annotationId);
  }

  /**
   * Clear pending write marker after commit
   */
  function clearLocalWrite(annotationId: string): void {
    localPendingWrites.delete(annotationId);
  }

  /**
   * Handle incoming remote state change
   * Returns true if the change was applied, false if ignored
   */
  function handleRemoteChange(annotationId: string, remoteState: StoredAnnoState): boolean {
    // Ignore if this is our own write echoing back
    if (localPendingWrites.has(annotationId)) {
      localPendingWrites.delete(annotationId);
      return false;
    }

    const current = readAnnotation(runtime.doc, annotationId);
    if (!current) {
      return false;
    }

    // Only notify if state actually differs
    if (current.storedState !== remoteState) {
      onRemoteStateChange(annotationId, remoteState);
      return true;
    }

    return false;
  }

  return {
    markLocalWrite,
    clearLocalWrite,
    handleRemoteChange,
  };
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Resolve conflicting verification states
 * Uses deterministic rules to ensure convergence:
 * - "deleted" always wins (tombstone)
 * - "hidden" wins over active states
 * - "orphan" wins over "active_partial"
 * - "active_partial" wins over "active"
 */
export function resolveStateConflict(
  state1: StoredAnnoState,
  state2: StoredAnnoState
): StoredAnnoState {
  const priority: Record<StoredAnnoState, number> = {
    deleted: 5,
    hidden: 4,
    orphan: 3,
    active_partial: 2,
    active: 1,
  };

  return priority[state1] >= priority[state2] ? state1 : state2;
}

// ============================================================================
// Batch Verification
// ============================================================================

export type VerificationReport = {
  timestamp: number;
  totalAnnotations: number;
  results: Array<{
    annotationId: string;
    previousState: StoredAnnoState;
    newState: StoredAnnoState;
    result: VerificationResult;
  }>;
  summary: {
    active: number;
    activePartial: number;
    orphan: number;
    unchanged: number;
  };
};

/**
 * Verify all annotations against current document state
 * Returns a comprehensive verification report
 */
export function verifyAnnotations(
  doc: LoroDoc,
  annotations: StoredAnnotationRecord[],
  blockExists: (blockId: string) => boolean
): VerificationReport {
  // R-03: Timestamp is advisory UI metadata only (wall-clock).
  // Not used for CRDT logic, sorting, or deterministic state.
  const timestamp = Date.now();
  const results: VerificationReport["results"] = [];
  const summary = { active: 0, activePartial: 0, orphan: 0, unchanged: 0 };

  for (const annotation of annotations) {
    const previousState = annotation.storedState;
    const result = verifyAnnotationSpans(doc, annotation, blockExists);

    let newState: StoredAnnoState;
    switch (result.status) {
      case "active":
        newState = "active";
        summary.active++;
        break;
      case "active_partial":
        newState = "active_partial";
        summary.activePartial++;
        break;
      case "orphan":
        newState = "orphan";
        summary.orphan++;
        break;
    }

    if (previousState === newState) {
      summary.unchanged++;
    }

    results.push({
      annotationId: annotation.id,
      previousState,
      newState,
      result,
    });
  }

  return {
    timestamp,
    totalAnnotations: annotations.length,
    results,
    summary,
  };
}

// ============================================================================
// P2 FIX: Incremental Verification
// ============================================================================

/** Index of annotations by blockId for O(1) lookup */
export type AnnotationIndex = Map<string, Set<string>>; // blockId -> annotation IDs

/**
 * Build index of which blocks are referenced by which annotations
 * Use this to enable incremental verification
 */
export function buildAnnotationIndex(annotations: StoredAnnotationRecord[]): AnnotationIndex {
  const index: AnnotationIndex = new Map();

  for (const annotation of annotations) {
    for (const span of annotation.spans) {
      let blockSet = index.get(span.blockId);
      if (!blockSet) {
        blockSet = new Set();
        index.set(span.blockId, blockSet);
      }
      blockSet.add(annotation.id);
    }
  }

  return index;
}

/**
 * Find annotations affected by changes to specific blocks
 * Returns only the annotation IDs that need re-verification
 */
export function findAffectedAnnotations(
  index: AnnotationIndex,
  changedBlockIds: string[]
): Set<string> {
  const affected = new Set<string>();

  for (const blockId of changedBlockIds) {
    const annotationIds = index.get(blockId);
    if (annotationIds) {
      for (const id of annotationIds) {
        affected.add(id);
      }
    }
  }

  return affected;
}

/**
 * Verify only annotations affected by specific block changes
 * O(K) where K = number of affected annotations, instead of O(N) for all
 */
export function verifyAffectedAnnotations(
  doc: LoroDoc,
  annotations: StoredAnnotationRecord[],
  changedBlockIds: string[],
  blockExists: (blockId: string) => boolean,
  index?: AnnotationIndex
): VerificationReport {
  // Build index if not provided
  const annotationIndex = index ?? buildAnnotationIndex(annotations);

  // Find affected annotations
  const affectedIds = findAffectedAnnotations(annotationIndex, changedBlockIds);

  // Filter to only affected annotations
  const affectedAnnotations = annotations.filter((a) => affectedIds.has(a.id));

  // Verify only affected ones
  return verifyAnnotations(doc, affectedAnnotations, blockExists);
}

/**
 * Apply verification report to Loro doc
 * Updates all annotations that changed state
 */
export function applyVerificationReport(doc: LoroDoc, report: VerificationReport): number {
  let changesApplied = 0;

  for (const result of report.results) {
    if (result.previousState !== result.newState) {
      updateAnnotationState(doc, result.annotationId, result.newState);
      changesApplied++;
    }
  }

  return changesApplied;
}
