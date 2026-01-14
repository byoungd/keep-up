/**
 * LFCC v0.9 RC - Annotation Panel State Management
 *
 * Pure state management for the annotation panel.
 * Framework-agnostic - can be used with React, Vue, or vanilla JS.
 */

import type {
  AnnotationFilterOptions,
  AnnotationListItem,
  AnnotationPanelState,
  AnnotationSortOption,
  AnnotationStatus,
  SortDirection,
} from "./types";

/** Initial panel state */
export const INITIAL_PANEL_STATE: AnnotationPanelState = {
  isOpen: false,
  selectedAnnotationId: null,
  filter: { status: "all", kind: "all" },
  sort: "recency",
  sortDirection: "desc",
  isLoading: false,
  error: null,
};

// ============================================================================
// State Reducers
// ============================================================================

/** Open panel */
export function openPanel(state: AnnotationPanelState): AnnotationPanelState {
  return { ...state, isOpen: true };
}

/** Close panel */
export function closePanel(state: AnnotationPanelState): AnnotationPanelState {
  return { ...state, isOpen: false };
}

/** Toggle panel */
export function togglePanel(state: AnnotationPanelState): AnnotationPanelState {
  return { ...state, isOpen: !state.isOpen };
}

/** Select annotation */
export function selectAnnotation(
  state: AnnotationPanelState,
  annotationId: string | null
): AnnotationPanelState {
  return { ...state, selectedAnnotationId: annotationId };
}

/** Set filter */
export function setFilter(
  state: AnnotationPanelState,
  filter: Partial<AnnotationFilterOptions>
): AnnotationPanelState {
  return {
    ...state,
    filter: { ...state.filter, ...filter },
  };
}

/** Set sort */
export function setSort(
  state: AnnotationPanelState,
  sort: AnnotationSortOption,
  direction?: SortDirection
): AnnotationPanelState {
  return {
    ...state,
    sort,
    sortDirection: direction ?? state.sortDirection,
  };
}

/** Toggle sort direction */
export function toggleSortDirection(state: AnnotationPanelState): AnnotationPanelState {
  return {
    ...state,
    sortDirection: state.sortDirection === "asc" ? "desc" : "asc",
  };
}

/** Set loading state */
export function setLoading(state: AnnotationPanelState, isLoading: boolean): AnnotationPanelState {
  return { ...state, isLoading, error: isLoading ? null : state.error };
}

/** Set error */
export function setError(state: AnnotationPanelState, error: string | null): AnnotationPanelState {
  return { ...state, error, isLoading: false };
}

/** Clear error */
export function clearError(state: AnnotationPanelState): AnnotationPanelState {
  return { ...state, error: null };
}

// ============================================================================
// Filtering & Sorting
// ============================================================================

/** Status priority for sorting */
const STATUS_PRIORITY: Record<AnnotationStatus, number> = {
  orphan: 0,
  broken_grace: 1,
  active_partial: 2,
  active_unverified: 3,
  active: 4,
};

/**
 * Filter annotations based on filter options
 */
export function filterAnnotations(
  annotations: AnnotationListItem[],
  filter: AnnotationFilterOptions
): AnnotationListItem[] {
  return annotations.filter((item) => {
    // Status filter
    if (filter.status && filter.status !== "all" && item.status !== filter.status) {
      return false;
    }

    // Kind filter
    if (filter.kind && filter.kind !== "all" && item.kind !== filter.kind) {
      return false;
    }

    // Author filter
    if (filter.author_id && item.author?.id !== filter.author_id) {
      return false;
    }

    // Unresolved only
    if (filter.unresolved_only && item.is_resolved) {
      return false;
    }

    return true;
  });
}

/**
 * Filter annotations by a list of statuses
 */
export function filterAnnotationsByStatuses(
  annotations: AnnotationListItem[],
  statuses: AnnotationStatus[]
): AnnotationListItem[] {
  if (statuses.length === 0) {
    return [];
  }

  const statusSet = new Set(statuses);
  return annotations.filter((item) => statusSet.has(item.status));
}

/**
 * Sort annotations based on sort option
 */
export function sortAnnotations(
  annotations: AnnotationListItem[],
  sort: AnnotationSortOption,
  direction: SortDirection
): AnnotationListItem[] {
  const sorted = [...annotations].sort((a, b) => {
    let comparison = 0;

    switch (sort) {
      case "recency":
        comparison = a.updated_at_ms - b.updated_at_ms;
        break;

      case "status":
        comparison = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
        break;

      case "author":
        comparison = (a.author?.name ?? "").localeCompare(b.author?.name ?? "");
        break;

      case "kind":
        comparison = a.kind.localeCompare(b.kind);
        break;
    }

    return direction === "asc" ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Filter and sort annotations
 */
export function processAnnotations(
  annotations: AnnotationListItem[],
  state: AnnotationPanelState
): AnnotationListItem[] {
  const filtered = filterAnnotations(annotations, state.filter);
  return sortAnnotations(filtered, state.sort, state.sortDirection);
}

// ============================================================================
// Grouping
// ============================================================================

/** Grouped annotations by thread */
export type GroupedAnnotations = {
  threadId: string | null;
  annotations: AnnotationListItem[];
  latestUpdate: number;
};

/**
 * Group annotations by thread
 */
export function groupByThread(annotations: AnnotationListItem[]): GroupedAnnotations[] {
  const groups = new Map<string | null, AnnotationListItem[]>();

  for (const item of annotations) {
    const threadId = item.thread_id ?? null;
    const group = groups.get(threadId) ?? [];
    group.push(item);
    groups.set(threadId, group);
  }

  return Array.from(groups.entries()).map(([threadId, items]) => ({
    threadId,
    annotations: items,
    latestUpdate: Math.max(...items.map((i) => i.updated_at_ms)),
  }));
}

// ============================================================================
// Statistics
// ============================================================================

/** Annotation statistics */
export type AnnotationStats = {
  total: number;
  byStatus: Record<AnnotationStatus, number>;
  byKind: Record<string, number>;
  unresolved: number;
  withGaps: number;
};

/**
 * Calculate annotation statistics
 */
export function calculateStats(annotations: AnnotationListItem[]): AnnotationStats {
  const stats: AnnotationStats = {
    total: annotations.length,
    byStatus: {
      active: 0,
      active_unverified: 0,
      broken_grace: 0,
      active_partial: 0,
      orphan: 0,
    },
    byKind: {},
    unresolved: 0,
    withGaps: 0,
  };

  for (const item of annotations) {
    stats.byStatus[item.status]++;
    stats.byKind[item.kind] = (stats.byKind[item.kind] ?? 0) + 1;
    if (!item.is_resolved) {
      stats.unresolved++;
    }
    if (item.unresolved_gap_count && item.unresolved_gap_count > 0) {
      stats.withGaps++;
    }
  }

  return stats;
}
