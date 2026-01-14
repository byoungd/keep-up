/**
 * LFCC Annotation Repository
 *
 * Non-UI repository layer for annotation persistence in Loro.
 * Provides CRUD operations and subscription for annotation records.
 *
 * Invariants:
 * - INV-PERSIST-001: Annotation IDs MUST be stable and globally unique
 * - INV-PERSIST-002: Loro state MUST converge to same annotation set
 * - INV-PERSIST-003: No UI-only fields may be stored
 */

import { absoluteFromAnchor, anchorFromAbsolute } from "@ku0/core";
import type { LoroDoc } from "loro-crdt";
import { decodeAnchor as decodeLegacyCursorAnchor, resolveAnchor } from "../anchors/loroAnchors";
import type { SpanChainPolicy, SpanList } from "../selection/selectionMapping";
import {
  type AnnotationSubscriber,
  type StoredAnnoState,
  type StoredAnnotationRecord,
  type StoredSpanAnchor,
  type StoredSpanRange,
  createAnnotation as createAnnotationRecord,
  removeAnnotation as hardRemoveAnnotation,
  readAllAnnotations,
  readAnnotation,
  deleteAnnotation as softDeleteAnnotation,
  spanListToStored,
  storedToSpanList,
  subscribeToAnnotations,
  writeAnnotation,
} from "./annotationSchema";

// ============================================================================
// Runtime Type
// ============================================================================

/** Loro runtime wrapper with doc and commit */
export type MinimalLoroRuntime = {
  doc: LoroDoc;
  commit: (origin: string) => void;
};

// ============================================================================
// Types
// ============================================================================

/** Annotation kind for categorization */
export type AnnotationKind = "highlight" | "comment" | "suggestion" | string;

/** Chain policy for span ordering */
export type ChainPolicy = {
  mode: "required_order" | "strict_adjacency" | "bounded_gap";
  gap?: number;
};

/** Verification state (replicated) */
export type VerificationState =
  | "active"
  | "active_unverified"
  | "active_partial"
  | "broken_grace"
  | "orphan";

/** Full annotation record for repository operations */
export type AnnotationRecord = {
  annotationId: string;
  threadId?: string;
  kind: AnnotationKind;
  createdAtMs: number;
  updatedAtMs: number;
  spanList: SpanList;
  chainPolicy: ChainPolicy;
  verificationState: VerificationState;
  contextHash?: string;
  chainHash?: string;
  author?: string;
  content?: string;
  color?: string;
};

/** Patch for updating annotation */
export type AnnotationPatch = Partial<
  Pick<AnnotationRecord, "verificationState" | "contextHash" | "chainHash" | "content" | "color">
>;

/** Subscription callback */
// Subscription callback type imported from schema
// export type AnnotationSubscriber = (events: AnnotationChangeEvent[]) => void;

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * Encode SpanList to Uint8Array for storage
 * Uses JSON serialization with base64 for anchors
 */
export function encodeSpanList(spanList: SpanList): Uint8Array {
  const stored = spanListToStored(spanList);
  const json = JSON.stringify(stored);
  return new TextEncoder().encode(json);
}

/**
 * Decode Uint8Array back to SpanList
 */
export function decodeSpanList(bytes: Uint8Array): SpanList {
  const json = new TextDecoder().decode(bytes);
  const stored = JSON.parse(json);
  return storedToSpanList(stored);
}

// ============================================================================
// Anchor Migration (Legacy -> v2)
// ============================================================================

type AnchorMigration = {
  anchor?: StoredSpanAnchor;
  offset: number;
  migrated: boolean;
};

function normalizeBias(bias: string): "before" | "after" {
  if (bias === "before" || bias === "after") {
    return bias;
  }
  if (bias === "left") {
    return "before";
  }
  return "after";
}

