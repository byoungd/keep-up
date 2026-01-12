/**
 * LFCC Conformance Kit - Operation Generator (Part C)
 *
 * Seeded generator for valid random operation programs.
 */

import type { LoroAdapter } from "../adapters/types";
import { type RngState, createRng, nextInt, nextString, selectOne, selectWeighted } from "./rng";
import type { FuzzOp } from "./types";

/** Generator configuration */
export type GenConfig = {
  /** Probability weights for operation types */
  opWeights: OpWeights;
  /** Stress mode configuration */
  stressMode?: StressMode;
  /** Maximum text insert length */
  maxInsertLength: number;
  /** Maximum delete length */
  maxDeleteLength: number;
  /** Available mark types */
  markTypes: string[];
  /** Available list types */
  listTypes: Array<"bullet" | "ordered" | "todo">;
};

/** Operation type weights */
export type OpWeights = {
  insertText: number;
  deleteText: number;
  addMark: number;
  removeMark: number;
  splitBlock: number;
  joinWithPrev: number;
  reorderBlock: number;
  wrapInList: number;
  unwrapListItem: number;
  tableInsertRow: number;
  tableInsertColumn: number;
  tableDeleteRow: number;
  tableDeleteColumn: number;
  paste: number;
  undo: number;
  redo: number;
};

/** Stress mode types */
export type StressMode = "typingBurst" | "structureStorm" | "markChaos" | "balanced";

/** Default configuration */
export const DEFAULT_GEN_CONFIG: GenConfig = {
  opWeights: {
    insertText: 30,
    deleteText: 15,
    addMark: 10,
    removeMark: 5,
    splitBlock: 10,
    joinWithPrev: 5,
    reorderBlock: 5,
    wrapInList: 3,
    unwrapListItem: 2,
    tableInsertRow: 2,
    tableInsertColumn: 2,
    tableDeleteRow: 1,
    tableDeleteColumn: 1,
    paste: 5,
    undo: 2,
    redo: 2,
  },
  maxInsertLength: 50,
  maxDeleteLength: 20,
  markTypes: ["bold", "italic", "underline", "strike", "code", "link"],
  listTypes: ["bullet", "ordered", "todo"],
};

/** Stress mode configurations */
const STRESS_CONFIGS: Record<StressMode, Partial<OpWeights>> = {
  typingBurst: {
    insertText: 60,
    deleteText: 25,
    addMark: 5,
    removeMark: 2,
    splitBlock: 5,
    joinWithPrev: 2,
    reorderBlock: 1,
  },
  structureStorm: {
    insertText: 8,
    deleteText: 4,
    addMark: 10,
    removeMark: 6,
    splitBlock: 22,
    joinWithPrev: 15,
    reorderBlock: 18,
    wrapInList: 10,
    unwrapListItem: 6,
    tableInsertRow: 4,
    tableInsertColumn: 4,
    tableDeleteRow: 3,
    tableDeleteColumn: 3,
    paste: 8,
  },
  markChaos: {
    insertText: 20,
    addMark: 35,
    removeMark: 25,
    deleteText: 10,
    splitBlock: 5,
    joinWithPrev: 5,
  },
  balanced: {},
};

/** Internal document model for generator */
type DocModel = {
  blocks: Map<string, BlockModel>;
  blockOrder: string[];
};

type BlockModel = {
  id: string;
  type: string;
  textLength: number;
  marks: Array<{ type: string; from: number; to: number }>;
};

/**
 * Generate a program of valid random operations
 */
export function generateProgram(
  seed: number,
  steps: number,
  config: GenConfig,
  adapter: LoroAdapter
): FuzzOp[] {
  const ops: FuzzOp[] = [];
  let rng = createRng(seed);

  // Apply stress mode weights
  const weights = config.stressMode
    ? { ...config.opWeights, ...STRESS_CONFIGS[config.stressMode] }
    : config.opWeights;

  // Build internal model from adapter
  const model = buildModel(adapter);

  for (let i = 0; i < steps; i++) {
    const { op, rng: newRng } = generateOp(rng, model, weights, config);
    rng = newRng;

    if (op) {
      ops.push(op);
      applyToModel(model, op);
    }
  }

  return ops;
}

/**
 * Build internal model from adapter
 */
