/**
 * LFCC v0.9 RC - Conformance Testing Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md
 */

import type { CanonNode } from "../canonicalizer/types.js";
import type { ShadowDocument, TypedOp } from "../shadow/types.js";

/** Operation types for fuzzing */
export type FuzzOpType =
  | "text_burst"
  | "mark_toggle"
  | "block_split"
  | "block_join"
  | "list_reparent"
  | "table_struct"
  | "reorder"
  | "paste"
  | "undo"
  | "redo";

/** Fuzz operation configuration */
export type FuzzOpConfig = {
  type: FuzzOpType;
  weight: number; // Probability weight
  params?: Record<string, unknown>;
};

/** Fuzz test configuration */
export type FuzzConfig = {
  seed: number;
  iterations: number;
  ops_per_iteration: number;
  op_weights: FuzzOpConfig[];
  replicas: number;
  network_delay_range: [number, number]; // [min, max] ms
  reorder_probability: number; // 0-1
  drop_probability: number; // 0-1
  duplicate_probability: number; // 0-1
  partition_schedule: NetworkPartitionEvent[];
  link_drop_overrides?: NetworkLinkDropOverride[];
  delay_bursts?: NetworkDelayBurst[];
  scenario?: NetworkScenarioName;
  max_drain_ticks: number; // Max ticks to drain network after ops
  max_op_history: number; // Last N ops stored for repro
  max_message_log: number; // Last N network log entries stored
};

/** Replica state for multi-replica testing */
export type ReplicaState = {
  id: string;
  document: ShadowDocument;
  pending_ops: TypedOp[];
  applied_ops: TypedOp[];
  canonical_snapshot: CanonNode | null;
  seen_op_ids: Set<string>;
};

/** Network simulator message */
export type NetworkMessage = {
  id: string;
  from_replica: string;
  to_replica: string;
  op_id: string;
  op: TypedOp;
  send_time: number;
  deliver_time: number;
};

export type NetworkScenarioName =
  | "baseline"
  | "high-delay-reorder"
  | "partition-heal"
  | "drop-duplicate"
  | "long-partition"
  | "asymmetric-drop"
  | "burst-delay-reorder"
  | "custom";

export type NetworkPartitionEvent = {
  at_tick: number;
  action: "partition" | "heal";
  groups?: string[][];
};

export type NetworkLinkDropOverride = {
  from: string;
  to: string;
  drop_probability: number;
};

export type NetworkDelayBurst = {
  start_tick: number;
  end_tick: number;
  delay_range: [number, number];
};

export type NetworkScenario = {
  name: NetworkScenarioName;
  description: string;
  delay_range: [number, number];
  reorder_probability: number;
  drop_probability: number;
  duplicate_probability: number;
  partition_schedule: NetworkPartitionEvent[];
  drop_mode?: "loss" | "retry";
  link_drop_overrides?: NetworkLinkDropOverride[];
  delay_bursts?: NetworkDelayBurst[];
};

export type NetworkStats = {
  queued: number;
  delivered: number;
  dropped: number;
  duplicated: number;
  delayed: number;
  partition_blocked: number;
};

export type NetworkLogEntry = {
  id: string;
  from_replica: string;
  to_replica: string;
  send_time: number;
  deliver_time: number | null;
  event: "queued" | "dropped" | "delivered" | "duplicated" | "blocked";
};

export type NetworkLogSummary = {
  stats: NetworkStats;
  recent: NetworkLogEntry[];
};

export type FuzzReproArtifact = {
  seed: number;
  scenario: string;
  config: FuzzConfig;
  last_ops: TypedOp[];
  shrunk_ops?: TypedOp[] | null;
  network_log: NetworkLogSummary;
  checkpoint_hashes: Array<{ tick: number; canonical_hashes: Record<string, string> }>;
};

export type FuzzRunResult = {
  passed: boolean;
  ops_generated: number;
  scenario: string;
  convergence: ConvergenceResult;
  network_stats: NetworkStats;
  repro_artifact?: FuzzReproArtifact;
};

export type NetworkSimState = {
  scenario: NetworkScenario;
  replica_ids: string[];
  time: number;
  queue: NetworkMessage[];
  stats: NetworkStats;
  log: NetworkLogEntry[];
  max_log_entries: number;
  partitioned_links: Set<string>;
  partition_schedule_index: number;
  rng_state: number;
  message_seq: number;
};

/** Convergence check result */
export type ConvergenceResult = {
  converged: boolean;
  replicas_checked: number;
  canonical_hashes: Map<string, string>;
  first_divergence?: {
    replica_a: string;
    replica_b: string;
    diff_path: string;
  };
};

/** SEC (Strong Eventual Consistency) assertion result */
export type SECAssertionResult = {
  passed: boolean;
  iterations_run: number;
  failures: SECFailure[];
  seed: number;
  scenario: string;
  network_stats: NetworkStats;
};

/** SEC failure details */
export type SECFailure = {
  iteration: number;
  ops_applied: number;
  failure_type: "divergence" | "determinism" | "ordering";
  details: string;
  replay_seed: number;
  scenario: string;
  repro_artifact?: FuzzReproArtifact;
};

/** Golden fixture for regression testing */
export type GoldenFixture = {
  name: string;
  description: string;
  seed: number;
  ops: TypedOp[];
  expected_canonical: CanonNode;
  expected_block_ids: string[];
  expected_annotation_states: Record<string, string>;
};

/** Test harness state */
export type TestHarnessState = {
  replicas: Map<string, ReplicaState>;
  network: NetworkSimState;
  rng_state: number;
  op_history: TypedOp[];
};
