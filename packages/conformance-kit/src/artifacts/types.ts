/**
 * LFCC Conformance Kit - Artifact Types (Part F)
 */

import type { CanonNode } from "@ku0/core";
import type { FrontierLogEntry, MismatchInfo } from "../double-blind/types";
import type { GenConfig } from "../op-fuzzer/generator";
import type { FuzzOp } from "../op-fuzzer/types";

/** Artifact bundle for a failed run */
export type ArtifactBundle = {
  runId: string;
  timestamp: number;
  seed: number;
  config: GenConfig;
  initialSnapshot: Uint8Array | null;
  originalOps: FuzzOp[];
  shrunkOps: FuzzOp[] | null;
  failStep: number;
  mismatch: MismatchInfo;
  canonLoro: CanonNode;
  canonShadow: CanonNode;
  canonDiff: string;
  frontierLog: FrontierLogEntry[];
  notes: string;
};

/** Artifact file manifest */
export type ArtifactManifest = {
  runId: string;
  files: string[];
  created: string;
};

/** Serialized artifact paths */
export type ArtifactPaths = {
  dir: string;
  seed: string;
  config: string;
  initialSnapshot: string;
  opsOriginal: string;
  opsShrunk: string;
  failStep: string;
  canonLoro: string;
  canonShadow: string;
  canonDiff: string;
  frontierLog: string;
  notes: string;
  manifest: string;
};

/**
 * Generate artifact paths for a run
 */
export function getArtifactPaths(baseDir: string, runId: string): ArtifactPaths {
  const dir = `${baseDir}/${runId}`;
  return {
    dir,
    seed: `${dir}/seed.json`,
    config: `${dir}/config.json`,
    initialSnapshot: `${dir}/initial_snapshot.loro.bin`,
    opsOriginal: `${dir}/ops.original.json`,
    opsShrunk: `${dir}/ops.shrunk.json`,
    failStep: `${dir}/fail_step.txt`,
    canonLoro: `${dir}/canon.loro.json`,
    canonShadow: `${dir}/canon.shadow.json`,
    canonDiff: `${dir}/canon.diff.txt`,
    frontierLog: `${dir}/frontiers.log.jsonl`,
    notes: `${dir}/notes.md`,
    manifest: `${dir}/manifest.json`,
  };
}
