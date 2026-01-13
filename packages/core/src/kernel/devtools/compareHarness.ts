/**
 * LFCC v0.9 RC - Dev Compare Harness
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md Section 5
 */

import { stableStringifyCanon } from "../canonicalizer/canonicalize.js";
import type { CanonNode } from "../canonicalizer/types.js";
import type { CompareMismatch, DevComparePolicy } from "../integrity/types.js";
import type { CanonCompareResult, FullScanReport, PerformanceMetrics } from "./types.js";

/** Sampling state for adaptive-with-coverage */
export type SamplingState = {
  seed: number;
  coverage_map: Map<string, number>; // block_id -> times sampled
  total_samples: number;
  structural_ops_since_full: number;
  last_full_scan_ms: number;
};

/**
 * Create initial sampling state with deterministic seed
 */
export function createSamplingState(seed?: number): SamplingState {
  return {
    seed: seed ?? Date.now(),
    coverage_map: new Map(),
    total_samples: 0,
    structural_ops_since_full: 0,
    last_full_scan_ms: 0,
  };
}

/**
 * Deterministic pseudo-random number generator (LCG)
 */
function nextRandom(state: SamplingState): { value: number; state: SamplingState } {
  // Linear Congruential Generator parameters
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;

  const newSeed = (a * state.seed + c) % m;
  return {
    value: newSeed / m,
    state: { ...state, seed: newSeed },
  };
}

/**
 * Select blocks for sampling based on coverage
 */
export function selectSampleBlocks(
  allBlockIds: string[],
  state: SamplingState,
  policy: DevComparePolicy
): { blockIds: string[]; state: SamplingState } {
  if (allBlockIds.length <= policy.dev_fullscan_max_blocks) {
    // Small document - sample all
    return { blockIds: allBlockIds, state };
  }

  const targetCount = Math.ceil(allBlockIds.length * policy.dev_sample_rate_large_docs);
  const selected: string[] = [];
  let currentState = state;

  // Prioritize blocks with lowest coverage
  const sortedByLowCoverage = [...allBlockIds].sort((a, b) => {
    const covA = state.coverage_map.get(a) ?? 0;
    const covB = state.coverage_map.get(b) ?? 0;
    return covA - covB;
  });

  // Take half from low-coverage, half random
  const lowCoverageCount = Math.floor(targetCount / 2);
  selected.push(...sortedByLowCoverage.slice(0, lowCoverageCount));

  // Random selection for the rest
  const remaining = allBlockIds.filter((id) => !selected.includes(id));
  while (selected.length < targetCount && remaining.length > 0) {
    const { value, state: newState } = nextRandom(currentState);
    currentState = newState;

    const idx = Math.floor(value * remaining.length);
    selected.push(remaining.splice(idx, 1)[0]);
  }

  // Update coverage map
  const newCoverageMap = new Map(currentState.coverage_map);
  for (const id of selected) {
    newCoverageMap.set(id, (newCoverageMap.get(id) ?? 0) + 1);
  }

  return {
    blockIds: selected,
    state: {
      ...currentState,
      coverage_map: newCoverageMap,
      total_samples: currentState.total_samples + 1,
    },
  };
}

/**
 * Record a structural operation
 */
export function recordStructuralOp(state: SamplingState): SamplingState {
  return {
    ...state,
    structural_ops_since_full: state.structural_ops_since_full + 1,
  };
}

/**
 * Reset state after full scan
 */
export function resetAfterFullScan(state: SamplingState): SamplingState {
  return {
    ...state,
    structural_ops_since_full: 0,
    last_full_scan_ms: Date.now(),
  };
}

/**
 * Compare dirty scan results with full scan results
 */
export function compareDirtyVsFull(
  dirtyMismatches: CompareMismatch[],
  fullMismatches: CompareMismatch[]
): CompareMismatch[] {
  const dirtySet = new Set(dirtyMismatches.map((m) => `${m.anno_id}:${m.span_id ?? ""}:${m.kind}`));

  return fullMismatches.filter((m) => !dirtySet.has(`${m.anno_id}:${m.span_id ?? ""}:${m.kind}`));
}

