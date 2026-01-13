/**
 * LFCC v0.9 RC - Golden Fixtures for Regression Testing
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md Section 4.3
 */

import type { CanonBlock } from "../canonicalizer/types.js";
import type { TypedOp } from "../shadow/types.js";
import type { GoldenFixture } from "./types.js";

/**
 * Create a golden fixture from test results
 */
export function createGoldenFixture(
  name: string,
  description: string,
  seed: number,
  ops: TypedOp[],
  expectedCanonical: CanonBlock,
  expectedBlockIds: string[],
  expectedAnnotationStates: Record<string, string>
): GoldenFixture {
  return {
    name,
    description,
    seed,
    ops,
    expected_canonical: expectedCanonical,
    expected_block_ids: expectedBlockIds,
    expected_annotation_states: expectedAnnotationStates,
  };
}

/**
 * Serialize a golden fixture to JSON
 */
export function serializeFixture(fixture: GoldenFixture): string {
  return JSON.stringify(fixture, null, 2);
}

/**
 * Deserialize a golden fixture from JSON
 */
export function deserializeFixture(json: string): GoldenFixture {
  return JSON.parse(json) as GoldenFixture;
}

/**
 * Compare actual results against golden fixture
 */
export function compareAgainstGolden(
  fixture: GoldenFixture,
  actualCanonical: CanonBlock,
  actualBlockIds: string[],
  actualAnnotationStates: Record<string, string>
): { passed: boolean; differences: string[] } {
  const differences: string[] = [];

  // Compare canonical structure
  const expectedJson = JSON.stringify(fixture.expected_canonical);
  const actualJson = JSON.stringify(actualCanonical);
  if (expectedJson !== actualJson) {
    differences.push("Canonical structure mismatch");
  }

  // Compare block IDs
  if (fixture.expected_block_ids.length !== actualBlockIds.length) {
    differences.push(
      `Block ID count mismatch: expected ${fixture.expected_block_ids.length}, got ${actualBlockIds.length}`
    );
  } else {
    for (let i = 0; i < fixture.expected_block_ids.length; i++) {
      if (fixture.expected_block_ids[i] !== actualBlockIds[i]) {
        differences.push(`Block ID mismatch at index ${i}`);
      }
    }
  }

  // Compare annotation states
  for (const [annoId, expectedState] of Object.entries(fixture.expected_annotation_states)) {
    const actualState = actualAnnotationStates[annoId];
    if (actualState !== expectedState) {
      differences.push(
        `Annotation ${annoId} state mismatch: expected ${expectedState}, got ${actualState}`
      );
    }
  }

  return {
    passed: differences.length === 0,
    differences,
  };
}

/** Pre-defined golden fixtures for common scenarios */
export const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    name: "simple_text_edit",
    description: "Basic text insertion in a paragraph",
    seed: 1,
    ops: [
      {
        code: "OP_TEXT_EDIT",
        block_id: "block-1",
        offset: 5,
        delete_count: 0,
        insert: " world",
      },
    ],
    expected_canonical: {
      id: "r/0",
      type: "paragraph",
      attrs: {},
      children: [{ text: "Hello world", marks: [], is_leaf: true }],
    },
    expected_block_ids: ["block-1"],
    expected_annotation_states: {},
  },
  {
    name: "block_split",
    description: "Split a paragraph into two",
    seed: 2,
    ops: [
      {
        code: "OP_BLOCK_SPLIT",
        block_id: "block-1",
        offset: 5,
      },
    ],
    expected_canonical: {
      id: "r/0",
      type: "document",
      attrs: {},
      children: [
        {
          id: "r/1",
          type: "paragraph",
          attrs: {},
          children: [{ text: "Hello", marks: [], is_leaf: true }],
        },
        {
          id: "r/2",
          type: "paragraph",
          attrs: {},
          children: [{ text: " world", marks: [], is_leaf: true }],
        },
      ],
    },
    expected_block_ids: ["block-1", "block-2"],
    expected_annotation_states: {},
  },
  {
    name: "block_join",
    description: "Join two paragraphs into one",
    seed: 3,
    ops: [
      {
        code: "OP_BLOCK_JOIN",
        left_block_id: "block-1",
        right_block_id: "block-2",
      },
    ],
    expected_canonical: {
      id: "r/0",
      type: "paragraph",
      attrs: {},
      children: [{ text: "Hello world", marks: [], is_leaf: true }],
    },
    expected_block_ids: ["block-1"],
    expected_annotation_states: {},
  },
];

/**
 * Run all golden fixture tests
 */
export function runGoldenFixtureTests(
  applyOps: (ops: TypedOp[]) => {
    canonical: CanonBlock;
    blockIds: string[];
    annotationStates: Record<string, string>;
  }
): {
  passed: number;
  failed: number;
  results: Array<{ name: string; passed: boolean; differences: string[] }>;
} {
  const results: Array<{ name: string; passed: boolean; differences: string[] }> = [];
  let passed = 0;
  let failed = 0;

  for (const fixture of GOLDEN_FIXTURES) {
    try {
      const actual = applyOps(fixture.ops);
      const comparison = compareAgainstGolden(
        fixture,
        actual.canonical,
        actual.blockIds,
        actual.annotationStates
      );

      results.push({
        name: fixture.name,
        passed: comparison.passed,
        differences: comparison.differences,
      });

      if (comparison.passed) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      results.push({
        name: fixture.name,
        passed: false,
        differences: [`Error: ${error instanceof Error ? error.message : "Unknown error"}`],
      });
      failed++;
    }
  }

  return { passed, failed, results };
}
