/**
 * LFCC v0.9 RC - Integrity Verification Types
 * @see docs/product/Local-First_Collaboration_Contract_v0.9_RC.md §6, §10
 */

import type { ChainKind } from "../policy/types";

/** Span data for hash computation */
export type SpanData = {
  span_id: string;
  block_id: string;
  text: string; // UTF-16 slice, LF-normalized
};

/** Chain data for hash computation */
export type ChainData = {
  policy_kind: ChainKind;
  max_intervening_blocks: number;
  block_ids: string[];
};

/** Context hash result */
export type ContextHashResult = {
  span_id: string;
  hash: string; // SHA-256 hex
};

/** Chain hash result */
export type ChainHashResult = {
  hash: string; // SHA-256 hex
  block_ids: string[];
};

/** Verification status for a span */
export type SpanVerifyStatus =
  | { status: "verified"; hash: string }
  | { status: "mismatch"; expected: string; actual: string }
  | { status: "missing" };

/** Verification status for a chain */
export type ChainVerifyStatus =
  | { status: "verified"; hash: string }
  | { status: "mismatch"; expected: string; actual: string }
  | { status: "broken"; reason: string };

/** Checkpoint result */
export type CheckpointResult = {
  timestamp: number;
  spans_verified: number;
  spans_failed: number;
  chains_verified: number;
  chains_failed: number;
  failures: CheckpointFailure[];
};

/** Individual checkpoint failure */
export type CheckpointFailure = {
  anno_id: string;
  span_id?: string;
  kind: "context_hash_mismatch" | "chain_hash_mismatch" | "chain_broken" | "span_missing";
  detail: string;
};

/** Checkpoint scheduler state */
export type CheckpointSchedulerState = {
  ops_since_last: number;
  last_checkpoint_ms: number;
  pending: boolean;
};

/** Compare mismatch from dev harness */
export type CompareMismatch = {
  kind: "dirty_missed_span" | "hash_mismatch" | "chain_violation";
  anno_id: string;
  span_id?: string;
  detail: string;
};

/** Dev compare policy */
export type DevComparePolicy = {
  dev_compare_mode: "adaptive_with_coverage";
  dev_fullscan_max_blocks: number;
  dev_sample_rate_large_docs: number;
  dev_compare_debounce_ms: number;
  dev_idle_fullscan_every_ms: number;
  dev_structural_ops_fullscan_every: number;
};

/** Default dev compare policy */
export const DEFAULT_DEV_COMPARE_POLICY: DevComparePolicy = {
  dev_compare_mode: "adaptive_with_coverage",
  dev_fullscan_max_blocks: 100,
  dev_sample_rate_large_docs: 0.1,
  dev_compare_debounce_ms: 200,
  dev_idle_fullscan_every_ms: 30000,
  dev_structural_ops_fullscan_every: 10,
};
