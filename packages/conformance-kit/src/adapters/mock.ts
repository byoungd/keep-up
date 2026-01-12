/**
 * LFCC Conformance Kit - Mock Adapters
 *
 * Dummy implementations for early bring-up and testing without real bridge.
 */

import type { CanonNode } from "@keepup/core";
import type { FuzzOp } from "../op-fuzzer/types";
import type {
  AdapterFactory,
  ApplyResult,
  BlockInfo,
  CanonicalizerAdapter,
  LoroAdapter,
  MarkInfo,
  ShadowAdapter,
} from "./types";

/** Internal block representation for mocks */
type MockBlock = {
  id: string;
  type: string;
  text: string;
  parentId: string | null;
  childIds: string[];
  marks: MarkInfo[];
};

/** Mock document state */
type MockDocState = {
  blocks: Map<string, MockBlock>;
  blockOrder: string[];
  rootId: string;
  version: number;
};

function createInitialState(): MockDocState {
  const rootId = "root";
  const blocks = new Map<string, MockBlock>();
  blocks.set(rootId, {
    id: rootId,
    type: "doc",
    text: "",
    parentId: null,
    childIds: [],
    marks: [],
  });
  return { blocks, blockOrder: [], rootId, version: 0 };
}

function serializeState(state: MockDocState): Uint8Array {
  const json = JSON.stringify({
    blocks: Array.from(state.blocks.entries()),
    blockOrder: state.blockOrder,
    rootId: state.rootId,
    version: state.version,
  });
  return new TextEncoder().encode(json);
}

function deserializeState(bytes: Uint8Array): MockDocState {
  const json = new TextDecoder().decode(bytes);
  const data = JSON.parse(json);
  return {
    blocks: new Map(data.blocks),
    blockOrder: data.blockOrder,
    rootId: data.rootId,
    version: data.version,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mock logic is complex
function applyOpToState(state: MockDocState, op: FuzzOp): ApplyResult {
  const blockId = "blockId" in op ? op.blockId : undefined;
  const block = op.type !== "Undo" && op.type !== "Redo" ? state.blocks.get(blockId ?? "") : null;

  switch (op.type) {
    case "InsertText": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      if (op.offset < 0 || op.offset > block.text.length) {
        return { success: false, error: `Invalid offset ${op.offset}` };
      }
      block.text = block.text.slice(0, op.offset) + op.text + block.text.slice(op.offset);
      state.version++;
      return { success: true };
    }

    case "DeleteText": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      if (op.offset < 0 || op.offset + op.length > block.text.length) {
        return { success: false, error: "Invalid range" };
      }
      block.text = block.text.slice(0, op.offset) + block.text.slice(op.offset + op.length);
      state.version++;
      return { success: true };
    }

    case "AddMark": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      block.marks.push({ type: op.markType, from: op.from, to: op.to, attrs: op.attrs });
      state.version++;
      return { success: true };
    }

    case "RemoveMark": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      block.marks = block.marks.filter(
        (m) => !(m.type === op.markType && m.from === op.from && m.to === op.to)
      );
      state.version++;
      return { success: true };
    }

    case "SplitBlock": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      const newId = `block-${state.version}`;
      const newBlock: MockBlock = {
        id: newId,
        type: block.type,
        text: block.text.slice(op.offset),
        parentId: block.parentId,
        childIds: [],
        marks: [],
      };
      block.text = block.text.slice(0, op.offset);
      state.blocks.set(newId, newBlock);
      const idx = state.blockOrder.indexOf(op.blockId);
      state.blockOrder.splice(idx + 1, 0, newId);
      state.version++;
      return { success: true };
    }

    case "JoinWithPrev": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      const idx = state.blockOrder.indexOf(op.blockId);
      if (idx <= 0) {
        return { success: false, error: "No previous block" };
      }
      const prevId = state.blockOrder[idx - 1];
      const prevBlock = state.blocks.get(prevId);
      if (!prevBlock) {
        return { success: false, error: "Previous block not found" };
      }
      prevBlock.text += block.text;
      state.blocks.delete(op.blockId);
      state.blockOrder.splice(idx, 1);
      state.version++;
      return { success: true };
    }

    case "ReorderBlock": {
      if (!block) {
        return { success: false, error: `Block ${op.blockId} not found` };
      }
      const idx = state.blockOrder.indexOf(op.blockId);
      if (idx === -1) {
        return { success: false, error: "Block not in order" };
      }
      state.blockOrder.splice(idx, 1);
      const targetIdx = Math.min(op.targetIndex, state.blockOrder.length);
      state.blockOrder.splice(targetIdx, 0, op.blockId);
      state.version++;
      return { success: true };
    }

    case "WrapInList":
    case "UnwrapListItem":
    case "TableInsertRow":
    case "TableInsertColumn":
    case "TableDeleteRow":
    case "TableDeleteColumn":
    case "Paste":
    case "Undo":
    case "Redo":
      // Stub implementations
      state.version++;
      return { success: true };

    default:
      return { success: false, error: "Unknown op type" };
  }
}

