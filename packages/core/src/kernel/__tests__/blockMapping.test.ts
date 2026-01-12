import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  type BlockTransform,
  createBlockMapping,
  verifyCoverage,
  verifyDeterminism,
  verifyLocality,
  verifyMonotonicity,
} from "../mapping/axioms";

// Arbitrary for PositionDelta
const positionDeltaArbitrary = fc.record({
  blockId: fc.string(),
  offset: fc.nat({ max: 100 }),
  delta: fc.integer({ min: -50, max: 50 }),
});

// Arbitrary for BlockTransform
const blockTransformArbitrary = fc.oneof(
  fc.record({
    kind: fc.constant("unchanged"),
    oldId: fc.uuid(),
    newId: fc.uuid(),
  }),
  fc.record({
    kind: fc.constant("modified"),
    oldId: fc.uuid(),
    newId: fc.uuid(),
    deltas: fc.array(positionDeltaArbitrary),
  }),
  fc.record({
    kind: fc.constant("split"),
    oldId: fc.uuid(),
    newIds: fc.tuple(fc.uuid(), fc.uuid()),
    splitAt: fc.nat({ max: 100 }),
  }),
  fc.array(fc.uuid(), { minLength: 2, maxLength: 5 }).chain((oldIds) =>
    fc.record({
      kind: fc.constant("merged"),
      oldIds: fc.constant(oldIds),
      newId: fc.uuid(),
      oldLengths: fc.array(fc.nat({ max: 200 }), {
        minLength: oldIds.length,
        maxLength: oldIds.length,
      }),
    })
  ),
  fc.record({
    kind: fc.constant("deleted"),
    oldId: fc.uuid(),
  })
);

type SimpleDelta = { offset: number; delta: number };

function buildModifiedTransforms(deltas: SimpleDelta[]): BlockTransform[] {
  return [
    {
      kind: "modified",
      oldId: "block1",
      newId: "block1",
      deltas: deltas.map((delta) => ({ ...delta, blockId: "block1" })),
    },
  ];
}

function mergeDeleteRanges(deltas: SimpleDelta[]): Array<{ start: number; end: number }> {
  const ranges = deltas
    .filter((delta) => delta.delta < 0)
    .map((delta) => ({ start: delta.offset, end: delta.offset + Math.abs(delta.delta) }))
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      continue;
    }
    last.end += range.end - range.start;
  }

  return merged;
}

function isDeletedPosition(ranges: Array<{ start: number; end: number }>, pos: number): boolean {
  for (const range of ranges) {
    if (pos < range.start) {
      return false;
    }
    if (pos >= range.start && pos < range.end) {
      return true;
    }
  }
  return false;
}

function verifyDeletionMapping(
  mapping: ReturnType<typeof createBlockMapping>,
  positions: number[],
  deleteRanges: Array<{ start: number; end: number }>
): boolean {
  const sortedPositions = [...positions].sort((a, b) => a - b);
  let lastMapped: number | null = null;

  for (const pos of sortedPositions) {
    const mapped = mapping.mapOldToNew("block1", pos);
    if (isDeletedPosition(deleteRanges, pos)) {
      if (mapped !== null) {
        return false;
      }
      continue;
    }

    if (!mapped) {
      return false;
    }

    if (lastMapped !== null && mapped.newAbsInBlock < lastMapped) {
      return false;
    }
    lastMapped = mapped.newAbsInBlock;
  }

  return true;
}

