/**
 * LFCC Annotation CRDT Schema
 *
 * Persists annotations in Loro for replication across clients.
 * Schema: annotations Map<annotation_id, AnnotationRecord>
 */

import { type LoroDoc, LoroList, LoroMap } from "loro-crdt";
import type { SpanChainPolicy, SpanList } from "../selection/selectionMapping";

// ============================================================================
// Constants
// ============================================================================

export const ROOT_ANNOTATIONS_KEY = "annotations";

// ============================================================================
// Types
// ============================================================================

/** Stored annotation state (replicated) */
export type StoredAnnoState = "active" | "active_partial" | "orphan" | "hidden" | "deleted";

/** Span anchor stored as base64-encoded anchor string */
export type StoredSpanAnchor = {
  anchor: string; // base64-encoded anchor string
  bias: "before" | "after";
};

/** Stored span range with CRDT anchors */
export type StoredSpanRange = {
  blockId: string;
  start: number;
  end: number;
  startAnchor?: StoredSpanAnchor;
  endAnchor?: StoredSpanAnchor;
};

/** Chain policy for span ordering */
export type StoredChainPolicy = {
  kind: "strict_adjacency" | "required_order" | "bounded_gap";
  maxInterveningBlocks: number;
};

/** Stored chain metadata */
export type StoredChain = {
  policy: StoredChainPolicy;
  order: string[];
};

/** Full annotation record stored in CRDT */
export type StoredAnnotationRecord = {
  id: string;
  spans: StoredSpanRange[];
  chain: StoredChain;
  content: string;
  color?: string;
  storedState: StoredAnnoState;
  createdAtMs: number;
  updatedAtMs: number;
};

// ============================================================================
// CRDT Access
// ============================================================================

/** Get the root annotations map */
export function getAnnotationsMap(doc: LoroDoc): LoroMap {
  return doc.getMap(ROOT_ANNOTATIONS_KEY);
}

/** Get or create an annotation record map */
export function getAnnotationMap(doc: LoroDoc, annotationId: string): LoroMap {
  const root = getAnnotationsMap(doc);
  return root.getOrCreateContainer(annotationId, new LoroMap());
}

// ============================================================================
// Write Operations
// ============================================================================

/** Convert SpanList to storable format */
export function spanListToStored(spanList: SpanList): StoredSpanRange[] {
  return spanList.map((span) => {
    const stored: StoredSpanRange = {
      blockId: span.blockId,
      start: span.start,
      end: span.end,
    };
    if (span.startAnchor) {
      stored.startAnchor = {
        anchor: span.startAnchor.anchor,
        bias: span.startAnchor.bias,
      };
    }
    if (span.endAnchor) {
      stored.endAnchor = {
        anchor: span.endAnchor.anchor,
        bias: span.endAnchor.bias,
      };
    }
    return stored;
  });
}

/** Convert stored spans back to SpanList */
export function storedToSpanList(stored: StoredSpanRange[]): SpanList {
  return stored.map((span) => {
    const result: SpanList[number] = {
      blockId: span.blockId,
      start: span.start,
      end: span.end,
    };
    if (span.startAnchor) {
      result.startAnchor = {
        anchor: span.startAnchor.anchor,
        bias: normalizeBias(span.startAnchor.bias),
      };
    }
    if (span.endAnchor) {
      result.endAnchor = {
        anchor: span.endAnchor.anchor,
        bias: normalizeBias(span.endAnchor.bias),
      };
    }
    return result;
  });
}

function normalizeBias(bias: string): "before" | "after" {
  if (bias === "before" || bias === "after") {
    return bias;
  }
  if (bias === "left") {
    return "before";
  }
  return "after";
}

