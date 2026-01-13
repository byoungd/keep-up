/**
 * LFCC v0.9 RC - Shadow Model Implementation
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/03_Shadow_Model_and_Bridge_Architecture.md
 */

import { type BlockTransform, createBlockMapping } from "../mapping/axioms.js";
import type { BlockMapping, DirtyInfo } from "../mapping/types.js";
import { validateRange } from "../utils/unicode.js";
import type { BlockIdRules, OpResult, ShadowBlock, ShadowDocument, TypedOp } from "./types.js";
import { DEFAULT_BLOCK_ID_RULES } from "./types.js";

/** Generate a new block ID */
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create an empty shadow document
 */
export function createShadowDocument(): ShadowDocument {
  const rootId = generateBlockId();
  const root: ShadowBlock = {
    id: rootId,
    type: "document",
    attrs: {},
    parent_id: null,
    children_ids: [],
  };

  const blocks = new Map<string, ShadowBlock>();
  blocks.set(rootId, root);

  return {
    root_id: rootId,
    blocks,
    block_order: [],
  };
}

/**
 * Add a block to the document
 */
export function addBlock(
  doc: ShadowDocument,
  block: Omit<ShadowBlock, "id">,
  parentId: string,
  index?: number
): { doc: ShadowDocument; blockId: string } {
  const blockId = generateBlockId();
  const newBlock: ShadowBlock = { ...block, id: blockId, parent_id: parentId };

  const newBlocks = new Map(doc.blocks);
  newBlocks.set(blockId, newBlock);

  // Update parent's children
  const parent = newBlocks.get(parentId);
  if (parent) {
    const newChildren = [...parent.children_ids];
    if (index !== undefined) {
      newChildren.splice(index, 0, blockId);
    } else {
      newChildren.push(blockId);
    }
    newBlocks.set(parentId, { ...parent, children_ids: newChildren });
  }

  // Update block order for content blocks
  const newOrder = [...doc.block_order];
  if (isContentBlock(newBlock.type)) {
    if (index !== undefined) {
      newOrder.splice(index, 0, blockId);
    } else {
      newOrder.push(blockId);
    }
  }

  return {
    doc: { ...doc, blocks: newBlocks, block_order: newOrder },
    blockId,
  };
}

/**
 * Check if block type is a content block (appears in block_order)
 */
function isContentBlock(type: string): boolean {
  return ["paragraph", "heading", "list_item", "code", "quote", "table_cell"].includes(type);
}