function migrateAnchorEncoding(
  doc: LoroDoc,
  blockId: string,
  anchor: StoredSpanAnchor | undefined,
  fallbackOffset: number
): AnchorMigration {
  if (!anchor) {
    return { offset: fallbackOffset, migrated: false };
  }

  const normalizedBias = normalizeBias(anchor.bias);
  const decoded = absoluteFromAnchor(anchor.anchor);
  if (decoded && decoded.blockId === blockId) {
    try {
      const canonical = anchorFromAbsolute(decoded.blockId, decoded.offset, decoded.bias);
      const migrated =
        canonical !== anchor.anchor ||
        normalizedBias !== anchor.bias ||
        decoded.offset !== fallbackOffset;
      return {
        anchor: { anchor: canonical, bias: decoded.bias },
        offset: decoded.offset,
        migrated,
      };
    } catch {
      return {
        anchor: { anchor: anchor.anchor, bias: normalizedBias },
        offset: fallbackOffset,
        migrated: normalizedBias !== anchor.bias,
      };
    }
  }

  try {
    const cursor = decodeLegacyCursorAnchor(anchor.anchor);
    if (cursor) {
      const resolved = resolveAnchor(doc, cursor);
      if (resolved) {
        const bias = resolved.side === 1 ? "after" : "before";
        const canonical = anchorFromAbsolute(blockId, resolved.offset, bias);
        return {
          anchor: { anchor: canonical, bias },
          offset: resolved.offset,
          migrated: true,
        };
      }
    }
  } catch {
    // Fall back to stored anchor.
  }

  return {
    anchor: { anchor: anchor.anchor, bias: normalizedBias },
    offset: fallbackOffset,
    migrated: normalizedBias !== anchor.bias,
  };
}

function migrateSpanAnchors(
  doc: LoroDoc,
  spans: StoredSpanRange[]
): { spans: StoredSpanRange[]; migrated: boolean } {
  let migrated = false;
  const next = spans.map((span) => {
    const startResult = migrateAnchorEncoding(doc, span.blockId, span.startAnchor, span.start);
    const endResult = migrateAnchorEncoding(doc, span.blockId, span.endAnchor, span.end);
    const nextSpan: StoredSpanRange = {
      ...span,
      start: startResult.offset,
      end: endResult.offset,
      startAnchor: startResult.anchor,
      endAnchor: endResult.anchor,
    };
    if (
      startResult.migrated ||
      endResult.migrated ||
      startResult.offset !== span.start ||
      endResult.offset !== span.end
    ) {
      migrated = true;
    }
    return nextSpan;
  });

  return { spans: next, migrated };
}

function migrateLegacyAnchors(doc: LoroDoc): number {
  const records = readAllAnnotations(doc);
  let updated = 0;
  for (const record of records) {
    const result = migrateSpanAnchors(doc, record.spans);
    if (!result.migrated) {
      continue;
    }
    writeAnnotation(doc, { ...record, spans: result.spans });
    updated += 1;
  }
  return updated;
}

// ============================================================================
// Repository Implementation
// ============================================================================

export type AnnotationRepoOptions = {
  originTag?: string;
  migrateAnchors?: boolean;
};

/**
 * Create an annotation repository for a Loro runtime
 */