/** Write annotation to Loro */
export function writeAnnotation(doc: LoroDoc, record: StoredAnnotationRecord): void {
  const map = getAnnotationMap(doc, record.id);

  map.set("id", record.id);
  map.set("content", record.content);
  map.set("storedState", record.storedState);
  map.set("createdAtMs", record.createdAtMs);
  map.set("updatedAtMs", record.updatedAtMs);

  if (record.color) {
    map.set("color", record.color);
  }

  // P1 FIX: Store spans using LoroList for better concurrent edit support
  // Each span is stored as JSON string, but list operations (add/remove) are CRDT-safe
  const spansContainer = map.getOrCreateContainer("spans", new LoroList());

  // Clear existing spans and rebuild
  const currentLength = spansContainer.length;
  if (currentLength > 0) {
    spansContainer.delete(0, currentLength);
  }

  // Insert all spans as individual JSON items
  for (const span of record.spans) {
    spansContainer.push(JSON.stringify(span));
  }

  // Store chain (still JSON as it's rarely edited concurrently)
  map.set("chain", JSON.stringify(record.chain));
}

/** Update annotation state */
export function updateAnnotationState(
  doc: LoroDoc,
  annotationId: string,
  state: StoredAnnoState
): void {
  const map = getAnnotationMap(doc, annotationId);
  map.set("storedState", state);
  map.set("updatedAtMs", Date.now());
}

/** Delete annotation (soft delete - sets state to deleted) */
export function deleteAnnotation(doc: LoroDoc, annotationId: string): void {
  updateAnnotationState(doc, annotationId, "deleted");
}

/** Hard delete annotation from CRDT */
export function removeAnnotation(doc: LoroDoc, annotationId: string): void {
  const root = getAnnotationsMap(doc);
  root.delete(annotationId);
}

// ============================================================================
// Read Operations
// ============================================================================

/** Read single annotation from Loro */
export function readAnnotation(doc: LoroDoc, annotationId: string): StoredAnnotationRecord | null {
  const root = getAnnotationsMap(doc);
  const mapValue = root.get(annotationId);

  if (!mapValue || typeof mapValue !== "object") {
    return null;
  }

  const map = root.getOrCreateContainer(annotationId, new LoroMap());
  return parseAnnotationMap(map);
}