/**
 * Apply a typed operation to the shadow document
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: shadow logic
export function applyOp(
  doc: ShadowDocument,
  op: TypedOp,
  rules: BlockIdRules = DEFAULT_BLOCK_ID_RULES
): { doc: ShadowDocument; result: OpResult; mapping: BlockMapping; dirty: DirtyInfo } {
  const transforms: BlockTransform[] = [];
  const touchedBlocks: string[] = [];

  switch (op.code) {
    case "OP_TEXT_EDIT": {
      const block = doc.blocks.get(op.block_id);
      if (!block) {
        return createNoOpResult(doc, op);
      }

      const oldText = block.text ?? "";

      // DEFECT-001: UTF-16 Surrogate Pair Guard - Validate before operation
      const validation = validateRange(oldText, op.offset, op.offset + op.delete_count);
      if (!validation.valid) {
        // Fail-closed: Reject operation and preserve document state
        // Note: OpResult doesn't have error field, so we return empty result
        // The caller should check validation separately or we need to extend OpResult
        return createNoOpResult(doc, op);
      }

      const newText =
        oldText.slice(0, op.offset) + op.insert + oldText.slice(op.offset + op.delete_count);

      const newBlocks = new Map(doc.blocks);
      newBlocks.set(op.block_id, { ...block, text: newText });

      transforms.push({
        kind: "modified",
        oldId: op.block_id,
        newId: op.block_id,
        deltas: [
          { blockId: op.block_id, offset: op.offset, delta: op.insert.length - op.delete_count },
        ],
      });
      touchedBlocks.push(op.block_id);

      return {
        doc: { ...doc, blocks: newBlocks },
        result: {
          op,
          block_id_decisions: [{ block_id: op.block_id, decision: "KEEP_ID" }],
          new_blocks: [],
          retired_blocks: [],
        },
        mapping: createBlockMapping(transforms),
        dirty: { opCodes: [op.code], touchedBlocks },
      };
    }

    case "OP_BLOCK_SPLIT": {
      const block = doc.blocks.get(op.block_id);
      if (!block) {
        return createNoOpResult(doc, op);
      }

      const text = block.text ?? "";

      // UTF-16 surrogate guard: ensure split offset is at a valid boundary
      const splitValidation = validateRange(text, op.offset, op.offset);
      if (!splitValidation.valid) {
        return createNoOpResult(doc, op);
      }

      const leftText = text.slice(0, op.offset);
      const rightText = text.slice(op.offset);

      const newRightId = op.new_right_id ?? generateBlockId();
      const newBlocks = new Map(doc.blocks);

      // Left block keeps ID
      newBlocks.set(op.block_id, { ...block, text: leftText });

      // Right block gets new ID
      const rightBlock: ShadowBlock = {
        id: newRightId,
        type: block.type,
        attrs: { ...block.attrs },
        text: rightText,
        parent_id: block.parent_id,
        children_ids: [],
      };
      newBlocks.set(newRightId, rightBlock);

      // Update parent's children
      if (block.parent_id) {
        const parent = newBlocks.get(block.parent_id);
        if (parent) {
          const idx = parent.children_ids.indexOf(op.block_id);
          const newChildren = [...parent.children_ids];
          newChildren.splice(idx + 1, 0, newRightId);
          newBlocks.set(block.parent_id, { ...parent, children_ids: newChildren });
        }
      }

      // Update block order
      const orderIdx = doc.block_order.indexOf(op.block_id);
      const newOrder = [...doc.block_order];
      if (orderIdx !== -1) {
        newOrder.splice(orderIdx + 1, 0, newRightId);
      }

      transforms.push({
        kind: "split",
        oldId: op.block_id,
        newIds: [op.block_id, newRightId],
        splitAt: op.offset,
      });
      touchedBlocks.push(op.block_id, newRightId);

      return {
        doc: { ...doc, blocks: newBlocks, block_order: newOrder },
        result: {
          op,
          block_id_decisions: [
            { block_id: op.block_id, decision: "KEEP_ID" },
            { block_id: newRightId, decision: "REPLACE_ID", new_id: newRightId },
          ],
          new_blocks: [rightBlock],
          retired_blocks: [],
        },
        mapping: createBlockMapping(transforms),
        dirty: { opCodes: [op.code], touchedBlocks },
      };
    }

    case "OP_BLOCK_JOIN": {
      const leftBlock = doc.blocks.get(op.left_block_id);
      const rightBlock = doc.blocks.get(op.right_block_id);
      if (!leftBlock || !rightBlock) {
        return createNoOpResult(doc, op);
      }

      const joinedText = (leftBlock.text ?? "") + (rightBlock.text ?? "");
      const newBlocks = new Map(doc.blocks);

      // Left block keeps ID and gets joined content
      newBlocks.set(op.left_block_id, { ...leftBlock, text: joinedText });

      // Right block is retired
      newBlocks.delete(op.right_block_id);

      // Update parent's children
      if (rightBlock.parent_id) {
        const parent = newBlocks.get(rightBlock.parent_id);
        if (parent) {
          const newChildren = parent.children_ids.filter((id) => id !== op.right_block_id);
          newBlocks.set(rightBlock.parent_id, { ...parent, children_ids: newChildren });
        }
      }

      // Update block order
      const newOrder = doc.block_order.filter((id) => id !== op.right_block_id);

      transforms.push({
        kind: "merged",
        oldIds: [op.left_block_id, op.right_block_id],
        newId: op.left_block_id,
        oldLengths: [leftBlock.text?.length ?? 0, rightBlock.text?.length ?? 0],
      });
      touchedBlocks.push(op.left_block_id);

      return {
        doc: { ...doc, blocks: newBlocks, block_order: newOrder },
        result: {
          op,
          block_id_decisions: [
            { block_id: op.left_block_id, decision: "KEEP_ID" },
            { block_id: op.right_block_id, decision: "RETIRE" },
          ],
          new_blocks: [],
          retired_blocks: [op.right_block_id],
        },
        mapping: createBlockMapping(transforms),
        dirty: { opCodes: [op.code], touchedBlocks },
      };
    }

    case "OP_BLOCK_CONVERT": {
      const block = doc.blocks.get(op.block_id);
      if (!block) {
        return createNoOpResult(doc, op);
      }

      const decision = rules.convert;
      const newBlocks = new Map(doc.blocks);

      let newId: string | undefined;
      if (decision === "KEEP_ID") {
        newBlocks.set(op.block_id, { ...block, type: op.new_type });
        transforms.push({ kind: "unchanged", oldId: op.block_id, newId: op.block_id });
      } else {
        const replacementId = op.new_block_id ?? generateBlockId();
        newId = replacementId;
        newBlocks.delete(op.block_id);
        newBlocks.set(replacementId, { ...block, id: replacementId, type: op.new_type });

        // Update parent
        if (block.parent_id) {
          const parent = newBlocks.get(block.parent_id);
          if (parent) {
            const newChildren = parent.children_ids.map((id) =>
              id === op.block_id ? replacementId : id
            );
            newBlocks.set(block.parent_id, { ...parent, children_ids: newChildren });
          }
        }

        transforms.push({ kind: "deleted", oldId: op.block_id });
      }

      touchedBlocks.push(op.block_id);

      return {
        doc: { ...doc, blocks: newBlocks },
        result: {
          op,
          block_id_decisions: [
            {
              block_id: op.block_id,
              decision,
              new_id: decision === "REPLACE_ID" ? newId : undefined,
            },
          ],
          new_blocks: [],
          retired_blocks: decision === "REPLACE_ID" ? [op.block_id] : [],
        },
        mapping: createBlockMapping(transforms),
        dirty: { opCodes: [op.code], touchedBlocks },
      };
    }

    default:
      return createNoOpResult(doc, op);
  }
}

function createNoOpResult(
  doc: ShadowDocument,
  op: TypedOp
): { doc: ShadowDocument; result: OpResult; mapping: BlockMapping; dirty: DirtyInfo } {
  return {
    doc,
    result: {
      op,
      block_id_decisions: [],
      new_blocks: [],
      retired_blocks: [],
    },
    mapping: createBlockMapping([]),
    dirty: { opCodes: [op.code], touchedBlocks: [] },
  };
}

/**
 * Get block by ID
 */
export function getBlock(doc: ShadowDocument, blockId: string): ShadowBlock | undefined {
  return doc.blocks.get(blockId);
}

/**
 * Get all content blocks in order
 */
export function getContentBlocks(doc: ShadowDocument): ShadowBlock[] {
  return doc.block_order
    .map((id) => doc.blocks.get(id))
    .filter((b): b is ShadowBlock => b !== undefined);
}
