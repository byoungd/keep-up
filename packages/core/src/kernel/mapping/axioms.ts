/**
 * LFCC v0.9 RC - Block Mapping Axioms and Implementation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/01_Kernel_API_Specification.md Section 3
 *
 * RISK-002: Deletion Semantics (P0.1)
 * ====================================
 * Negative delta (delta < 0) represents deletion of a contiguous interval in old coordinates:
 * - Deleted positions (within [offset, offset + |delta|)) map to null.
 * - Overlapping deletions stack (lengths accumulate) to preserve total deleted length.
 * - Positions at/after the deleted interval shift left by |delta|.
 * - Monotonicity: For positions posA < posB, mapped(posA) <= mapped(posB) for non-null results.
 */

import { validateRange } from "../utils/unicode.js";
import type { BlockMapping, MappedPosition } from "./types.js";

/** Position delta for a single edit operation */
export type PositionDelta = {
  blockId: string;
  offset: number;
  /**
   * Delta value:
   * - Positive = insertion (adds characters)
   * - Negative = deletion (removes |delta| characters starting at offset)
   */
  delta: number;
};

/** Block transformation record */
export type BlockTransform =
  | { kind: "unchanged"; oldId: string; newId: string }
  | { kind: "modified"; oldId: string; newId: string; deltas: PositionDelta[] }
  | { kind: "split"; oldId: string; newIds: string[]; splitAt: number }
  | { kind: "merged"; oldIds: string[]; newId: string; oldLengths: number[] }
  | { kind: "deleted"; oldId: string };

type DeleteRange = { start: number; end: number };

type PreparedModifiedTransform = Extract<BlockTransform, { kind: "modified" }> & {
  deleteRanges: DeleteRange[];
  shiftPoints: number[];
  shiftValues: number[];
};

type PreparedMergedTransform = Extract<BlockTransform, { kind: "merged" }> & {
  offsetsByOldId: Map<string, number>;
};

type PreparedTransform =
  | Exclude<BlockTransform, { kind: "modified" | "merged" }>
  | PreparedModifiedTransform
  | PreparedMergedTransform;

function validateTransformOffsets(transform: BlockTransform, blockTexts: Record<string, string>) {
  if (transform.kind === "split") {
    validateSplitTransformOffset(transform, blockTexts);
    return;
  }

  if (transform.kind === "modified") {
    validateModifiedTransformOffsets(transform, blockTexts);
  }
}

function validateSplitTransformOffset(
  transform: Extract<BlockTransform, { kind: "split" }>,
  blockTexts: Record<string, string>
): void {
  const text = blockTexts[transform.oldId];
  if (text === undefined) {
    return;
  }
  assertValidRange(text, transform.splitAt, transform.splitAt, "Invalid split offset");
}

function validateModifiedTransformOffsets(
  transform: Extract<BlockTransform, { kind: "modified" }>,
  blockTexts: Record<string, string>
): void {
  const text = blockTexts[transform.oldId];
  if (text === undefined) {
    return;
  }
  for (const delta of transform.deltas) {
    if (delta.delta < 0) {
      const end = delta.offset + Math.abs(delta.delta);
      assertValidRange(text, delta.offset, end, "Invalid delete range");
      continue;
    }
    assertValidRange(text, delta.offset, delta.offset, "Invalid insert offset");
  }
}

function assertValidRange(text: string, from: number, to: number, fallbackMessage: string): void {
  const result = validateRange(text, from, to);
  if (!result.valid) {
    throw new Error(`INV-COORD-002: ${result.error ?? fallbackMessage}`);
  }
}

function mergeDeleteRanges(ranges: DeleteRange[]): DeleteRange[] {
  if (ranges.length <= 1) {
    return ranges;
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: DeleteRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      continue;
    }

    // Overlapping deletions stack to preserve total deleted length.
    last.end += range.end - range.start;
  }

  return merged;
}

function buildModifiedTransform(
  transform: Extract<BlockTransform, { kind: "modified" }>
): PreparedModifiedTransform {
  const deltas =
    transform.deltas.length > 1
      ? [...transform.deltas].sort((a, b) => a.offset - b.offset)
      : transform.deltas;

  const shiftDeltas = new Map<number, number>();
  const deleteRanges: DeleteRange[] = [];

  for (const delta of deltas) {
    if (delta.delta === 0) {
      continue;
    }

    if (delta.delta > 0) {
      shiftDeltas.set(delta.offset, (shiftDeltas.get(delta.offset) ?? 0) + delta.delta);
      continue;
    }

    const deleteLength = Math.abs(delta.delta);
    const deleteStart = delta.offset;
    const deleteEnd = deleteStart + deleteLength;
    deleteRanges.push({ start: deleteStart, end: deleteEnd });
    shiftDeltas.set(deleteEnd, (shiftDeltas.get(deleteEnd) ?? 0) + delta.delta);
  }

  const shiftPoints: number[] = [];
  const shiftValues: number[] = [];
  let cumulativeShift = 0;
  const sortedShiftDeltas = [...shiftDeltas.entries()].sort((a, b) => a[0] - b[0]);
  for (const [point, delta] of sortedShiftDeltas) {
    cumulativeShift += delta;
    shiftPoints.push(point);
    shiftValues.push(cumulativeShift);
  }

  return {
    ...transform,
    deltas,
    deleteRanges: mergeDeleteRanges(deleteRanges),
    shiftPoints,
    shiftValues,
  };
}

