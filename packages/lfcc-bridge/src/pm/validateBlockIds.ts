import { observability } from "@ku0/core";
import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";

export type BlockIdValidation = {
  missing: Array<{ pos: number; type: string }>;
  duplicates: string[];
};

const isBlockNode = (node: PMNode): boolean => {
  if (node.type.name === "doc") {
    return false;
  }

  const group = node.type.spec.group ?? "";
  return node.isBlock && group.split(" ").includes("block");
};

const logger = observability.getLogger();

export function validateBlockIds(doc: PMNode): BlockIdValidation {
  const missing: Array<{ pos: number; type: string }> = [];
  const duplicates: string[] = [];
  const seen = new Set<string>();

  doc.descendants((node, pos) => {
    if (!isBlockNode(node)) {
      return;
    }

    const blockId = node.attrs.block_id;
    if (typeof blockId !== "string" || blockId.trim() === "") {
      missing.push({ pos, type: node.type.name });
      return;
    }

    if (seen.has(blockId)) {
      duplicates.push(blockId);
      return;
    }

    seen.add(blockId);
  });

  return { missing, duplicates };
}

export function assertBlockIds(doc: PMNode): void {
  const { missing, duplicates } = validateBlockIds(doc);
  if (missing.length === 0 && duplicates.length === 0) {
    return;
  }

  const issues: string[] = [];
  if (missing.length > 0) {
    issues.push(
      `missing block_id at ${missing.map((entry) => `${entry.type}@${entry.pos}`).join(", ")}`
    );
  }
  if (duplicates.length > 0) {
    issues.push(`duplicate block_id ${[...new Set(duplicates)].join(", ")}`);
  }

  throw new Error(`Invalid block_id usage: ${issues.join("; ")}`);
}

export function assignMissingBlockIds(
  state: EditorState,
  nextId: () => string
): Transaction | null {
  let tr = state.tr;
  let changed = false;
  const seen = new Set<string>();

  state.doc.descendants((node, pos) => {
    if (!isBlockNode(node)) {
      return;
    }

    const blockId = node.attrs.block_id;
    const hasBlockId = typeof blockId === "string" && blockId.trim() !== "";
    const isDuplicate = hasBlockId && seen.has(blockId);

    if (hasBlockId && !isDuplicate) {
      seen.add(blockId);
      return;
    }

    const newId = nextId();
    logger.info("mapping", "Assigning missing block id", {
      blockId: newId,
      nodeType: node.type.name,
      hasBlockId,
      isDuplicate,
    });

    const attrs = { ...node.attrs, block_id: newId };
    tr = tr.setNodeMarkup(pos, node.type, attrs, node.marks);
    changed = true;
    seen.add(newId);
  });

  return changed ? tr : null;
}
