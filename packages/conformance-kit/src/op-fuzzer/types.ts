/**
 * LFCC Conformance Kit - FuzzOp Types (Part B)
 *
 * Typed operation model aligned with LFCC op taxonomy.
 * All ops are serializable, invertible, and validate preconditions.
 */

/** Insert text at offset */
export type InsertTextOp = {
  type: "InsertText";
  blockId: string;
  offset: number;
  text: string;
};

/** Delete text at offset */
export type DeleteTextOp = {
  type: "DeleteText";
  blockId: string;
  offset: number;
  length: number;
};

/** Add mark to range */
export type AddMarkOp = {
  type: "AddMark";
  blockId: string;
  from: number;
  to: number;
  markType: string;
  attrs?: Record<string, unknown>;
};

/** Remove mark from range */
export type RemoveMarkOp = {
  type: "RemoveMark";
  blockId: string;
  from: number;
  to: number;
  markType: string;
};

/** Split block at offset (Enter key) */
export type SplitBlockOp = {
  type: "SplitBlock";
  blockId: string;
  offset: number;
};

/** Join with previous block (Backspace at start) */
export type JoinWithPrevOp = {
  type: "JoinWithPrev";
  blockId: string;
};

/** Reorder block to target index */
export type ReorderBlockOp = {
  type: "ReorderBlock";
  blockId: string;
  targetIndex: number;
};

/** Wrap blocks in list */
export type WrapInListOp = {
  type: "WrapInList";
  blockIds: string[];
  listType: "bullet" | "ordered" | "todo";
};

/** Unwrap list item */
export type UnwrapListItemOp = {
  type: "UnwrapListItem";
  blockId: string;
};

/** Insert table row */
export type TableInsertRowOp = {
  type: "TableInsertRow";
  tableBlockId: string;
  rowIndex: number;
};

/** Insert table column */
export type TableInsertColumnOp = {
  type: "TableInsertColumn";
  tableBlockId: string;
  colIndex: number;
};

/** Delete table row */
export type TableDeleteRowOp = {
  type: "TableDeleteRow";
  tableBlockId: string;
  rowIndex: number;
};

/** Delete table column */
export type TableDeleteColumnOp = {
  type: "TableDeleteColumn";
  tableBlockId: string;
  colIndex: number;
};

/** Paste sanitized canonical fragment */
export type PasteOp = {
  type: "Paste";
  blockId: string;
  offset: number;
  payload: string; // Canonical fragment JSON
};

/** Undo operation */
export type UndoOp = {
  type: "Undo";
};

/** Redo operation */
export type RedoOp = {
  type: "Redo";
};

/** Union of all fuzz operations */
export type FuzzOp =
  | InsertTextOp
  | DeleteTextOp
  | AddMarkOp
  | RemoveMarkOp
  | SplitBlockOp
  | JoinWithPrevOp
  | ReorderBlockOp
  | WrapInListOp
  | UnwrapListItemOp
  | TableInsertRowOp
  | TableInsertColumnOp
  | TableDeleteRowOp
  | TableDeleteColumnOp
  | PasteOp
  | UndoOp
  | RedoOp;

/** Operation category for classification */
export type OpCategory = "text" | "mark" | "structural" | "table" | "history";

/** Get category of an operation */
export function getOpCategory(op: FuzzOp): OpCategory {
  switch (op.type) {
    case "InsertText":
    case "DeleteText":
      return "text";
    case "AddMark":
    case "RemoveMark":
      return "mark";
    case "SplitBlock":
    case "JoinWithPrev":
    case "ReorderBlock":
    case "WrapInList":
    case "UnwrapListItem":
    case "Paste":
      return "structural";
    case "TableInsertRow":
    case "TableInsertColumn":
    case "TableDeleteRow":
    case "TableDeleteColumn":
      return "table";
    case "Undo":
    case "Redo":
      return "history";
  }
}

/** Serialize operation to JSON string */
export function serializeOp(op: FuzzOp): string {
  return JSON.stringify(op);
}

/** Deserialize operation from JSON string */
export function deserializeOp(json: string): FuzzOp {
  return JSON.parse(json) as FuzzOp;
}

/** Serialize operation list */
export function serializeOps(ops: FuzzOp[]): string {
  return JSON.stringify(ops, null, 2);
}

/** Deserialize operation list */
export function deserializeOps(json: string): FuzzOp[] {
  return JSON.parse(json) as FuzzOp[];
}