export function createAnnotationRepo(
  runtime: MinimalLoroRuntime,
  options: AnnotationRepoOptions = {}
) {
  const { originTag = "lfcc:annotations" } = options;
  const shouldMigrate = options.migrateAnchors ?? true;

  if (shouldMigrate) {
    const updated = migrateLegacyAnchors(runtime.doc);
    if (updated > 0) {
      runtime.commit(`${originTag}:migrate`);
    }
  }

  /**
   * Create a new annotation
   */
  function create(record: AnnotationRecord): void {
    const chainPolicyForStorage: SpanChainPolicy = {
      kind:
        record.chainPolicy.mode === "bounded_gap"
          ? "bounded_gap"
          : record.chainPolicy.mode === "strict_adjacency"
            ? "strict_adjacency"
            : "required_order",
      maxInterveningBlocks: record.chainPolicy.gap ?? 0,
    };

    createAnnotationRecord(runtime.doc, {
      id: record.annotationId,
      spanList: record.spanList,
      chain: {
        policy: chainPolicyForStorage,
        order: record.spanList.map((s: SpanList[number]) => s.blockId),
      },
      content: record.content ?? "",
      color: record.color,
      storedState: mapVerificationToStored(record.verificationState),
      createdAtMs: record.createdAtMs,
      updatedAtMs: record.updatedAtMs,
    });

    runtime.commit(originTag);
  }

  /**
   * Update an existing annotation
   */
  function update(annotationId: string, patch: AnnotationPatch): void {
    if (!patch || Object.keys(patch).length === 0) {
      return;
    }

    const stored = readAnnotation(runtime.doc, annotationId);
    if (!stored) {
      return;
    }

    let updated = false;
    const next: StoredAnnotationRecord = { ...stored };

    if (patch.verificationState) {
      next.storedState = mapVerificationToStored(patch.verificationState);
      updated = true;
    }

    if (patch.content !== undefined && patch.content !== stored.content) {
      next.content = patch.content;
      updated = true;
    }

    if (patch.color !== undefined && patch.color !== stored.color) {
      next.color = patch.color;
      updated = true;
    }

    if (!updated) {
      return;
    }

    next.updatedAtMs = Date.now();
    writeAnnotation(runtime.doc, next);
    runtime.commit(originTag);
  }

  /**
   * Soft delete an annotation (sets state to deleted)
   */
  function remove(annotationId: string): void {
    softDeleteAnnotation(runtime.doc, annotationId);
    runtime.commit(originTag);
  }

  /**
   * Hard delete an annotation from CRDT
   */
  function hardDelete(annotationId: string): void {
    hardRemoveAnnotation(runtime.doc, annotationId);
    runtime.commit(originTag);
  }

  /**
   * List all active annotations
   */
  function list(): AnnotationRecord[] {
    const stored = readAllAnnotations(runtime.doc);
    return stored.map(mapStoredToRecord).sort((a: AnnotationRecord, b: AnnotationRecord) => {
      // D-01 FIX: Deterministic sort
      const timeDiff = a.createdAtMs - b.createdAtMs;
      if (timeDiff !== 0) {
        return timeDiff;
      }
      // Tie-breaker: ID stability
      return a.annotationId.localeCompare(b.annotationId);
    });
  }

  /**
   * Get a single annotation by ID
   */
  function get(annotationId: string): AnnotationRecord | null {
    const stored = readAnnotation(runtime.doc, annotationId);
    if (!stored) {
      return null;
    }
    return mapStoredToRecord(stored);
  }

  /**
   * Subscribe to annotation changes
   */
  function subscribe(callback: AnnotationSubscriber): () => void {
    return subscribeToAnnotations(runtime.doc, callback);
  }

  return {
    create,
    update,
    delete: remove,
    hardDelete,
    list,
    get,
    subscribe,
  };
}

export type AnnotationRepo = ReturnType<typeof createAnnotationRepo>;

// ============================================================================
// Mapping Helpers
// ============================================================================

function mapVerificationToStored(state: VerificationState): StoredAnnoState {
  switch (state) {
    case "active":
      return "active";
    case "active_partial":
      return "active_partial";
    case "orphan":
    case "broken_grace":
      return "orphan";
    // active_unverified and other cases map to active in storage
    default:
      return "active";
  }
}

function mapStoredToVerification(state: StoredAnnoState): VerificationState {
  switch (state) {
    case "active":
      return "active";
    case "active_partial":
      return "active_partial";
    case "orphan":
      return "orphan";
    case "hidden":
    case "deleted":
      return "orphan";
    default:
      return "active_unverified";
  }
}

function mapStoredToRecord(stored: StoredAnnotationRecord): AnnotationRecord {
  return {
    annotationId: stored.id,
    kind: "highlight",
    createdAtMs: stored.createdAtMs,
    updatedAtMs: stored.updatedAtMs,
    spanList: storedToSpanList(stored.spans),
    chainPolicy: {
      mode:
        stored.chain.policy.kind === "bounded_gap"
          ? "bounded_gap"
          : stored.chain.policy.kind === "strict_adjacency"
            ? "strict_adjacency"
            : "required_order",
      gap: stored.chain.policy.maxInterveningBlocks,
    },
    verificationState: mapStoredToVerification(stored.storedState),
    content: stored.content,
    color: stored.color,
  };
}
