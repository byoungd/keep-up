/**
 * LFCC v0.9 RC - Fuzz Test Generators
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/08_Conformance_Test_Suite_Plan.md Section 4
 */

import type { ShadowDocument, TypedOp } from "../shadow/types.js";
import type { FuzzConfig, FuzzOpConfig, FuzzOpType } from "./types.js";

/** Random number generator state */
export type RngState = {
  seed: number;
};

/**
 * Create RNG with seed
 */
export function createRng(seed: number): RngState {
  return { seed };
}

/**
 * Generate next random number (0-1)
 */
export function nextRandom(rng: RngState): { value: number; rng: RngState } {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  const newSeed = (a * rng.seed + c) % m;
  return { value: newSeed / m, rng: { seed: newSeed } };
}

/**
 * Generate random integer in range [min, max]
 */
export function randomInt(
  rng: RngState,
  min: number,
  max: number
): { value: number; rng: RngState } {
  const { value, rng: newRng } = nextRandom(rng);
  return { value: Math.floor(value * (max - min + 1)) + min, rng: newRng };
}

/**
 * Generate random string
 */
export function randomString(rng: RngState, length: number): { value: string; rng: RngState } {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ";
  let result = "";
  let currentRng = rng;

  for (let i = 0; i < length; i++) {
    const { value, rng: newRng } = randomInt(currentRng, 0, chars.length - 1);
    result += chars[value];
    currentRng = newRng;
  }

  return { value: result, rng: currentRng };
}

/**
 * Select random element from array
 */
export function randomElement<T>(rng: RngState, arr: T[]): { value: T | undefined; rng: RngState } {
  if (arr.length === 0) {
    return { value: undefined, rng };
  }
  const { value: idx, rng: newRng } = randomInt(rng, 0, arr.length - 1);
  return { value: arr[idx], rng: newRng };
}

/**
 * Select operation type based on weights
 */
export function selectOpType(
  rng: RngState,
  configs: FuzzOpConfig[]
): { type: FuzzOpType; rng: RngState } {
  const totalWeight = configs.reduce((sum, c) => sum + c.weight, 0);
  let { value: roll, rng: currentRng } = nextRandom(rng);
  roll *= totalWeight;

  let cumulative = 0;
  for (const config of configs) {
    cumulative += config.weight;
    if (roll < cumulative) {
      return { type: config.type, rng: currentRng };
    }
  }

  return { type: configs[configs.length - 1].type, rng: currentRng };
}

/**
 * Generate a text edit operation
 */
export function generateTextEdit(
  rng: RngState,
  doc: ShadowDocument
): { op: TypedOp | null; rng: RngState } {
  const contentBlocks = Array.from(doc.blocks.values()).filter(
    (b) => b.type === "paragraph" || b.type === "heading"
  );

  const { value: block, rng: rng1 } = randomElement(rng, contentBlocks);
  if (!block) {
    return { op: null, rng: rng1 };
  }

  const textLen = block.text?.length ?? 0;
  const { value: offset, rng: rng2 } = randomInt(rng1, 0, textLen);
  const { value: insertLen, rng: rng3 } = randomInt(rng2, 1, 10);
  const { value: insertText, rng: rng4 } = randomString(rng3, insertLen);
  const { value: deleteCount, rng: rng5 } = randomInt(rng4, 0, Math.min(5, textLen - offset));

  return {
    op: {
      code: "OP_TEXT_EDIT",
      block_id: block.id,
      offset,
      delete_count: deleteCount,
      insert: insertText,
    },
    rng: rng5,
  };
}

/**
 * Generate a block split operation
 */
export function generateBlockSplit(
  rng: RngState,
  doc: ShadowDocument
): { op: TypedOp | null; rng: RngState } {
  const contentBlocks = Array.from(doc.blocks.values()).filter((b) => b.text && b.text.length > 1);

  const { value: block, rng: rng1 } = randomElement(rng, contentBlocks);
  if (!block) {
    return { op: null, rng: rng1 };
  }

  const textLen = block.text?.length ?? 0;
  const { value: offset, rng: rng2 } = randomInt(rng1, 1, textLen - 1);

  return {
    op: {
      code: "OP_BLOCK_SPLIT",
      block_id: block.id,
      offset,
    },
    rng: rng2,
  };
}

/**
 * Generate a block join operation
 */
export function generateBlockJoin(
  rng: RngState,
  doc: ShadowDocument
): { op: TypedOp | null; rng: RngState } {
  const order = doc.block_order;
  if (order.length < 2) {
    return { op: null, rng };
  }

  const { value: idx, rng: rng1 } = randomInt(rng, 0, order.length - 2);

  return {
    op: {
      code: "OP_BLOCK_JOIN",
      left_block_id: order[idx],
      right_block_id: order[idx + 1],
    },
    rng: rng1,
  };
}

/**
 * Generate a mark edit operation
 */
export function generateMarkEdit(
  rng: RngState,
  doc: ShadowDocument
): { op: TypedOp | null; rng: RngState } {
  const contentBlocks = Array.from(doc.blocks.values()).filter((b) => b.text && b.text.length > 0);

  const { value: block, rng: rng1 } = randomElement(rng, contentBlocks);
  if (!block) {
    return { op: null, rng: rng1 };
  }

  const textLen = block.text?.length ?? 0;
  const { value: start, rng: rng2 } = randomInt(rng1, 0, textLen - 1);
  const { value: end, rng: rng3 } = randomInt(rng2, start + 1, textLen);

  const marks = ["bold", "italic", "underline", "strike", "code"];
  const { value: mark, rng: rng4 } = randomElement(rng3, marks);
  const { value: addRoll, rng: rng5 } = nextRandom(rng4);

  return {
    op: {
      code: "OP_MARK_EDIT",
      block_id: block.id,
      start,
      end,
      mark: mark ?? "bold",
      add: addRoll > 0.5,
    },
    rng: rng5,
  };
}

/**
 * Generate a random operation based on document state
 */
export function generateOp(
  rng: RngState,
  doc: ShadowDocument,
  config: FuzzConfig
): { op: TypedOp | null; rng: RngState } {
  const { type, rng: rng1 } = selectOpType(rng, config.op_weights);

  switch (type) {
    case "text_burst":
      return generateTextEdit(rng1, doc);
    case "block_split":
      return generateBlockSplit(rng1, doc);
    case "block_join":
      return generateBlockJoin(rng1, doc);
    case "mark_toggle":
      return generateMarkEdit(rng1, doc);
    case "undo":
      return { op: { code: "OP_HISTORY_RESTORE", restored_blocks: [] }, rng: rng1 };
    default:
      return generateTextEdit(rng1, doc);
  }
}

/** Default fuzz configuration */
export const DEFAULT_FUZZ_CONFIG: FuzzConfig = {
  seed: 12345,
  iterations: 100,
  ops_per_iteration: 50,
  op_weights: [
    { type: "text_burst", weight: 40 },
    { type: "mark_toggle", weight: 15 },
    { type: "block_split", weight: 15 },
    { type: "block_join", weight: 10 },
    { type: "undo", weight: 5 },
    { type: "redo", weight: 5 },
    { type: "list_reparent", weight: 5 },
    { type: "table_struct", weight: 3 },
    { type: "reorder", weight: 2 },
  ],
  replicas: 2,
  network_delay_range: [0, 100],
  reorder_probability: 0.1,
  drop_probability: 0,
  duplicate_probability: 0,
  partition_schedule: [],
  link_drop_overrides: [],
  delay_bursts: [],
  max_drain_ticks: 500,
  max_op_history: 50,
  max_message_log: 200,
};
