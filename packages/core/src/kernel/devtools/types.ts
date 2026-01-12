/**
 * LFCC v0.9 RC - DevTools Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/09_DevTools_Manual.md
 */

import type { DisplayAnnoState, GraceToken, StoredAnnoState } from "../annotations/types";
import type { CompareMismatch } from "../integrity/types";

/** Block inspector data */
export type BlockInspectorData = {
  block_id: string;
  type: string;
  parent_path: string | null;
  start_anchor: string;
  end_anchor: string;
  neighbors: string[];
  text_preview: string;
};

/** Annotation inspector data */
export type AnnotationInspectorData = {
  anno_id: string;
  span_ids: string[];
  target_block_ids: string[];
  stored_state: StoredAnnoState;
  display_state: DisplayAnnoState;
  context_hash: string | null;
  chain_hash: string | null;
  last_verify_time: number | null;
  last_verify_reason: string | null;
};

/** State machine visualizer data */
export type StateMachineVisualizerData = {
  annotations: Array<{
    anno_id: string;
    current_state: DisplayAnnoState;
    grace_token: GraceToken | null;
    grace_expires_at: number | null;
    events_received: string[];
  }>;
  pending_timers_count: number;
  last_checkpoint_result: CheckpointSummary | null;
};

/** Checkpoint summary for visualizer */
export type CheckpointSummary = {
  timestamp: number;
  spans_verified: number;
  spans_failed: number;
  chains_verified: number;
  chains_failed: number;
  duration_ms: number;
};

/** Full scan report */
export type FullScanReport = {
  timestamp: number;
  duration_ms: number;
  blocks_scanned: number;
  annotations_scanned: number;
  mismatches: CompareMismatch[];
  dirty_vs_full_diff: CompareMismatch[];
  summary: {
    total_mismatches: number;
    missed_by_dirty: number;
    hash_mismatches: number;
    chain_violations: number;
  };
};

/** Canonical tree comparison result */
export type CanonCompareResult = {
  equal: boolean;
  first_diff_path: string | null;
  shadow_tree_json: string;
  editor_tree_json: string;
  diff_details: string | null;
};

/** Dev overlay state */
export type DevOverlayState = {
  enabled: boolean;
  panels: {
    block_inspector: boolean;
    annotation_inspector: boolean;
    state_visualizer: boolean;
    canon_compare: boolean;
  };
  selected_block_id: string | null;
  selected_anno_id: string | null;
};

/** Performance metrics */
export type PerformanceMetrics = {
  last_scan_cpu_ms: number;
  avg_scan_cpu_ms: number;
  scans_count: number;
  last_checkpoint_cpu_ms: number;
  avg_checkpoint_cpu_ms: number;
  checkpoints_count: number;
};
