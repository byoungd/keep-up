/**
 * LFCC v0.9.4 AI Targeting Resilience Types and Test Vectors
 *
 * This module exports types and test vectors for the AI Targeting extension.
 *
 * @see docs/specs/lfcc/proposals/LFCC_v0.9.4_AI_Targeting_Resilience.md
 * @see docs/specs/lfcc/engineering/24_AI_Targeting_Extension.md
 */

// =============================================================================
// Types
// =============================================================================

export interface WindowHashInput {
  blockId: string;
  spanStart: number;
  spanEnd: number;
  blockText: string;
  windowSize: { left: number; right: number };
}

export interface NeighborHashInput {
  blockId: string;
  spanStart: number;
  spanEnd: number;
  blockText: string;
  neighborWindow: { left: number; right: number };
}

export interface StructureHashInput {
  blockId: string;
  blockType: string;
  parentBlockId: string | null;
  parentPath: string | null;
}

export interface MatchVector {
  hard: {
    contextHashMatch: boolean;
    windowHashMatch: boolean;
    structureHashMatch: boolean;
  };
  soft: {
    neighborLeftMatch: boolean;
    neighborRightMatch: boolean;
    windowHashMatch: boolean;
    structureHashMatch: boolean;
  };
}

export interface SpanCandidate {
  spanId: string;
  blockId: string;
  contextHash: string;
  windowHash?: string;
  structureHash?: string;
  neighborHash?: { left?: string; right?: string };
  distance: number;
}

// =============================================================================
// Test Vectors
// =============================================================================

/**
 * Window Hash Test Vectors (LFCC_SPAN_WINDOW_V1)
 */
export const windowHashVectors: Array<{
  id: string;
  input: WindowHashInput;
  expectedCanonical: string;
  description: string;
}> = [
  {
    id: "WH-001",
    input: {
      blockId: "block_abc123",
      spanStart: 10,
      spanEnd: 20,
      blockText: "Hello, world! This is a test.",
      windowSize: { left: 5, right: 5 },
    },
    expectedCanonical: [
      "LFCC_SPAN_WINDOW_V1",
      "block_id=block_abc123",
      "left=, wor",
      "right=s a t",
    ].join("\n"),
    description: "Standard window hash with sufficient context",
  },
  {
    id: "WH-002",
    input: {
      blockId: "block_xyz",
      spanStart: 0,
      spanEnd: 5,
      blockText: "Hello world",
      windowSize: { left: 10, right: 5 },
    },
    expectedCanonical: ["LFCC_SPAN_WINDOW_V1", "block_id=block_xyz", "left=", "right= worl"].join(
      "\n"
    ),
    description: "Window at block start (truncated left context)",
  },
  {
    id: "WH-003",
    input: {
      blockId: "block_crlf",
      spanStart: 5,
      spanEnd: 10,
      blockText: "ab\r\ncd\r\nefgh",
      windowSize: { left: 4, right: 4 },
    },
    expectedCanonical: ["LFCC_SPAN_WINDOW_V1", "block_id=block_crlf", "left=b\nc", "right=gh"].join(
      "\n"
    ),
    description: "CRLF normalized to LF",
  },
];

/**
 * Neighbor Hash Test Vectors (LFCC_NEIGHBOR_V1)
 */
export const neighborHashVectors: Array<{
  id: string;
  input: NeighborHashInput;
  expectedLeft?: string;
  expectedRight?: string;
  description: string;
}> = [
  {
    id: "NH-001",
    input: {
      blockId: "block_abc",
      spanStart: 10,
      spanEnd: 20,
      blockText: "Hello, world! This is a test.",
      neighborWindow: { left: 3, right: 3 },
    },
    // Left side: "wor"
    expectedLeft: ["LFCC_NEIGHBOR_V1", "block_id=block_abc", "side=left", "text=wor"].join("\n"),
    // Right side: "s a"
    expectedRight: ["LFCC_NEIGHBOR_V1", "block_id=block_abc", "side=right", "text=s a"].join("\n"),
    description: "Standard neighbor hash",
  },
  {
    id: "NH-002",
    input: {
      blockId: "block_start",
      spanStart: 0,
      spanEnd: 5,
      blockText: "Hello",
      neighborWindow: { left: 10, right: 10 },
    },
    expectedLeft: undefined,
    expectedRight: undefined,
    description: "No neighbors when span covers entire block",
  },
];

/**
 * Structure Hash Test Vectors (LFCC_BLOCK_SHAPE_V1)
 */