/**
 * Generate a full scan report
 */
export function generateFullScanReport(
  startTime: number,
  blocksScanned: number,
  annotationsScanned: number,
  dirtyMismatches: CompareMismatch[],
  fullMismatches: CompareMismatch[]
): FullScanReport {
  const missedByDirty = compareDirtyVsFull(dirtyMismatches, fullMismatches);

  return {
    timestamp: Date.now(),
    duration_ms: Date.now() - startTime,
    blocks_scanned: blocksScanned,
    annotations_scanned: annotationsScanned,
    mismatches: fullMismatches,
    dirty_vs_full_diff: missedByDirty,
    summary: {
      total_mismatches: fullMismatches.length,
      missed_by_dirty: missedByDirty.length,
      hash_mismatches: fullMismatches.filter((m) => m.kind === "hash_mismatch").length,
      chain_violations: fullMismatches.filter((m) => m.kind === "chain_violation").length,
    },
  };
}

/**
 * Compare two canonical trees
 */
export function compareCanonTrees(
  shadowTree: CanonNode,
  editorTree: CanonNode
): CanonCompareResult {
  const shadowJson = stableStringifyCanon(shadowTree);
  const editorJson = stableStringifyCanon(editorTree);

  if (shadowJson === editorJson) {
    return {
      equal: true,
      first_diff_path: null,
      shadow_tree_json: shadowJson,
      editor_tree_json: editorJson,
      diff_details: null,
    };
  }

  // Find first difference
  const diffPath = findFirstDiffPath(shadowTree, editorTree, "root");

  return {
    equal: false,
    first_diff_path: diffPath,
    shadow_tree_json: shadowJson,
    editor_tree_json: editorJson,
    diff_details: `Trees differ at path: ${diffPath}`,
  };
}

/**
 * Find the path to the first difference between two trees
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: search logic
function findFirstDiffPath(a: CanonNode, b: CanonNode, path: string): string {
  // Check if both are text nodes
  if ("is_leaf" in a && "is_leaf" in b) {
    if (a.text !== b.text) {
      return `${path}/text`;
    }
    if (JSON.stringify(a.marks) !== JSON.stringify(b.marks)) {
      return `${path}/marks`;
    }
    return path;
  }

  // Check if both are block nodes
  if ("type" in a && "type" in b) {
    if (a.type !== b.type) {
      return `${path}/type`;
    }
    if (a.children.length !== b.children.length) {
      return `${path}/children.length`;
    }

    for (let i = 0; i < a.children.length; i++) {
      const childPath = findFirstDiffPath(a.children[i], b.children[i], `${path}/${i}`);
      if (childPath !== `${path}/${i}`) {
        return childPath;
      }
    }
    return path;
  }

  // Type mismatch
  return `${path}/node_type`;
}

/**
 * Performance metrics tracker
 */
export class PerformanceTracker {
  private metrics: PerformanceMetrics = {
    last_scan_cpu_ms: 0,
    avg_scan_cpu_ms: 0,
    scans_count: 0,
    last_checkpoint_cpu_ms: 0,
    avg_checkpoint_cpu_ms: 0,
    checkpoints_count: 0,
  };

  recordScan(durationMs: number): void {
    this.metrics.last_scan_cpu_ms = durationMs;
    this.metrics.scans_count++;
    this.metrics.avg_scan_cpu_ms =
      (this.metrics.avg_scan_cpu_ms * (this.metrics.scans_count - 1) + durationMs) /
      this.metrics.scans_count;
  }

  recordCheckpoint(durationMs: number): void {
    this.metrics.last_checkpoint_cpu_ms = durationMs;
    this.metrics.checkpoints_count++;
    this.metrics.avg_checkpoint_cpu_ms =
      (this.metrics.avg_checkpoint_cpu_ms * (this.metrics.checkpoints_count - 1) + durationMs) /
      this.metrics.checkpoints_count;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      last_scan_cpu_ms: 0,
      avg_scan_cpu_ms: 0,
      scans_count: 0,
      last_checkpoint_cpu_ms: 0,
      avg_checkpoint_cpu_ms: 0,
      checkpoints_count: 0,
    };
  }
}
