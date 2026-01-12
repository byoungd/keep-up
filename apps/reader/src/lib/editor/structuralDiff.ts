import { DOMParser, type Node as PMNode, type Schema } from "prosemirror-model";
/**
 * Computes a structural diff between the current document and new content.
 * Returns a transaction that applies the changes while attempting to preserve
 * block_ids and annotations.
 *
 * NOTE: This is a simplified heuristic. It assumes the new content is a refactoring
 * of the old content.
 */
export function computeStructuralDiff(
  schema: Schema,
  currentDoc: PMNode,
  newContent: string,
  _targetBlockId?: string
): PMNode {
  // 1. Parse new content into a document
  const parser = DOMParser.fromSchema(schema);
  // Create a minimal DOM to parse string
  const scratch = document.createElement("div");
  scratch.innerHTML = newContent;
  const newDoc = parser.parse(scratch);

  // 2. If targetBlockId is provided, we only replace that block
  // But usually Liquid Refactoring replaces a selection or whole doc.
  // For this optimized implementation, we'll assume we are returning
  // the *fragment* that should replace the selection.

  // 3. Heuristic: Transfer block_ids from old to new if text matches
  // This helps preserve annotations that are anchored to block_id.

  const oldBlocks = new Map<string, string>(); // text content -> block_id
  currentDoc.descendants((node) => {
    if (node.isBlock && node.attrs.block_id) {
      oldBlocks.set(node.textContent.trim(), node.attrs.block_id as string);
    }
  });

  // Build new content with preserved block_ids
  const newNodes: PMNode[] = [];
  for (let index = 0; index < newDoc.childCount; index += 1) {
    const node = newDoc.child(index);
    if (node.isBlock) {
      const text = node.textContent.trim();
      const existingId = oldBlocks.get(text);
      if (existingId) {
        // Found a match! Preserve ID.
        newNodes.push(
          node.type.create({ ...node.attrs, block_id: existingId }, node.content, node.marks)
        );
      } else {
        // Ensure new has ID
        const newId =
          node.attrs.block_id || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        newNodes.push(
          node.type.create({ ...node.attrs, block_id: newId }, node.content, node.marks)
        );
      }
    } else {
      newNodes.push(node);
    }
  }

  return newDoc.copy(
    newDoc.type.schema.nodes.doc.contentMatch.defaultType?.createAndFill()?.content ||
      newDoc.content
  );
}