export const structureHashVectors: Array<{
  id: string;
  input: StructureHashInput;
  expectedCanonical: string;
  description: string;
}> = [
  {
    id: "SH-001",
    input: {
      blockId: "block_para1",
      blockType: "paragraph",
      parentBlockId: null,
      parentPath: null,
    },
    expectedCanonical: [
      "LFCC_BLOCK_SHAPE_V1",
      "block_id=block_para1",
      "type=paragraph",
      "parent_block_id=null",
      "parent_path=null",
    ].join("\n"),
    description: "Top-level paragraph",
  },
  {
    id: "SH-002",
    input: {
      blockId: "block_cell1",
      blockType: "table_cell",
      parentBlockId: "block_row1",
      parentPath: "table.row[0].cell[2]",
    },
    expectedCanonical: [
      "LFCC_BLOCK_SHAPE_V1",
      "block_id=block_cell1",
      "type=table_cell",
      "parent_block_id=block_row1",
      "parent_path=table.row[0].cell[2]",
    ].join("\n"),
    description: "Nested table cell with path",
  },
];

/**
 * Candidate Ranking Test Vectors
 */
export const rankingVectors: Array<{
  id: string;
  candidates: Array<{ spanId: string; vector: boolean[]; distance: number }>;
  expectedOrder: string[];
  description: string;
}> = [
  {
    id: "RK-001",
    candidates: [
      {
        spanId: "span_b",
        vector: [true, true, true, false, false, false, false],
        distance: 10,
      },
      {
        spanId: "span_a",
        vector: [true, true, true, true, false, false, false],
        distance: 20,
      },
    ],
    expectedOrder: ["span_a", "span_b"],
    description: "Higher soft match count wins over distance",
  },
  {
    id: "RK-002",
    candidates: [
      {
        spanId: "span_b",
        vector: [true, true, true, true, false, false, false],
        distance: 50,
      },
      {
        spanId: "span_a",
        vector: [true, true, true, true, false, false, false],
        distance: 10,
      },
    ],
    expectedOrder: ["span_a", "span_b"],
    description: "Equal vectors: closer distance wins",
  },
  {
    id: "RK-003",
    candidates: [
      {
        spanId: "span_b",
        vector: [true, true, true, true, false, false, false],
        distance: 10,
      },
      {
        spanId: "span_a",
        vector: [true, true, true, true, false, false, false],
        distance: 10,
      },
    ],
    expectedOrder: ["span_a", "span_b"],
    description: "Equal vectors and distance: lexicographic span_id wins",
  },
];

/**
 * Layered Precondition Test Vectors
 */
export const layeredPreconditionVectors: Array<{
  id: string;
  strong: Array<{ spanId: string; passes: boolean }>;
  weak: Array<{ spanId: string; passes: boolean; onMismatch: string }>;
  expectedSuccess: boolean;
  expectedRecoveries?: number;
  description: string;
}> = [
  {
    id: "LP-001",
    strong: [{ spanId: "s1", passes: true }],
    weak: [{ spanId: "s2", passes: false, onMismatch: "relocate" }],
    expectedSuccess: true,
    expectedRecoveries: 1,
    description: "Strong passes, weak recovers via relocate",
  },
  {
    id: "LP-002",
    strong: [{ spanId: "s1", passes: false }],
    weak: [{ spanId: "s2", passes: true, onMismatch: "skip" }],
    expectedSuccess: false,
    description: "Strong fails: blocks all processing",
  },
  {
    id: "LP-003",
    strong: [],
    weak: [
      { spanId: "s1", passes: false, onMismatch: "skip" },
      { spanId: "s2", passes: false, onMismatch: "trim_range" },
    ],
    expectedSuccess: true,
    expectedRecoveries: 2,
    description: "All weak with mixed recovery strategies",
  },
];

/**
 * Auto-Trim Test Vectors
 */
export const autoTrimVectors: Array<{
  id: string;
  originalLength: number;
  currentLength: number;
  intersectionLength: number;
  minPreservedRatio: number;
  expectedSuccess: boolean;
  description: string;
}> = [
  {
    id: "AT-001",
    originalLength: 100,
    currentLength: 80,
    intersectionLength: 75,
    minPreservedRatio: 0.5,
    expectedSuccess: true,
    description: "75% preserved (above 50% threshold)",
  },
  {
    id: "AT-002",
    originalLength: 100,
    currentLength: 50,
    intersectionLength: 40,
    minPreservedRatio: 0.5,
    expectedSuccess: false,
    description: "40% preserved (below 50% threshold)",
  },
  {
    id: "AT-003",
    originalLength: 100,
    currentLength: 0,
    intersectionLength: 0,
    minPreservedRatio: 0.5,
    expectedSuccess: false,
    description: "No intersection (complete drift)",
  },
];

// =============================================================================
// Exports
// =============================================================================

export const targetingConformanceVectors = {
  windowHash: windowHashVectors,
  neighborHash: neighborHashVectors,
  structureHash: structureHashVectors,
  ranking: rankingVectors,
  layeredPreconditions: layeredPreconditionVectors,
  autoTrim: autoTrimVectors,
};
