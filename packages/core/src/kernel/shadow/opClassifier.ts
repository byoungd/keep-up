/**
 * LFCC v0.9 RC - Operation Classifier
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/03_Shadow_Model_and_Bridge_Architecture.md Section 3
 */

import type { OpCode, TypedOp } from "./types.js";

/** Editor event types (generic) */
export type EditorEvent =
  | { type: "text_insert"; block_id: string; offset: number; text: string }
  | { type: "text_delete"; block_id: string; offset: number; length: number }
  | { type: "mark_add"; block_id: string; start: number; end: number; mark: string }
  | { type: "mark_remove"; block_id: string; start: number; end: number; mark: string }
  | { type: "enter_key"; block_id: string; offset: number }
  | { type: "backspace_at_start"; block_id: string }
  | { type: "delete_at_end"; block_id: string }
  | { type: "convert_block"; block_id: string; new_type: string }
  | { type: "indent"; block_id: string }
  | { type: "outdent"; block_id: string }
  | { type: "drag_block"; block_id: string; target_parent_id: string; target_index: number }
  | { type: "table_insert_row"; table_id: string; index: number }
  | { type: "table_delete_row"; table_id: string; index: number }
  | { type: "table_insert_col"; table_id: string; index: number }
  | { type: "table_delete_col"; table_id: string; index: number }
  | { type: "table_merge_cells"; table_id: string; cells: string[] }
  | { type: "paste"; target_block_id: string; offset: number; html: string }
  | { type: "undo" }
  | { type: "redo" };

/**
 * Classify an editor event into LFCC operation codes
 */
export function classifyEvent(event: EditorEvent): OpCode[] {
  switch (event.type) {
    case "text_insert":
    case "text_delete":
      return ["OP_TEXT_EDIT"];

    case "mark_add":
    case "mark_remove":
      return ["OP_MARK_EDIT"];

    case "enter_key":
      return ["OP_BLOCK_SPLIT"];

    case "backspace_at_start":
    case "delete_at_end":
      return ["OP_BLOCK_JOIN"];

    case "convert_block":
      return ["OP_BLOCK_CONVERT"];

    case "indent":
    case "outdent":
    case "drag_block":
      return ["OP_LIST_REPARENT"];

    case "table_insert_row":
    case "table_delete_row":
    case "table_insert_col":
    case "table_delete_col":
    case "table_merge_cells":
      return ["OP_TABLE_STRUCT"];

    case "paste":
      // Paste can involve multiple operations
      return ["OP_PASTE", "OP_TEXT_EDIT"];

    case "undo":
    case "redo":
      return ["OP_HISTORY_RESTORE", "OP_IMMUTABLE_REWRITE"];

    default:
      return ["OP_TEXT_EDIT"];
  }
}

/**
 * Convert editor event to typed operation
 */
export function eventToTypedOp(event: EditorEvent): TypedOp | null {
  switch (event.type) {
    case "text_insert":
      return {
        code: "OP_TEXT_EDIT",
        block_id: event.block_id,
        offset: event.offset,
        delete_count: 0,
        insert: event.text,
      };

    case "text_delete":
      return {
        code: "OP_TEXT_EDIT",
        block_id: event.block_id,
        offset: event.offset,
        delete_count: event.length,
        insert: "",
      };

    case "mark_add":
      return {
        code: "OP_MARK_EDIT",
        block_id: event.block_id,
        start: event.start,
        end: event.end,
        mark: event.mark,
        add: true,
      };

    case "mark_remove":
      return {
        code: "OP_MARK_EDIT",
        block_id: event.block_id,
        start: event.start,
        end: event.end,
        mark: event.mark,
        add: false,
      };

    case "enter_key":
      return {
        code: "OP_BLOCK_SPLIT",
        block_id: event.block_id,
        offset: event.offset,
      };

    case "convert_block":
      return {
        code: "OP_BLOCK_CONVERT",
        block_id: event.block_id,
        new_type: event.new_type,
      };

    case "drag_block":
      return {
        code: "OP_LIST_REPARENT",
        item_id: event.block_id,
        new_parent_id: event.target_parent_id,
        new_index: event.target_index,
      };

    case "undo":
    case "redo":
      return {
        code: "OP_HISTORY_RESTORE",
        restored_blocks: [],
      };

    default:
      return null;
  }
}

/**
 * Set of structural operations (affects block boundaries)
 * Using Set for O(1) lookup instead of array.includes O(n)
 */
const STRUCTURAL_OPS: ReadonlySet<OpCode> = new Set([
  "OP_BLOCK_SPLIT",
  "OP_BLOCK_JOIN",
  "OP_BLOCK_CONVERT",
  "OP_LIST_REPARENT",
  "OP_TABLE_STRUCT",
  "OP_REORDER",
  "OP_PASTE",
]);

/**
 * Set of operations requiring full scan verification
 * Using Set for O(1) lookup instead of array.includes O(n)
 */
const FULL_SCAN_OPS: ReadonlySet<OpCode> = new Set([
  "OP_TABLE_STRUCT",
  "OP_REORDER",
  "OP_PASTE",
  "OP_HISTORY_RESTORE",
]);

/**
 * Check if operation is structural (affects block boundaries)
 */
export function isStructuralOp(code: OpCode): boolean {
  return STRUCTURAL_OPS.has(code);
}

/**
 * Check if operation requires full scan verification
 */
export function requiresFullScan(codes: OpCode[]): boolean {
  return codes.some((code) => FULL_SCAN_OPS.has(code));
}
