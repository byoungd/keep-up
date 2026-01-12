/**
 * LFCC v0.9 RC - DirtyInfo Superset Assertion
 * @see docs/product/Audit/phase6/gaps/TASK_PROMPT_DIRTYINFO_ENFORCEMENT_BRIDGE.md
 *
 * Ensures bridge-emitted DirtyInfo is never smaller than kernel-computed DirtyInfo.
 */

import type { DirtyInfo } from "@keepup/core";

/** Difference between kernel and bridge DirtyInfo */
export interface DirtyInfoDiff {
  /** Blocks in kernel but missing from bridge */
  missingBlocks: string[];
  /** OpCodes in kernel but missing from bridge */
  missingOpCodes: string[];
  /** Ranges in kernel but missing from bridge (by blockId) */
  missingRanges: Array<{ blockId: string; start: number; end: number }>;
}

/** Result of superset assertion */
export type AssertDirtyInfoResult =
  | { ok: true }
  | { ok: false; code: "UNDER_REPORTED"; diff: DirtyInfoDiff };

/**
 * Assert that bridge DirtyInfo is a superset of kernel DirtyInfo.
 *
 * Contract:
 * - bridge.touchedBlocks ⊇ kernel.touchedBlocks
 * - bridge.opCodes ⊇ kernel.opCodes
 * - bridge.touchedRanges covers all kernel touchedRanges (if used)
 *
 * @param kernel - DirtyInfo computed by kernel
 * @param bridge - DirtyInfo emitted by bridge
 * @returns ok: true if valid, or error with diff
 */
export function assertDirtyInfoSuperset(
  kernel: DirtyInfo,
  bridge: DirtyInfo
): AssertDirtyInfoResult {
  const diff: DirtyInfoDiff = {
    missingBlocks: [],
    missingOpCodes: [],
    missingRanges: [],
  };

  diff.missingBlocks = collectMissingBlocks(kernel.touchedBlocks, bridge.touchedBlocks);
  diff.missingOpCodes = collectMissingOpCodes(kernel.opCodes, bridge.opCodes);
  diff.missingRanges = collectMissingRanges(kernel.touchedRanges, bridge.touchedRanges);

  if (hasViolations(diff)) {
    return { ok: false, code: "UNDER_REPORTED", diff };
  }

  return { ok: true };
}

function collectMissingBlocks(kernelBlocks: string[], bridgeBlocks: string[]): string[] {
  const bridgeBlockSet = new Set(bridgeBlocks);
  const missing: string[] = [];
  for (const blockId of kernelBlocks) {
    if (!bridgeBlockSet.has(blockId)) {
      missing.push(blockId);
    }
  }
  return missing;
}

function collectMissingOpCodes(kernelOpCodes: string[], bridgeOpCodes: string[]): string[] {
  const bridgeOpCodeSet = new Set(bridgeOpCodes);
  const missing: string[] = [];
  for (const opCode of kernelOpCodes) {
    if (!bridgeOpCodeSet.has(opCode)) {
      missing.push(opCode);
    }
  }
  return missing;
}

function collectMissingRanges(
  kernelRanges: DirtyInfo["touchedRanges"],
  bridgeRanges: DirtyInfo["touchedRanges"]
): Array<{ blockId: string; start: number; end: number }> {
  if (!kernelRanges || kernelRanges.length === 0) {
    return [];
  }

  const bridgeRangesByBlock = new Map<string, Array<{ start: number; end: number }>>();
  if (bridgeRanges) {
    for (const range of bridgeRanges) {
      const existing = bridgeRangesByBlock.get(range.blockId) ?? [];
      existing.push({ start: range.start, end: range.end });
      bridgeRangesByBlock.set(range.blockId, existing);
    }
  }

  const missing: Array<{ blockId: string; start: number; end: number }> = [];
  for (const kernelRange of kernelRanges) {
    const ranges = bridgeRangesByBlock.get(kernelRange.blockId);
    if (!ranges || !rangesCover(ranges, kernelRange)) {
      missing.push(kernelRange);
    }
  }

  return missing;
}

function hasViolations(diff: DirtyInfoDiff): boolean {
  return (
    diff.missingBlocks.length > 0 || diff.missingOpCodes.length > 0 || diff.missingRanges.length > 0
  );
}

/**
 * Check if bridge ranges cover a kernel range.
 * A kernel range is covered if there exists at least one bridge range
 * that fully contains it.
 */
function rangesCover(
  bridgeRanges: Array<{ start: number; end: number }>,
  kernelRange: { start: number; end: number }
): boolean {
  for (const br of bridgeRanges) {
    if (br.start <= kernelRange.start && br.end >= kernelRange.end) {
      return true;
    }
  }
  return false;
}

/**
 * Format DirtyInfo diff for logging/diagnostics.
 */
export function formatDirtyInfoDiff(diff: DirtyInfoDiff): string {
  const lines: string[] = [];

  if (diff.missingBlocks.length > 0) {
    lines.push(`Missing blocks: ${diff.missingBlocks.join(", ")}`);
  }
  if (diff.missingOpCodes.length > 0) {
    lines.push(`Missing opCodes: ${diff.missingOpCodes.join(", ")}`);
  }
  if (diff.missingRanges.length > 0) {
    const rangeStrs = diff.missingRanges.map((r) => `${r.blockId}[${r.start}:${r.end}]`);
    lines.push(`Missing ranges: ${rangeStrs.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("; ") : "No differences";
}
