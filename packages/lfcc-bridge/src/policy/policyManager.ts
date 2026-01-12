import type { Annotation, ChainPolicy, ChainPolicyEntry, StoredAnnoState } from "@keepup/core";

// Define the Runtime/Bridge extended annotation type
export interface BridgeAnnotation extends Annotation {
  status: {
    state: StoredAnnoState;
  };
  chain?: {
    policy: ChainPolicyEntry;
    order: string[]; // Block IDs in chain order
  };
  spans?: Array<{ blockId: string; start: number; end: number }>;
  // Temporary debug field until properly typed (fallback for testing)
  _debug_gaps?: number;
}

export interface MigrationPlanItem {
  annotationId: string;
  oldState: StoredAnnoState;
  newState: "active_partial" | "orphan";
  reason: string;
}

export interface DegradationResult {
  affectedAnnotations: string[];
  migrationPlan: MigrationPlanItem[];
}

// ----------------------------------------------------------------------
// Degradation Logic
// ----------------------------------------------------------------------

/**
 * Handles degradation from bounded_gap -> strict_adjacency.
 * Any annotation with gaps > 0 must become partial or orphan.
 *
 * @param annotations - Annotations to check
 * @param _effectivePolicy - Effective chain policy
 * @param documentBlockOrder - Document block order for gap calculation (optional)
 */
export function degradeBoundedGapToStrict(
  annotations: BridgeAnnotation[],
  _effectivePolicy: ChainPolicy,
  documentBlockOrder?: string[]
): DegradationResult {
  const result: DegradationResult = {
    affectedAnnotations: [],
    migrationPlan: [],
  };

  for (const anno of annotations) {
    // Only check annotations that actually rely on gaps.
    // If an annotation has gaps=0, it satisfies strict_adjacency automatically.
    // P0.3: Use real chain traversal instead of mock data
    const gaps = countInterveningBlocks(anno, documentBlockOrder);

    if (gaps > 0) {
      result.affectedAnnotations.push(anno.id);

      const newState = determinePartialState(anno.kind ?? "highlight");

      result.migrationPlan.push({
        annotationId: anno.id,
        oldState: anno.status.state,
        newState,
        reason: `Gap count (${gaps}) exceeds strict_adjacency limit (0)`,
      });
    }
  }

  return result;
}

/**
 * Handles degradation from required_order -> strict_adjacency.
 * Any annotation with gaps > 0 must become partial or orphan.
 */
export function degradeRequiredOrderToStrict(
  annotations: BridgeAnnotation[],
  effectivePolicy: ChainPolicy
): DegradationResult {
  // Logic is effectively same as bounded_gap -> strict.
  // We check for adjacency.
  return degradeBoundedGapToStrict(annotations, effectivePolicy);
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

/**
 * Count intervening blocks between chain blocks in document order.
 * P0.3: Implement real chain traversal (replaces mock _debug_gaps)
 *
 * @param anno - Annotation with chain order
 * @param documentBlockOrder - Full document block order (block IDs in document order)
 * @returns Number of intervening content blocks between chain blocks
 */
export function countInterveningBlocks(
  anno: BridgeAnnotation,
  documentBlockOrder: string[] = []
): number {
  // Fallback to mock data if chain order not available (for backward compatibility)
  if (!anno.chain?.order || anno.chain.order.length < 2) {
    return anno._debug_gaps ?? 0;
  }

  // If no document order provided, cannot compute gaps accurately
  if (documentBlockOrder.length === 0) {
    // Fallback: assume gaps exist if chain has multiple blocks
    return anno.chain.order.length > 1 ? (anno._debug_gaps ?? 1) : 0;
  }

  // Build index map for O(1) lookups
  const docIndexMap = new Map<string, number>();
  for (let i = 0; i < documentBlockOrder.length; i++) {
    docIndexMap.set(documentBlockOrder[i], i);
  }

  // Count gaps between consecutive chain blocks
  let totalGaps = 0;
  const chainOrder = anno.chain.order;

  for (let i = 0; i < chainOrder.length - 1; i++) {
    const currentBlockId = chainOrder[i];
    const nextBlockId = chainOrder[i + 1];

    const currentIndex = docIndexMap.get(currentBlockId);
    const nextIndex = docIndexMap.get(nextBlockId);

    // If either block not found in document, cannot compute gap
    if (currentIndex === undefined || nextIndex === undefined) {
      continue;
    }

    // Count intervening blocks (blocks between current and next, exclusive)
    const gapCount = Math.max(0, nextIndex - currentIndex - 1);
    totalGaps += gapCount;
  }

  return totalGaps;
}

function determinePartialState(kind: string): "active_partial" | "orphan" {
  // Logic: Some kinds allow partial rendering (e.g. Highlights).
  // Others (e.g. Comments) might require full context.
  // For v0.9, we hardcode: 'highlight' -> active_partial, others -> orphan.
  if (kind === "highlight" || kind === "underline") {
    return "active_partial";
  }
  return "orphan";
}

/**
 * Computes a migration plan given current and effective manifests.
 * P1: Fix type safety - replace any types
 *
 * @param currentManifest - Current policy manifest
 * @param effectiveManifest - Effective policy manifest after negotiation
 * @param existingAnnotations - Existing annotations to migrate
 * @param documentBlockOrder - Document block order for gap calculation (optional)
 */
export function computeMigrationPlan(
  _currentManifest: { chain_policy?: ChainPolicy },
  effectiveManifest: { chain_policy: ChainPolicy },
  existingAnnotations: BridgeAnnotation[],
  documentBlockOrder?: string[]
): DegradationResult {
  const targetPolicy = effectiveManifest.chain_policy;

  // We only handle 'strict_adjacency' as a degradation target in this version
  // Accessing default policy for 'highlight' as a proxy for the overall desired strictness
  // In a real impl, we'd check per-kind defaults.
  const highlightPolicy = targetPolicy.defaults?.highlight;

  if (highlightPolicy?.kind === "strict_adjacency") {
    return degradeBoundedGapToStrict(existingAnnotations, targetPolicy, documentBlockOrder);
  }

  // Other degradations (e.g. reduced bounds) not implemented in P1 scope.
  return { affectedAnnotations: [], migrationPlan: [] };
}
