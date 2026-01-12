"use client";

import { type BlockNode, LoroDoc, readBlockTree } from "@keepup/lfcc-bridge";

type UpdateEntry = {
  update: Uint8Array;
};

export function decodeContentTextFromUpdates(updates: UpdateEntry[]): string {
  if (updates.length === 0) {
    return "";
  }

  const doc = new LoroDoc();
  for (const entry of updates) {
    doc.import(entry.update);
  }

  const blocks = readBlockTree(doc);
  const lines = collectText(blocks);
  return lines.join("\n\n");
}

function collectText(blocks: BlockNode[]): string[] {
  const lines: string[] = [];
  const visit = (block: BlockNode) => {
    if (block.text) {
      lines.push(block.text);
    }
    for (const child of block.children) {
      visit(child);
    }
  };
  for (const block of blocks) {
    visit(block);
  }
  return lines;
}