describe("BlockMapping Verification Suite (RISK-002)", () => {
  // 1. Determinism
  test("Axiom 1: Determinism", () => {
    fc.assert(
      fc.property(fc.array(blockTransformArbitrary), (transforms) => {
        const samples = transforms.map((t) => {
          // Correct property access for union type
          if (t.kind === "merged") {
            return { blockId: t.oldIds[0], positions: [0, 5, 10, 50, 100] };
          }
          const oldId = t.oldId;
          return { blockId: oldId, positions: [0, 5, 10, 50, 100] };
        });

        return verifyDeterminism(() => createBlockMapping(transforms as BlockTransform[]), samples);
      })
    );
  });

  // 2. Locality
  test("Axiom 2: Locality", () => {
    fc.assert(
      fc.property(fc.array(blockTransformArbitrary), (transforms) => {
        const mapping = createBlockMapping(transforms as BlockTransform[]);

        return transforms.every((t) => {
          if (t.kind === "deleted") {
            return true;
          }

          const oldId = t.kind === "merged" ? t.oldIds[0] : t.oldId;

          const maxDist = 200;
          return verifyLocality(mapping, oldId, [0, 10, 50], maxDist);
        });
      })
    );
  });

  // 3. Monotonicity
  test("Axiom 3: Monotonicity", () => {
    fc.assert(
      fc.property(fc.array(blockTransformArbitrary), (transforms) => {
        const mapping = createBlockMapping(transforms as BlockTransform[]);

        return transforms.every((t) => {
          if (t.kind === "merged") {
            return true;
          }
          const oldId = t.oldId;

          return verifyMonotonicity(mapping, oldId, [0, 5, 10, 20, 50, 100]);
        });
      })
    );
  });

  // RISK-002: Monotonicity regression test for negative deltas
  test("Monotonicity with negative deltas (deletions)", () => {
    const transforms: BlockTransform[] = [
      {
        kind: "modified",
        oldId: "block1",
        newId: "block1",
        deltas: [
          { blockId: "block1", offset: 5, delta: 3 }, // Insert 3 at offset 5
          { blockId: "block1", offset: 10, delta: -2 }, // Delete 2 at offset 10
        ],
      },
    ];

    const mapping = createBlockMapping(transforms);

    // Test positions around the deletion
    const positions = [0, 4, 5, 8, 9, 10, 11, 12, 15];
    expect(verifyMonotonicity(mapping, "block1", positions)).toBe(true);

    // Deleted interval [10, 12) maps to null.
    expect(mapping.mapOldToNew("block1", 10)).toBeNull();
    expect(mapping.mapOldToNew("block1", 11)).toBeNull();

    // Verify positions after deletion are shifted correctly
    // Insert +3 at 5, delete -2 at 10 (applies after 12).
    const pos12 = mapping.mapOldToNew("block1", 12);
    expect(pos12).not.toBeNull();
    expect(pos12?.newAbsInBlock).toBe(13);

    const pos15 = mapping.mapOldToNew("block1", 15);
    expect(pos15).not.toBeNull();
    expect(pos15?.newAbsInBlock).toBe(16);
  });

  // RISK-002: Property test for monotonicity with mixed positive/negative deltas
  test("Monotonicity property with mixed deltas", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            offset: fc.nat({ max: 50 }),
            delta: fc.integer({ min: -10, max: 10 }), // Allow negative deltas
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(fc.nat({ max: 60 }), { minLength: 2, maxLength: 10 }),
        (deltas, positions) => {
          const transforms: BlockTransform[] = [
            {
              kind: "modified",
              oldId: "block1",
              newId: "block1",
              deltas: deltas.map((d) => ({ ...d, blockId: "block1" })),
            },
          ];

          const mapping = createBlockMapping(transforms);
          return verifyMonotonicity(mapping, "block1", positions);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("Deleted positions map to null (property)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            offset: fc.nat({ max: 50 }),
            delta: fc.integer({ min: -10, max: 10 }),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        fc.array(fc.nat({ max: 60 }), { minLength: 2, maxLength: 12 }),
        (deltas, positions) => {
          const mapping = createBlockMapping(buildModifiedTransforms(deltas));
          const deleteRanges = mergeDeleteRanges(deltas);
          return verifyDeletionMapping(mapping, positions, deleteRanges);
        }
      ),
      { numRuns: 50 }
    );
  });

  test("Merged mapping offsets right-side blocks", () => {
    const transforms: BlockTransform[] = [
      {
        kind: "merged",
        oldIds: ["left", "right"],
        newId: "left",
        oldLengths: [4, 3],
      },
    ];

    const mapping = createBlockMapping(transforms);

    expect(mapping.mapOldToNew("left", 2)).toEqual({ newBlockId: "left", newAbsInBlock: 2 });
    expect(mapping.mapOldToNew("right", 1)).toEqual({ newBlockId: "left", newAbsInBlock: 5 });
  });

  test("Merged mapping composes in merge order", () => {
    const leftLength = 4;
    const rightLength = 3;
    const tailLength = 5;

    const mappingA = createBlockMapping([
      {
        kind: "merged",
        oldIds: ["left", "right"],
        newId: "left",
        oldLengths: [leftLength, rightLength],
      },
      { kind: "unchanged", oldId: "tail", newId: "tail" },
    ]);

    const mappingB = createBlockMapping([
      {
        kind: "merged",
        oldIds: ["left", "tail"],
        newId: "left",
        oldLengths: [leftLength + rightLength, tailLength],
      },
    ]);

    const mappingComposed = createBlockMapping([
      {
        kind: "merged",
        oldIds: ["left", "right", "tail"],
        newId: "left",
        oldLengths: [leftLength, rightLength, tailLength],
      },
    ]);

    const samples = [
      { id: "left", pos: 1 },
      { id: "right", pos: 2 },
      { id: "tail", pos: 3 },
    ];

    for (const sample of samples) {
      const mappedA = mappingA.mapOldToNew(sample.id, sample.pos);
      expect(mappedA).not.toBeNull();
      if (!mappedA) {
        continue;
      }

      const mappedB = mappingB.mapOldToNew(mappedA.newBlockId, mappedA.newAbsInBlock);
      const mappedComposed = mappingComposed.mapOldToNew(sample.id, sample.pos);
      expect(mappedComposed).toEqual(mappedB);
    }
  });

  // 4. Coverage
  test("Axiom 4: Coverage", () => {
    fc.assert(
      fc.property(fc.array(blockTransformArbitrary), (transforms) => {
        const mapping = createBlockMapping(transforms as BlockTransform[]);

        return transforms.every((t) => {
          if (t.kind === "merged") {
            return true;
          }
          const oldId = t.oldId;

          // Deleted blocks don't need coverage
          if (t.kind === "deleted") {
            return true;
          }

          if (t.kind === "modified" && t.deltas.some((delta) => delta.delta < 0)) {
            return true;
          }

          return verifyCoverage(mapping, oldId, [0, 10, 20], true);
        });
      })
    );
  });
});
