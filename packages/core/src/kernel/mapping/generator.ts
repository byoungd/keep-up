import type { BlockMapping, MappedPosition } from "./types";

// Define supported operation types for structural mapping
// These align with the core textual and structural operations
export type MappingOperation =
  | { type: "text_edit"; blockId: string; offset: number; deleteCount: number; insert: string }
  | { type: "block_split"; blockId: string; splitOffset: number; newBlockId: string }
  | { type: "block_join"; leftBlockId: string; rightBlockId: string }
  | { type: "block_convert"; blockId: string; newType: string };

/**
 * Generate a BlockMapping for a specific operation.
 *
 * @param op The operation that modified the document structure
 * @param docState Snapshot of document state BEFORE the operation (needed for text lengths)
 */
export function generateBlockMapping(
  op: MappingOperation,
  docState: { getBlockLength: (id: string) => number }
): BlockMapping {
  switch (op.type) {
    case "text_edit":
      return new TextEditMapping(op);
    case "block_split":
      return new SplitMapping(op);
    case "block_join":
      return new JoinMapping(op, docState.getBlockLength(op.leftBlockId));
    case "block_convert":
      return new IdentityMapping(op.blockId); // ID stays same, content stays same
    default:
      return new IdentityMapping(""); // Fallback
  }
}

class TextEditMapping implements BlockMapping {
  constructor(
    private op: { blockId: string; offset: number; deleteCount: number; insert: string }
  ) {}

  mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition {
    if (oldBlockId !== this.op.blockId) {
      // Identity mapping for other blocks
      return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
    }

    const { offset, deleteCount, insert } = this.op;

    // Position before edit
    if (oldAbsInBlock < offset) {
      return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
    }

    // Position inside deleted range -> null (deleted)
    if (oldAbsInBlock < offset + deleteCount) {
      return null;
    }

    // Position after edit -> shift by net change
    const netChange = insert.length - deleteCount;
    return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock + netChange };
  }

  derivedBlocksFrom(oldBlockId: string): string[] {
    return oldBlockId === this.op.blockId ? [oldBlockId] : [];
  }
}

class SplitMapping implements BlockMapping {
  constructor(private op: { blockId: string; splitOffset: number; newBlockId: string }) {}

  mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition {
    if (oldBlockId !== this.op.blockId) {
      return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
    }

    if (oldAbsInBlock < this.op.splitOffset) {
      // Left part stays in original block
      return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
    }

    // Right part moves to new block, offset resets to 0 relative to split
    return { newBlockId: this.op.newBlockId, newAbsInBlock: oldAbsInBlock - this.op.splitOffset };
  }

  derivedBlocksFrom(oldBlockId: string): string[] {
    return oldBlockId === this.op.blockId ? [oldBlockId, this.op.newBlockId] : [];
  }
}

class JoinMapping implements BlockMapping {
  constructor(
    private op: { leftBlockId: string; rightBlockId: string },
    private leftBlockLength: number
  ) {}

  mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition {
    if (oldBlockId === this.op.leftBlockId) {
      // Left block content stays at same position in merged block (which keeps left ID)
      return { newBlockId: this.op.leftBlockId, newAbsInBlock: oldAbsInBlock };
    }

    if (oldBlockId === this.op.rightBlockId) {
      // Right block content is appended to left block
      return {
        newBlockId: this.op.leftBlockId,
        newAbsInBlock: this.leftBlockLength + oldAbsInBlock,
      };
    }

    return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
  }

  derivedBlocksFrom(oldBlockId: string): string[] {
    // Both old blocks map to the left block ID
    if (oldBlockId === this.op.leftBlockId || oldBlockId === this.op.rightBlockId) {
      return [this.op.leftBlockId];
    }
    return [];
  }

  mergedFrom(newBlockId: string): string[] {
    if (newBlockId === this.op.leftBlockId) {
      return [this.op.leftBlockId, this.op.rightBlockId];
    }
    return [];
  }
}

class IdentityMapping implements BlockMapping {
  constructor(private _targetBlockId: string) {} // Optimization hint kept for future

  mapOldToNew(oldBlockId: string, oldAbsInBlock: number): MappedPosition {
    return { newBlockId: oldBlockId, newAbsInBlock: oldAbsInBlock };
  }

  derivedBlocksFrom(oldBlockId: string): string[] {
    return [oldBlockId];
  }
}
