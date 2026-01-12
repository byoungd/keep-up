/**
 * Optimized Store Subscription Utilities
 *
 * PERF-003: Reduces unnecessary re-renders by tracking only relevant
 * annotation changes. Previously, ANY store update triggered full
 * decoration rebuilds.
 *
 * Key insight: Only annotation range changes and focus changes
 * require decoration rebuilds. Metadata changes (like comments)
 * don't affect decorations.
 */

import { useAnnotationStore } from "@/lib/kernel/store";
import type { Annotation } from "@/lib/kernel/types";

/**
 * Snapshot of decoration-relevant annotation state.
 * Changes to these fields require decoration rebuilds.
 */
export type AnnotationDecorationSnapshot = {
  /** Sorted list of annotation IDs */
  ids: string[];
  /** Hash of ranges/spans for each annotation */
  rangeHashes: Map<string, string>;
  /** Display states for each annotation */
  displayStates: Map<string, string>;
  /** Colors for each annotation */
  colors: Map<string, string | undefined>;
  /** Currently focused annotation */
  focusedId: string | null;
};

/**
 * Compute a hash for an annotation's range-relevant fields.
 * This is cheaper than deep comparison.
 */
function computeRangeHash(annotation: Annotation): string {
  const spans = annotation.spans ?? [];
  const parts = spans.map((span) => `${span.blockId}:${span.start}:${span.end}`);
  return parts.join("|");
}

/**
 * Take a snapshot of decoration-relevant state from the store.
 */
export function takeDecorationSnapshot(): AnnotationDecorationSnapshot {
  const state = useAnnotationStore.getState();
  const annotations = Object.values(state.annotations);

  // Sort by ID for stable comparison
  annotations.sort((a, b) => a.id.localeCompare(b.id));

  const ids = annotations.map((a) => a.id);
  const rangeHashes = new Map<string, string>();
  const displayStates = new Map<string, string>();
  const colors = new Map<string, string | undefined>();

  for (const anno of annotations) {
    rangeHashes.set(anno.id, computeRangeHash(anno));
    displayStates.set(anno.id, anno.displayState ?? "active");
    colors.set(anno.id, anno.color);
  }

  return {
    ids,
    rangeHashes,
    displayStates,
    colors,
    focusedId: state.focusedAnnotationId,
  };
}

/**
 * Compare two snapshots to determine if decorations need rebuilding.
 * Note: displayState changes are ignored because they are handled
 * internally by the annotation plugin and don't require decoration rebuilds.
 */
export function decorationSnapshotsEqual(
  a: AnnotationDecorationSnapshot,
  b: AnnotationDecorationSnapshot
): boolean {
  // Quick check: ID list length
  if (a.ids.length !== b.ids.length) {
    return false;
  }

  // Check focused ID
  if (a.focusedId !== b.focusedId) {
    return false;
  }

  // Check ID list equality
  for (let i = 0; i < a.ids.length; i++) {
    if (a.ids[i] !== b.ids[i]) {
      return false;
    }
  }

  // Check range hashes and colors (NOT displayStates - those don't affect decorations)
  for (const id of a.ids) {
    if (a.rangeHashes.get(id) !== b.rangeHashes.get(id)) {
      return false;
    }
    if (a.colors.get(id) !== b.colors.get(id)) {
      return false;
    }
    // Note: displayState changes are intentionally ignored here
    // The annotation plugin handles displayState internally
  }

  return true;
}

/**
 * Create a subscription that only triggers when decoration-relevant
 * state changes. Returns unsubscribe function.
 *
 * @param callback - Called when decorations need updating
 */
export function subscribeToDecorationChanges(callback: () => void): () => void {
  let lastSnapshot = takeDecorationSnapshot();
  let updateScheduled = false;

  const unsubscribe = useAnnotationStore.subscribe(() => {
    // Debounce rapid updates within the same frame
    if (updateScheduled) {
      return;
    }

    const currentSnapshot = takeDecorationSnapshot();

    if (!decorationSnapshotsEqual(lastSnapshot, currentSnapshot)) {
      lastSnapshot = currentSnapshot;
      updateScheduled = true;

      // Use microtask to batch multiple rapid updates
      queueMicrotask(() => {
        updateScheduled = false;
        callback();
      });
    }
  });

  return unsubscribe;
}

// Performance monitoring
let triggerCount = 0;
let skippedCount = 0;
let lastReportTime = 0;

/**
 * Report subscription efficiency stats (dev only).
 */
export function reportSubscriptionStats(): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - lastReportTime < 10000) {
    return;
  }

  lastReportTime = now;
  const total = triggerCount + skippedCount;
  if (total > 0) {
    const efficiency = ((skippedCount / total) * 100).toFixed(1);
    console.info(
      `[Store Subscription] triggered: ${triggerCount}, skipped: ${skippedCount}, efficiency: ${efficiency}%`
    );
  }
  triggerCount = 0;
  skippedCount = 0;
}