function buildMergedTransform(
  transform: Extract<BlockTransform, { kind: "merged" }>
): PreparedMergedTransform {
  const offsetsByOldId = new Map<string, number>();
  let offset = 0;

  for (let i = 0; i < transform.oldIds.length; i++) {
    const oldId = transform.oldIds[i];
    offsetsByOldId.set(oldId, offset);
    const length = transform.oldLengths[i] ?? 0;
    offset += Math.max(0, length);
  }

  return { ...transform, offsetsByOldId };
}

function isDeletedPosition(ranges: DeleteRange[], position: number): boolean {
  if (ranges.length === 0) {
    return false;
  }

  let low = 0;
  let high = ranges.length - 1;
  let matchIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const range = ranges[mid];
    if (range.start <= position) {
      matchIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (matchIndex === -1) {
    return false;
  }

  return position < ranges[matchIndex].end;
}

function shiftAt(shiftPoints: number[], shiftValues: number[], position: number): number {
  if (shiftPoints.length === 0) {
    return 0;
  }

  let low = 0;
  let high = shiftPoints.length - 1;
  let matchIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (shiftPoints[mid] <= position) {
      matchIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return matchIndex === -1 ? 0 : shiftValues[matchIndex];
}

function prepareTransforms(
  transforms: BlockTransform[],
  blockTexts?: Record<string, string>
): PreparedTransform[] {
  if (blockTexts) {
    for (const transform of transforms) {
      validateTransformOffsets(transform, blockTexts);
    }
  }

  return transforms.map((transform) => {
    if (transform.kind === "modified") {
      return buildModifiedTransform(transform);
    }
    if (transform.kind === "merged") {
      return buildMergedTransform(transform);
    }
    return transform;
  });
}

function buildTransformMaps(transforms: PreparedTransform[]): {
  oldToNew: Map<string, PreparedTransform>;
  newToOld: Map<string, string[]>;
} {
  const oldToNew = new Map<string, PreparedTransform>();
  const newToOld = new Map<string, string[]>();

  for (const transform of transforms) {
    registerTransformMapping(transform, oldToNew, newToOld);
  }

  return { oldToNew, newToOld };
}

function registerTransformMapping(
  transform: PreparedTransform,
  oldToNew: Map<string, PreparedTransform>,
  newToOld: Map<string, string[]>
): void {
  switch (transform.kind) {
    case "unchanged":
    case "modified":
      registerUnchangedTransform(transform, oldToNew, newToOld);
      return;
    case "split":
      registerSplitTransform(transform, oldToNew, newToOld);
      return;
    case "merged":
      registerMergedTransform(transform, oldToNew, newToOld);
      return;
    case "deleted":
      registerDeletedTransform(transform, oldToNew);
  }
}

function registerUnchangedTransform(
  transform: Extract<PreparedTransform, { kind: "unchanged" | "modified" }>,
  oldToNew: Map<string, PreparedTransform>,
  newToOld: Map<string, string[]>
): void {
  oldToNew.set(transform.oldId, transform);
  newToOld.set(transform.newId, [transform.oldId]);
}

function registerSplitTransform(
  transform: Extract<PreparedTransform, { kind: "split" }>,
  oldToNew: Map<string, PreparedTransform>,
  newToOld: Map<string, string[]>
): void {
  oldToNew.set(transform.oldId, transform);
  for (const newId of transform.newIds) {
    newToOld.set(newId, [transform.oldId]);
  }
}

function registerMergedTransform(
  transform: Extract<PreparedTransform, { kind: "merged" }>,
  oldToNew: Map<string, PreparedTransform>,
  newToOld: Map<string, string[]>
): void {
  for (const oldId of transform.oldIds) {
    oldToNew.set(oldId, transform);
  }
  newToOld.set(transform.newId, transform.oldIds);
}

function registerDeletedTransform(
  transform: Extract<PreparedTransform, { kind: "deleted" }>,
  oldToNew: Map<string, PreparedTransform>
): void {
  oldToNew.set(transform.oldId, transform);
}

function mapOldPosition(
  transform: PreparedTransform,
  oldBlockId: string,
  oldAbsInBlock: number
): MappedPosition {
  switch (transform.kind) {
    case "unchanged":
      return { newBlockId: transform.newId, newAbsInBlock: oldAbsInBlock };

    case "modified": {
      if (isDeletedPosition(transform.deleteRanges, oldAbsInBlock)) {
        return null;
      }

      const shift = shiftAt(transform.shiftPoints, transform.shiftValues, oldAbsInBlock);
      return {
        newBlockId: transform.newId,
        newAbsInBlock: Math.max(0, oldAbsInBlock + shift),
      };
    }

    case "split":
      if (oldAbsInBlock < transform.splitAt) {
        return { newBlockId: transform.newIds[0], newAbsInBlock: oldAbsInBlock };
      }
      return {
        newBlockId: transform.newIds[1],
        newAbsInBlock: oldAbsInBlock - transform.splitAt,
      };

    case "merged": {
      const offset = transform.offsetsByOldId.get(oldBlockId) ?? 0;
      return { newBlockId: transform.newId, newAbsInBlock: oldAbsInBlock + offset };
    }

    case "deleted":
      return null;
  }
}

function getDerivedBlocks(transform: PreparedTransform): string[] {
  switch (transform.kind) {
    case "unchanged":
    case "modified":
      return [transform.newId];
    case "split":
      return transform.newIds;
    case "merged":
      return [transform.newId];
    case "deleted":
      return [];
  }
}

/**
 * Create a BlockMapping from a list of transforms
 */
export function createBlockMapping(
  transforms: BlockTransform[],
  opts?: { blockTexts?: Record<string, string> }
): BlockMapping {
  const preparedTransforms = prepareTransforms(transforms, opts?.blockTexts);
  const { oldToNew, newToOld } = buildTransformMaps(preparedTransforms);

  return {
    mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition {
      const transform = oldToNew.get(oldBlockId);
      if (!transform) {
        return null;
      }
      return mapOldPosition(transform, oldBlockId, oldAbsInBlock);
    },

    derivedBlocksFrom(oldBlockId: string): string[] {
      const transform = oldToNew.get(oldBlockId);
      if (!transform) {
        return [];
      }
      return getDerivedBlocks(transform);
    },

    mergedFrom(newBlockId: string): string[] {
      return newToOld.get(newBlockId) ?? [];
    },
  };
}

type MappingSample = {
  blockId: string;
  positions: number[];
};

function isMappedPositionEqual(a: MappedPosition, b: MappedPosition): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.newBlockId === b.newBlockId && a.newAbsInBlock === b.newAbsInBlock;
}

export function verifyDeterminism(
  buildMapping: () => BlockMapping,
  samples: MappingSample[],
  iterations = 100
): boolean {
  if (iterations <= 1) {
    return true;
  }

  const baseline = buildMapping();
  const expected = new Map<string, MappedPosition[]>();

  for (const sample of samples) {
    expected.set(
      sample.blockId,
      sample.positions.map((pos) => baseline.mapOldToNew(sample.blockId, pos))
    );
  }

  for (let i = 1; i < iterations; i++) {
    const mapping = buildMapping();
    for (const sample of samples) {
      const expectedPositions = expected.get(sample.blockId) ?? [];
      for (let j = 0; j < sample.positions.length; j++) {
        const actual = mapping.mapOldToNew(sample.blockId, sample.positions[j]);
        if (!isMappedPositionEqual(actual, expectedPositions[j] ?? null)) {
          return false;
        }
      }
    }
  }

  return true;
}

export function verifyLocality(
  mapping: BlockMapping,
  oldBlockId: string,
  positions: number[],
  maxDistance: number
): boolean {
  for (const pos of positions) {
    const mapped = mapping.mapOldToNew(oldBlockId, pos);
    if (!mapped) {
      continue;
    }
    const distance = Math.abs(mapped.newAbsInBlock - pos);
    if (distance > maxDistance) {
      return false;
    }
  }

  return true;
}

export function verifyCoverage(
  mapping: BlockMapping,
  oldBlockId: string,
  positions: number[],
  requireCoverage = true
): boolean {
  if (!requireCoverage) {
    return true;
  }

  return positions.every((pos) => mapping.mapOldToNew(oldBlockId, pos) !== null);
}

export function verifyMonotonicity(
  mapping: BlockMapping,
  oldBlockId: string,
  positions: number[]
): boolean {
  const sorted = [...positions].sort((a, b) => a - b);
  const mapped = sorted.map((p) => mapping.mapOldToNew(oldBlockId, p));

  const lastPosInBlock = new Map<string, number>();

  for (let i = 0; i < mapped.length; i++) {
    const curr = mapped[i];
    if (curr === null) {
      continue;
    }

    const lastPos = lastPosInBlock.get(curr.newBlockId);
    if (lastPos !== undefined && lastPos > curr.newAbsInBlock) {
      return false;
    }

    lastPosInBlock.set(curr.newBlockId, curr.newAbsInBlock);
  }

  return true;
}