function buildModel(adapter: LoroAdapter): DocModel {
  const blocks = new Map<string, BlockModel>();
  const blockOrder = adapter.getBlockIds();

  for (const id of blockOrder) {
    const info = adapter.getBlock(id);
    if (info) {
      blocks.set(id, {
        id: info.id,
        type: info.type,
        textLength: info.textLength,
        marks: info.marks.map((m) => ({ type: m.type, from: m.from, to: m.to })),
      });
    }
  }

  return { blocks, blockOrder };
}

/**
 * Apply operation to internal model
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: model logic
function applyToModel(model: DocModel, op: FuzzOp): void {
  switch (op.type) {
    case "InsertText": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        block.textLength += op.text.length;
      }
      break;
    }
    case "DeleteText": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        block.textLength = Math.max(0, block.textLength - op.length);
      }
      break;
    }
    case "AddMark": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        block.marks.push({ type: op.markType, from: op.from, to: op.to });
      }
      break;
    }
    case "RemoveMark": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        block.marks = block.marks.filter(
          (m) => !(m.type === op.markType && m.from === op.from && m.to === op.to)
        );
      }
      break;
    }
    case "SplitBlock": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        // Use deterministic ID based on block order length
        const newId = `gen-split-${model.blockOrder.length}`;
        const newBlock: BlockModel = {
          id: newId,
          type: block.type,
          textLength: block.textLength - op.offset,
          marks: [],
        };
        block.textLength = op.offset;
        model.blocks.set(newId, newBlock);
        const idx = model.blockOrder.indexOf(op.blockId);
        model.blockOrder.splice(idx + 1, 0, newId);
      }
      break;
    }
    case "JoinWithPrev": {
      const idx = model.blockOrder.indexOf(op.blockId);
      if (idx > 0) {
        const prevId = model.blockOrder[idx - 1];
        const prevBlock = model.blocks.get(prevId);
        const block = model.blocks.get(op.blockId);
        if (prevBlock && block) {
          prevBlock.textLength += block.textLength;
        }
        model.blocks.delete(op.blockId);
        model.blockOrder.splice(idx, 1);
      }
      break;
    }
    case "ReorderBlock": {
      const idx = model.blockOrder.indexOf(op.blockId);
      if (idx !== -1) {
        model.blockOrder.splice(idx, 1);
        const targetIdx = Math.min(op.targetIndex, model.blockOrder.length);
        model.blockOrder.splice(targetIdx, 0, op.blockId);
      }
      break;
    }
    case "WrapInList": {
      for (const id of op.blockIds) {
        const block = model.blocks.get(id);
        if (block) {
          block.type = "listItem";
        }
      }
      break;
    }
    case "UnwrapListItem": {
      const block = model.blocks.get(op.blockId);
      if (block) {
        block.type = "paragraph";
      }
      break;
    }
  }
}

type MarkRange = { from: number; to: number; rng: RngState };

function pickRandomMarkRange(rng: RngState, block: BlockModel): MarkRange | null {
  if (block.textLength < 2) {
    return null;
  }
  const { value: from, rng: rng1 } = nextInt(rng, 0, block.textLength - 1);
  const { value: to, rng: rng2 } = nextInt(rng1, from + 1, block.textLength);
  return { from, to, rng: rng2 };
}

function pickOverlappingMarkRange(rng: RngState, block: BlockModel): MarkRange | null {
  if (block.textLength < 2 || block.marks.length === 0) {
    return null;
  }

  const { value: baseMark, rng: rng1 } = selectOne(rng, block.marks);
  if (!baseMark) {
    return null;
  }

  const maxStart = Math.max(0, Math.min(baseMark.to - 1, block.textLength - 2));
  const minStart = Math.min(baseMark.from, maxStart);
  const { value: from, rng: rng2 } = nextInt(rng1, minStart, maxStart);
  const { value: to, rng: rng3 } = nextInt(rng2, from + 1, block.textLength);

  return { from, to, rng: rng3 };
}

function pickMarkRange(rng: RngState, block: BlockModel, config: GenConfig): MarkRange | null {
  const preferOverlap = config.stressMode === "structureStorm" || config.stressMode === "markChaos";
  if (preferOverlap) {
    const overlap = pickOverlappingMarkRange(rng, block);
    if (overlap) {
      return overlap;
    }
  }
  return pickRandomMarkRange(rng, block);
}

/**
 * Generate a single valid operation
 */
