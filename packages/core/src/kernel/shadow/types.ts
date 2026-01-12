/**
 * LFCC v0.9 RC - Shadow Model Types
 * @see docs/product/LFCC_v0.9_RC_Engineering_Docs/03_Shadow_Model_and_Bridge_Architecture.md
 */

/** Operation codes for editor transactions */
export type OpCode =
  | "OP_TEXT_EDIT"
  | "OP_MARK_EDIT"
  | "OP_BLOCK_SPLIT"
  | "OP_BLOCK_JOIN"
  | "OP_BLOCK_CONVERT"
  | "OP_LIST_REPARENT"
  | "OP_TABLE_STRUCT"
  | "OP_REORDER"
  | "OP_PASTE"
  | "OP_IMMUTABLE_REWRITE"
  | "OP_HISTORY_RESTORE";

/** Block identity decision */
export type BlockIdDecision = "KEEP_ID" | "REPLACE_ID" | "RETIRE";

/** Shadow block structure */
export type ShadowBlock = {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  text?: string;
  parent_id: string | null;
  children_ids: string[];
};

/** Shadow document structure */
export type ShadowDocument = {
  root_id: string;
  blocks: Map<string, ShadowBlock>;
  block_order: string[]; // Content blocks in document order
};

/** Typed operation from editor */
export type TypedOp =
  | { code: "OP_TEXT_EDIT"; block_id: string; offset: number; delete_count: number; insert: string }
  | {
      code: "OP_MARK_EDIT";
      block_id: string;
      start: number;
      end: number;
      mark: string;
      add: boolean;
    }
  | { code: "OP_BLOCK_SPLIT"; block_id: string; offset: number; new_right_id?: string }
  | { code: "OP_BLOCK_JOIN"; left_block_id: string; right_block_id: string }
  | { code: "OP_BLOCK_CONVERT"; block_id: string; new_type: string; new_block_id?: string }
  | { code: "OP_LIST_REPARENT"; item_id: string; new_parent_id: string; new_index: number }
  | { code: "OP_TABLE_STRUCT"; table_id: string; action: string; params: Record<string, unknown> }
  | { code: "OP_REORDER"; block_ids: string[]; new_order: number[] }
  | { code: "OP_PASTE"; target_block_id: string; offset: number; content: ShadowBlock[] }
  | { code: "OP_IMMUTABLE_REWRITE"; affected_blocks: string[] }
  | { code: "OP_HISTORY_RESTORE"; restored_blocks: string[] };

/** Result of applying an operation */
export type OpResult = {
  op: TypedOp;
  block_id_decisions: Array<{ block_id: string; decision: BlockIdDecision; new_id?: string }>;
  new_blocks: ShadowBlock[];
  retired_blocks: string[];
};

/** Block ID policy rules */
export type BlockIdRules = {
  /** Split: left keeps ID, right gets new ID */
  split: { left: "KEEP_ID"; right: "REPLACE_ID" };
  /** Join: result keeps left ID, right retired */
  join: { result: "KEEP_ID"; retired: "RETIRE" };
  /** Convert: configurable */
  convert: BlockIdDecision;
  /** Reparent: configurable */
  reparent: BlockIdDecision;
  /** Table struct: configurable */
  table_struct: BlockIdDecision;
};

/** Default block ID rules per LFCC spec */
export const DEFAULT_BLOCK_ID_RULES: BlockIdRules = {
  split: { left: "KEEP_ID", right: "REPLACE_ID" },
  join: { result: "KEEP_ID", retired: "RETIRE" },
  convert: "REPLACE_ID",
  reparent: "KEEP_ID",
  table_struct: "REPLACE_ID",
};