function stateToCanon(state: MockDocState): CanonNode {
  const children: CanonNode[] = state.blockOrder.map((id) => {
    // biome-ignore lint/style/noNonNullAssertion: mock logic
    const block = state.blocks.get(id)!;
    return {
      id: `c/${id}`,
      type: block.type,
      attrs: {},
      children: block.text
        ? // biome-ignore lint/suspicious/noExplicitAny: mock logic
          [{ text: block.text, marks: block.marks.map((m) => m.type as any), is_leaf: true }]
        : [],
    };
  });

  return {
    id: "c/root",
    type: "doc",
    attrs: {},
    children,
  };
}

/**
 * Mock Loro Adapter
 */
export class MockLoroAdapter implements LoroAdapter {
  private state: MockDocState = createInitialState();

  loadSnapshot(bytes: Uint8Array): void {
    this.state = deserializeState(bytes);
  }

  exportSnapshot(): Uint8Array {
    return serializeState(this.state);
  }

  applyOp(op: FuzzOp): ApplyResult {
    return applyOpToState(this.state, op);
  }

  getFrontierTag(): string {
    return `v${this.state.version}`;
  }

  getBlockIds(): string[] {
    return [...this.state.blockOrder];
  }

  getBlock(blockId: string): BlockInfo | null {
    const block = this.state.blocks.get(blockId);
    if (!block) {
      return null;
    }
    return {
      id: block.id,
      type: block.type,
      textLength: block.text.length,
      parentId: block.parentId,
      childIds: block.childIds,
      marks: block.marks,
    };
  }

  getTextLength(blockId: string): number {
    return this.state.blocks.get(blockId)?.text.length ?? 0;
  }

  /** For testing: add a block */
  addBlock(type: string, text: string): string {
    const id = `block-${this.state.version++}`;
    this.state.blocks.set(id, {
      id,
      type,
      text,
      parentId: this.state.rootId,
      childIds: [],
      marks: [],
    });
    this.state.blockOrder.push(id);
    return id;
  }
}

/**
 * Mock Shadow Adapter
 */
export class MockShadowAdapter implements ShadowAdapter {
  private state: MockDocState = createInitialState();

  loadSnapshot(bytes: Uint8Array): void {
    this.state = deserializeState(bytes);
  }

  exportSnapshot(): Uint8Array {
    return serializeState(this.state);
  }

  applyOp(op: FuzzOp): ApplyResult {
    return applyOpToState(this.state, op);
  }

  getBlockIds(): string[] {
    return [...this.state.blockOrder];
  }

  getBlock(blockId: string): BlockInfo | null {
    const block = this.state.blocks.get(blockId);
    if (!block) {
      return null;
    }
    return {
      id: block.id,
      type: block.type,
      textLength: block.text.length,
      parentId: block.parentId,
      childIds: block.childIds,
      marks: block.marks,
    };
  }

  getTextLength(blockId: string): number {
    return this.state.blocks.get(blockId)?.text.length ?? 0;
  }

  /** For testing: add a block */
  addBlock(type: string, text: string): string {
    const id = `block-${this.state.version++}`;
    this.state.blocks.set(id, {
      id,
      type,
      text,
      parentId: this.state.rootId,
      childIds: [],
      marks: [],
    });
    this.state.blockOrder.push(id);
    return id;
  }
}

/**
 * Mock Canonicalizer Adapter
 */
export class MockCanonicalizerAdapter implements CanonicalizerAdapter {
  canonicalizeFromLoro(loro: LoroAdapter): CanonNode {
    // For mock, we reconstruct from the adapter's exported state
    const bytes = loro.exportSnapshot();
    const state = deserializeState(bytes);
    return stateToCanon(state);
  }

  canonicalizeFromShadow(shadow: ShadowAdapter): CanonNode {
    const bytes = shadow.exportSnapshot();
    const state = deserializeState(bytes);
    return stateToCanon(state);
  }
}

/**
 * Mock Adapter Factory
 */
export class MockAdapterFactory implements AdapterFactory {
  createLoroAdapter(): LoroAdapter {
    return new MockLoroAdapter();
  }

  createShadowAdapter(): ShadowAdapter {
    return new MockShadowAdapter();
  }

  createCanonicalizerAdapter(): CanonicalizerAdapter {
    return new MockCanonicalizerAdapter();
  }
}