function generateOp(
  rng: RngState,
  model: DocModel,
  weights: OpWeights,
  config: GenConfig
): { op: FuzzOp | null; rng: RngState } {
  // Build weighted selection
  const items = [
    { item: "insertText" as const, weight: weights.insertText },
    { item: "deleteText" as const, weight: weights.deleteText },
    { item: "addMark" as const, weight: weights.addMark },
    { item: "removeMark" as const, weight: weights.removeMark },
    { item: "splitBlock" as const, weight: weights.splitBlock },
    { item: "joinWithPrev" as const, weight: weights.joinWithPrev },
    { item: "reorderBlock" as const, weight: weights.reorderBlock },
    { item: "wrapInList" as const, weight: weights.wrapInList },
    { item: "unwrapListItem" as const, weight: weights.unwrapListItem },
    { item: "tableInsertRow" as const, weight: weights.tableInsertRow },
    { item: "tableInsertColumn" as const, weight: weights.tableInsertColumn },
    { item: "tableDeleteRow" as const, weight: weights.tableDeleteRow },
    { item: "tableDeleteColumn" as const, weight: weights.tableDeleteColumn },
    { item: "paste" as const, weight: weights.paste },
    { item: "undo" as const, weight: weights.undo },
    { item: "redo" as const, weight: weights.redo },
  ];

  const { value: opType, rng: rng1 } = selectWeighted(rng, items);
  if (!opType) {
    return { op: null, rng: rng1 };
  }

  return generateSpecificOp(rng1, model, opType, config);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: generator logic
function generateSpecificOp(
  rng: RngState,
  model: DocModel,
  opType: string,
  config: GenConfig
): { op: FuzzOp | null; rng: RngState } {
  const blocks = Array.from(model.blocks.values());
  const textBlocks = blocks.filter((b) => b.type === "paragraph" || b.type === "heading");

  switch (opType) {
    case "insertText": {
      const { value: block, rng: rng1 } = selectOne(rng, textBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const { value: offset, rng: rng2 } = nextInt(rng1, 0, block.textLength);
      const { value: len, rng: rng3 } = nextInt(rng2, 1, config.maxInsertLength);
      const { value: text, rng: rng4 } = nextString(rng3, len);
      return {
        op: { type: "InsertText", blockId: block.id, offset, text },
        rng: rng4,
      };
    }

    case "deleteText": {
      const nonEmptyBlocks = textBlocks.filter((b) => b.textLength > 0);
      const { value: block, rng: rng1 } = selectOne(rng, nonEmptyBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const { value: offset, rng: rng2 } = nextInt(rng1, 0, block.textLength - 1);
      const maxLen = Math.min(config.maxDeleteLength, block.textLength - offset);
      const { value: length, rng: rng3 } = nextInt(rng2, 1, maxLen);
      return {
        op: { type: "DeleteText", blockId: block.id, offset, length },
        rng: rng3,
      };
    }

    case "addMark": {
      const nonEmptyBlocks = textBlocks.filter((b) => b.textLength > 0);
      const { value: block, rng: rng1 } = selectOne(rng, nonEmptyBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const range = pickMarkRange(rng1, block, config);
      if (!range) {
        return { op: null, rng: rng1 };
      }
      const { from, to, rng: rng2 } = range;
      const { value: markType, rng: rng3 } = selectOne(rng2, config.markTypes);
      if (!markType) {
        return { op: null, rng: rng3 };
      }
      return {
        op: { type: "AddMark", blockId: block.id, from, to, markType },
        rng: rng3,
      };
    }

    case "removeMark": {
      const blocksWithMarks = textBlocks.filter((b) => b.marks.length > 0);
      const { value: block, rng: rng1 } = selectOne(rng, blocksWithMarks);
      if (!block || block.marks.length === 0) {
        return { op: null, rng: rng1 };
      }
      const { value: mark, rng: rng2 } = selectOne(rng1, block.marks);
      if (!mark) {
        return { op: null, rng: rng2 };
      }
      return {
        op: {
          type: "RemoveMark",
          blockId: block.id,
          from: mark.from,
          to: mark.to,
          markType: mark.type,
        },
        rng: rng2,
      };
    }

    case "splitBlock": {
      const splittableBlocks = textBlocks.filter((b) => b.textLength > 1);
      const { value: block, rng: rng1 } = selectOne(rng, splittableBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const { value: offset, rng: rng2 } = nextInt(rng1, 1, block.textLength - 1);
      return {
        op: { type: "SplitBlock", blockId: block.id, offset },
        rng: rng2,
      };
    }

    case "joinWithPrev": {
      const joinableBlocks = model.blockOrder
        .slice(1)
        .map((id) => model.blocks.get(id))
        .filter((b): b is BlockModel => !!b && (b.type === "paragraph" || b.type === "heading"));
      const { value: block, rng: rng1 } = selectOne(rng, joinableBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      return {
        op: { type: "JoinWithPrev", blockId: block.id },
        rng: rng1,
      };
    }

    case "reorderBlock": {
      if (model.blockOrder.length < 2) {
        return { op: null, rng };
      }
      const { value: blockId, rng: rng1 } = selectOne(rng, model.blockOrder);
      if (!blockId) {
        return { op: null, rng: rng1 };
      }
      const { value: targetIndex, rng: rng2 } = nextInt(rng1, 0, model.blockOrder.length - 1);
      return {
        op: { type: "ReorderBlock", blockId, targetIndex },
        rng: rng2,
      };
    }

    case "wrapInList": {
      const { value: block, rng: rng1 } = selectOne(rng, textBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const { value: listType, rng: rng2 } = selectOne(rng1, config.listTypes);
      if (!listType) {
        return { op: null, rng: rng2 };
      }
      return {
        op: { type: "WrapInList", blockIds: [block.id], listType },
        rng: rng2,
      };
    }

    case "unwrapListItem": {
      const listItems = blocks.filter((b) => b.type === "listItem");
      const { value: block, rng: rng1 } = selectOne(rng, listItems);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      return {
        op: { type: "UnwrapListItem", blockId: block.id },
        rng: rng1,
      };
    }

    case "tableInsertRow":
    case "tableDeleteRow":
    case "tableInsertColumn":
    case "tableDeleteColumn": {
      const tables = blocks.filter((b) => b.type === "table");
      const { value: table, rng: rng1 } = selectOne(rng, tables);
      if (!table) {
        return { op: null, rng: rng1 };
      }
      const { value: index, rng: rng2 } = nextInt(rng1, 0, 4);
      if (opType === "tableInsertRow") {
        return {
          op: { type: "TableInsertRow", tableBlockId: table.id, rowIndex: index },
          rng: rng2,
        };
      }
      if (opType === "tableDeleteRow") {
        return {
          op: { type: "TableDeleteRow", tableBlockId: table.id, rowIndex: index },
          rng: rng2,
        };
      }
      if (opType === "tableInsertColumn") {
        return {
          op: { type: "TableInsertColumn", tableBlockId: table.id, colIndex: index },
          rng: rng2,
        };
      }
      return {
        op: { type: "TableDeleteColumn", tableBlockId: table.id, colIndex: index },
        rng: rng2,
      };
    }

    case "paste": {
      const { value: block, rng: rng1 } = selectOne(rng, textBlocks);
      if (!block) {
        return { op: null, rng: rng1 };
      }
      const { value: offset, rng: rng2 } = nextInt(rng1, 0, block.textLength);
      const { value: text, rng: rng3 } = nextString(rng2, 20);
      const payload = JSON.stringify({ type: "text", content: text });
      return {
        op: { type: "Paste", blockId: block.id, offset, payload },
        rng: rng3,
      };
    }

    case "undo":
      return { op: { type: "Undo" }, rng };

    case "redo":
      return { op: { type: "Redo" }, rng };

    default:
      return { op: null, rng };
  }
}

/**
 * Export program to JSON for replay
 */
export function exportProgram(
  seed: number,
  steps: number,
  config: GenConfig,
  ops: FuzzOp[]
): string {
  return JSON.stringify({ seed, steps, config, ops }, null, 2);
}

/**
 * Import program from JSON
 */
export function importProgram(json: string): {
  seed: number;
  steps: number;
  config: GenConfig;
  ops: FuzzOp[];
} {
  return JSON.parse(json);
}