/** Read all annotations from Loro */
export function readAllAnnotations(doc: LoroDoc): StoredAnnotationRecord[] {
  const root = getAnnotationsMap(doc);
  const result: StoredAnnotationRecord[] = [];

  for (const [key] of root.entries()) {
    if (typeof key !== "string") {
      continue;
    }

    const map = root.getOrCreateContainer(key, new LoroMap());
    const record = parseAnnotationMap(map);
    if (record && record.storedState !== "deleted") {
      result.push(record);
    }
  }

  // R-02 FIX: Ensure deterministic ordering even if Loro Map iteration is non-deterministic
  // Sort by ID for stable, reproducible results
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/** Check if any annotations exist in Loro (including deleted ones) */
export function hasAnyAnnotations(doc: LoroDoc): boolean {
  const root = getAnnotationsMap(doc);
  for (const [key] of root.entries()) {
    if (typeof key === "string") {
      return true;
    }
  }
  return false;
}

function parseAnnotationMap(map: LoroMap): StoredAnnotationRecord | null {
  const id = map.get("id");
  if (typeof id !== "string") {
    return null;
  }

  const content = map.get("content");
  const storedState = map.get("storedState");
  const createdAtMs = map.get("createdAtMs");
  const updatedAtMs = map.get("updatedAtMs");
  const color = map.get("color");
  const chainJson = map.get("chain");

  let spans: StoredSpanRange[] = [];
  let chain: StoredChain = {
    policy: { kind: "required_order", maxInterveningBlocks: 0 },
    order: [],
  };

  try {
    // P1 FIX: Read spans from LoroList (new format)
    const spansValue = map.get("spans");
    if (spansValue && typeof spansValue === "object" && "toArray" in spansValue) {
      // It's a LoroList
      const spansContainer = map.getOrCreateContainer("spans", new LoroList());
      const spansArray = spansContainer.toArray();
      spans = spansArray
        .filter((item): item is string => typeof item === "string")
        .map((jsonStr) => {
          try {
            return JSON.parse(jsonStr) as StoredSpanRange;
          } catch {
            return null;
          }
        })
        .filter((s): s is StoredSpanRange => s !== null);
    } else if (typeof spansValue === "string") {
      // Backward compatibility: old JSON string format
      spans = JSON.parse(spansValue);
    }

    if (typeof chainJson === "string") {
      chain = JSON.parse(chainJson);
    }
  } catch {
    // Invalid JSON, use defaults
  }

  return {
    id,
    spans,
    chain,
    content: typeof content === "string" ? content : "",
    color: typeof color === "string" ? color : undefined,
    storedState: isValidStoredState(storedState) ? storedState : "active",
    createdAtMs: typeof createdAtMs === "number" ? createdAtMs : Date.now(),
    updatedAtMs: typeof updatedAtMs === "number" ? updatedAtMs : Date.now(),
  };
}

function isValidStoredState(value: unknown): value is StoredAnnoState {
  return (
    value === "active" ||
    value === "active_partial" ||
    value === "orphan" ||
    value === "hidden" ||
    value === "deleted"
  );
}

// ============================================================================
// Subscription
// ============================================================================

export type AnnotationChangeEvent = {
  type: "add" | "update" | "delete";
  annotationId: string;
  record: StoredAnnotationRecord | null;
};

export type AnnotationSubscriber = (events: AnnotationChangeEvent[]) => void;

/**
 * Process a map diff update and extract annotation change events
 */
function processMapDiff(doc: LoroDoc, updated: Record<string, unknown>): AnnotationChangeEvent[] {
  const events: AnnotationChangeEvent[] = [];

  for (const [key, _value] of Object.entries(updated)) {
    if (typeof key !== "string") {
      continue;
    }

    const record = readAnnotation(doc, key);
    if (!record) {
      continue;
    }

    events.push({
      type: record.storedState === "deleted" ? "delete" : "update",
      annotationId: key,
      record,
    });
  }

  return events;
}

/**
 * Process a Loro event and extract annotation change events
 */
function processLoroEvent(
  doc: LoroDoc,
  event: { events?: Array<{ diff: { type: string; updated?: Record<string, unknown> } }> }
): AnnotationChangeEvent[] {
  const events: AnnotationChangeEvent[] = [];

  if (!event.events) {
    return events;
  }

  for (const e of event.events) {
    if (e.diff.type !== "map") {
      continue;
    }
    if (!e.diff.updated) {
      continue;
    }

    const mapEvents = processMapDiff(doc, e.diff.updated);
    events.push(...mapEvents);
  }

  return events;
}

/** Subscribe to annotation changes in Loro */
export function subscribeToAnnotations(doc: LoroDoc, callback: AnnotationSubscriber): () => void {
  const root = getAnnotationsMap(doc);

  return root.subscribe((event) => {
    const events = processLoroEvent(doc, event);
    if (events.length > 0) {
      callback(events);
    }
  });
}

// ============================================================================
// Conversion Utilities
// ============================================================================

export type CreateAnnotationInput = {
  id: string;
  spanList: SpanList;
  chain: { policy: SpanChainPolicy; order: string[] };
  content: string;
  color?: string;
  storedState?: StoredAnnoState;
  createdAtMs?: number;
  updatedAtMs?: number;
};

/** Create and persist a new annotation */
export function createAnnotation(
  doc: LoroDoc,
  input: CreateAnnotationInput
): StoredAnnotationRecord {
  const now = Date.now();
  const record: StoredAnnotationRecord = {
    id: input.id,
    spans: spanListToStored(input.spanList),
    chain: {
      policy: input.chain.policy,
      order: input.chain.order,
    },
    content: input.content,
    color: input.color,
    storedState: input.storedState ?? "active",
    createdAtMs: input.createdAtMs ?? now,
    updatedAtMs: input.updatedAtMs ?? now,
  };

  writeAnnotation(doc, record);
  return record;
}
