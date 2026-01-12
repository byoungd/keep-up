/**
 * LFCC v0.9 RC - Debug Overlay Hooks
 * @see docs/product/Audit/enhance/stage3/agent_2_observability.md
 *
 * Provides data hooks for the debug overlay UI.
 * These hooks expose internal state for visualization and debugging.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Block mapping visualization data
 */
export interface BlockMappingDebugData {
  /** Timestamp when mapping was generated */
  timestamp: number;
  /** Transforms applied */
  transforms: BlockTransformDebug[];
  /** Mapping entries (old -> new) */
  mappings: MappingEntryDebug[];
  /** Statistics */
  stats: {
    total_transforms: number;
    unchanged: number;
    modified: number;
    split: number;
    merged: number;
    deleted: number;
  };
}

export interface BlockTransformDebug {
  kind: "unchanged" | "modified" | "split" | "merged" | "deleted";
  oldIds: string[];
  newIds: string[];
  details?: string;
}

export interface MappingEntryDebug {
  oldBlockId: string;
  oldPos: number;
  newBlockId: string | null;
  newPos: number | null;
  delta: number;
}

/**
 * Dirty region visualization data
 */
export interface DirtyRegionDebugData {
  /** Timestamp when dirty info was computed */
  timestamp: number;
  /** Touched blocks */
  touchedBlocks: TouchedBlockDebug[];
  /** Expanded blocks (from neighbor expansion) */
  expandedBlocks: string[];
  /** Operation codes that triggered dirty */
  opCodes: string[];
  /** Statistics */
  stats: {
    touched_count: number;
    expanded_count: number;
    total_coverage: number;
  };
}

export interface TouchedBlockDebug {
  blockId: string;
  range: { start: number; end: number };
  reason: string;
}

// ============================================================================
// Debug State Store
// ============================================================================

interface DebugState {
  blockMapping: BlockMappingDebugData | null;
  dirtyRegion: DirtyRegionDebugData | null;
  enabled: boolean;
  listeners: Set<() => void>;
}

const debugState: DebugState = {
  blockMapping: null,
  dirtyRegion: null,
  enabled: false,
  listeners: new Set(),
};

// ============================================================================
// State Management
// ============================================================================

/**
 * Enable or disable debug data collection.
 * When disabled, no data is collected to avoid performance overhead.
 */
export function setDebugEnabled(enabled: boolean): void {
  debugState.enabled = enabled;
  if (!enabled) {
    debugState.blockMapping = null;
    debugState.dirtyRegion = null;
  }
  notifyListeners();
}

/**
 * Check if debug mode is enabled.
 */
export function isDebugEnabled(): boolean {
  return debugState.enabled;
}

/**
 * Subscribe to debug state changes.
 */
export function subscribeDebugState(listener: () => void): () => void {
  debugState.listeners.add(listener);
  return () => {
    debugState.listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const listener of debugState.listeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

// ============================================================================
// Data Hooks
// ============================================================================

/**
 * Get the last generated BlockMapping visualization data.
 * Returns null if debug mode is disabled or no data is available.
 */
export function useBlockMappingDebug(): BlockMappingDebugData | null {
  return debugState.blockMapping;
}

/**
 * Get the current dirty region visualization data.
 * Returns null if debug mode is disabled or no data is available.
 */
export function useDirtyRegionDebug(): DirtyRegionDebugData | null {
  return debugState.dirtyRegion;
}

// ============================================================================
// Data Recording (called by bridge internals)
// ============================================================================

/**
 * Record BlockMapping data for debug visualization.
 * Called internally by the bridge after generating a mapping.
 */
export function recordBlockMappingDebug(data: Omit<BlockMappingDebugData, "timestamp">): void {
  if (!debugState.enabled) {
    return;
  }

  debugState.blockMapping = {
    ...data,
    timestamp: Date.now(),
  };
  notifyListeners();
}

/**
 * Record DirtyRegion data for debug visualization.
 * Called internally by the bridge after computing dirty info.
 */
export function recordDirtyRegionDebug(data: Omit<DirtyRegionDebugData, "timestamp">): void {
  if (!debugState.enabled) {
    return;
  }

  debugState.dirtyRegion = {
    ...data,
    timestamp: Date.now(),
  };
  notifyListeners();
}

// ============================================================================
// Snapshot Export
// ============================================================================

/**
 * Export current debug state as JSON for logging/sharing.
 */
export function exportDebugSnapshot(): string {
  return JSON.stringify(
    {
      enabled: debugState.enabled,
      blockMapping: debugState.blockMapping,
      dirtyRegion: debugState.dirtyRegion,
      exportedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Clear all debug data.
 */
export function clearDebugData(): void {
  debugState.blockMapping = null;
  debugState.dirtyRegion = null;
  notifyListeners();
}

// ============================================================================
// React Hook Helpers (for UI integration)
// ============================================================================

/**
 * Create a React-style hook for debug state.
 * Use this with useSyncExternalStore in React 18+.
 */
export function createDebugStateHook<T>(selector: (state: DebugState) => T): {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
} {
  return {
    subscribe: subscribeDebugState,
    getSnapshot: () => selector(debugState),
  };
}

/**
 * Pre-built hooks for common use cases.
 */
export const debugHooks = {
  blockMapping: createDebugStateHook((state) => state.blockMapping),
  dirtyRegion: createDebugStateHook((state) => state.dirtyRegion),
  enabled: createDebugStateHook((state) => state.enabled),
};
