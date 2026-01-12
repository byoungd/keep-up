/**
 * LFCC v0.9 RC - Rendering Keys Debug Hook
 * @see docs/product/Audit/phase6/TASK_PROMPT_LFCC_CONFORMANCE_BASELINE.md D6
 *
 * Provides debug access to rendering keys for conformance testing.
 * Keys MUST be derived from LFCC-stable structure (block IDs, node paths),
 * NOT from DOM measurement (wrap, rects, scroll height).
 *
 * Usage:
 * - Test-only: window.__LFCC_DEBUG_KEYS__?.()
 * - Returns ordered keys for the current viewport
 */

/** Single rendering key entry */
export interface RenderingKey {
  /** Stable block ID from LFCC document */
  blockId: string;
  /** Node path within block (for nested structures) */
  nodePath?: string;
  /** Key used by virtualization layer */
  virtualKey: string;
}

/** Full rendering keys state */
export interface RenderingKeysSnapshot {
  /** Ordered list of rendering keys */
  keys: RenderingKey[];
  /** Timestamp for debugging (not used for comparison) */
  timestamp: number;
  /** Whether virtualization is enabled */
  virtualizationEnabled: boolean;
}

/** Global registry for rendering keys (test-only) */
let globalRenderingKeysHook: (() => RenderingKeysSnapshot) | null = null;

/**
 * Register a rendering keys provider.
 * Called by the virtualization layer during initialization.
 */
export function registerRenderingKeysProvider(provider: () => RenderingKeysSnapshot): void {
  globalRenderingKeysHook = provider;

  // Also expose on window for E2E tests (dev/test only)
  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { window?: unknown }).window !== "undefined"
  ) {
    const win = globalThis as unknown as { __LFCC_DEBUG_KEYS__?: () => RenderingKeysSnapshot };
    if (process.env.NODE_ENV !== "production") {
      win.__LFCC_DEBUG_KEYS__ = provider;
    }
  }
}

/**
 * Unregister the rendering keys provider.
 * Called during cleanup.
 */
export function unregisterRenderingKeysProvider(): void {
  globalRenderingKeysHook = null;

  if (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { window?: unknown }).window !== "undefined"
  ) {
    const win = globalThis as unknown as { __LFCC_DEBUG_KEYS__?: unknown };
    win.__LFCC_DEBUG_KEYS__ = undefined;
  }
}

/**
 * Get current rendering keys.
 * Returns null if no provider is registered.
 */
export function getRenderingKeys(): RenderingKeysSnapshot | null {
  if (!globalRenderingKeysHook) {
    return null;
  }
  return globalRenderingKeysHook();
}

/**
 * Compare two rendering keys snapshots for determinism.
 * Returns true if keys are identical (ignoring timestamp).
 */
export function compareRenderingKeys(a: RenderingKeysSnapshot, b: RenderingKeysSnapshot): boolean {
  if (a.keys.length !== b.keys.length) {
    return false;
  }

  for (let i = 0; i < a.keys.length; i++) {
    const keyA = a.keys[i];
    const keyB = b.keys[i];

    if (
      keyA.blockId !== keyB.blockId ||
      keyA.nodePath !== keyB.nodePath ||
      keyA.virtualKey !== keyB.virtualKey
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Create a simple rendering keys provider from block IDs.
 * For use when no advanced virtualization is present.
 */
export function createSimpleRenderingKeysProvider(
  getBlockIds: () => string[],
  virtualizationEnabled = false
): () => RenderingKeysSnapshot {
  return () => {
    const blockIds = getBlockIds();
    const keys: RenderingKey[] = blockIds.map((blockId) => ({
      blockId,
      virtualKey: blockId,
    }));

    return {
      keys,
      timestamp: Date.now(),
      virtualizationEnabled,
    };
  };
}

/**
 * Verify rendering keys determinism by running the same operation twice.
 * Returns true if keys are identical after both runs.
 */
export function verifyRenderingKeysDeterminism(
  applyOperation: () => void,
  resetState: () => void
): { passed: boolean; keysA: RenderingKey[] | null; keysB: RenderingKey[] | null } {
  // First run
  applyOperation();
  const snapshotA = getRenderingKeys();

  // Reset and second run
  resetState();
  applyOperation();
  const snapshotB = getRenderingKeys();

  if (!snapshotA || !snapshotB) {
    return { passed: false, keysA: null, keysB: null };
  }

  const passed = compareRenderingKeys(snapshotA, snapshotB);
  return {
    passed,
    keysA: snapshotA.keys,
    keysB: snapshotB.keys,
  };
}
