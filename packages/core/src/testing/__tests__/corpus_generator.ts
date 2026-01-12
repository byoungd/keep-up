/**
 * LFCC v0.9 RC - Seed Corpus Generator
 * @see docs/product/Audit/enhance/stage3/agent_1_conformance.md
 *
 * Generates a seed corpus of valid operations for fuzz testing.
 * The corpus provides starting points for mutation-based fuzzing.
 */

import { addBlock, createShadowDocument } from "../../kernel/shadow/shadowModel";
import type { ShadowDocument, TypedOp } from "../../kernel/shadow/types";
import { DEFAULT_FUZZ_CONFIG, createRng, generateOp } from "../../kernel/testing/generators";
import type { FuzzConfig } from "../../kernel/testing/types";

// ============================================================================
// Corpus Types
// ============================================================================

export interface CorpusEntry {
  /** Unique identifier for this entry */
  id: string;
  /** The operation to replay */
  op: TypedOp;
  /** Document state before applying op */
  document_hash: string;
  /** Category for filtering */
  category: OpCategory;
}

export type OpCategory =
  | "text_insert"
  | "text_delete"
  | "block_split"
  | "block_join"
  | "mark_add"
  | "mark_remove"
  | "structural"
  | "edge_case";

export interface CorpusConfig {
  /** Number of entries per category */
  entries_per_category: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Include edge case entries */
  include_edge_cases: boolean;
}

export const DEFAULT_CORPUS_CONFIG: CorpusConfig = {
  entries_per_category: 10,
  seed: 42,
  include_edge_cases: true,
};

// ============================================================================
// Corpus Generation
// ============================================================================

/**
 * Generate a seed corpus of valid operations.
 */
export function generateSeedCorpus(config: CorpusConfig = DEFAULT_CORPUS_CONFIG): CorpusEntry[] {
  const entries: CorpusEntry[] = [];

  // Generate entries for each category
  entries.push(...generateTextOps(config, "text_insert"));
  entries.push(...generateTextOps(config, "text_delete"));
  entries.push(...generateStructuralOps(config, "block_split"));
  entries.push(...generateStructuralOps(config, "block_join"));
  entries.push(...generateMarkOps(config, "mark_add"));
  entries.push(...generateMarkOps(config, "mark_remove"));

  if (config.include_edge_cases) {
    entries.push(...generateEdgeCases(config));
  }

  return entries;
}

function generateTextOps(config: CorpusConfig, category: OpCategory): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const doc = createBaseDocument();
  let rng = createRng(config.seed);

  const fuzzConfig: FuzzConfig = {
    ...DEFAULT_FUZZ_CONFIG,
    seed: config.seed,
    iterations: 1,
    ops_per_iteration: 1,
    replicas: 1,
    reorder_probability: 0,
    op_weights: [{ type: "text_burst", weight: 1.0 }],
    network_delay_range: [0, 0],
  };

  for (let i = 0; i < config.entries_per_category; i++) {
    const { op, rng: nextRng } = generateOp(rng, doc, fuzzConfig);
    rng = nextRng;

    if (op) {
      entries.push({
        id: `${category}-${i}`,
        op,
        document_hash: computeSimpleHash(doc),
        category,
      });
    }
  }

  return entries;
}

function generateStructuralOps(config: CorpusConfig, category: OpCategory): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const doc = createBaseDocument();

  // Generate split/join ops based on category
  const blockIds = Array.from(doc.blocks.keys()).filter((id) => id !== doc.root_id);

  for (let i = 0; i < Math.min(config.entries_per_category, blockIds.length); i++) {
    const blockId = blockIds[i];
    const block = doc.blocks.get(blockId);

    if (!block) {
      continue;
    }

    if (category === "block_split") {
      const splitPos = Math.floor((block.text?.length ?? 0) / 2);
      entries.push({
        id: `${category}-${i}`,
        op: {
          code: "OP_BLOCK_SPLIT",
          block_id: blockId,
          offset: splitPos,
        } as TypedOp,
        document_hash: computeSimpleHash(doc),
        category,
      });
    } else if (category === "block_join" && i < blockIds.length - 1) {
      entries.push({
        id: `${category}-${i}`,
        op: {
          code: "OP_BLOCK_JOIN",
          left_block_id: blockId,
          right_block_id: blockIds[i + 1],
        } as TypedOp,
        document_hash: computeSimpleHash(doc),
        category,
      });
    }
  }

  return entries;
}

function generateMarkOps(config: CorpusConfig, category: OpCategory): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const doc = createBaseDocument();
  const blockIds = Array.from(doc.blocks.keys()).filter((id) => id !== doc.root_id);

  const marks = ["bold", "italic", "underline", "code", "link"];

  for (let i = 0; i < Math.min(config.entries_per_category, blockIds.length * marks.length); i++) {
    const blockId = blockIds[i % blockIds.length];
    const mark = marks[i % marks.length];
    const block = doc.blocks.get(blockId);

    if (!block || !block.text) {
      continue;
    }

    const start = 0;
    const end = Math.min(5, block.text.length);

    if (category === "mark_add") {
      entries.push({
        id: `${category}-${i}`,
        op: {
          code: "OP_MARK_EDIT",
          block_id: blockId,
          start,
          end,
          mark,
          add: true,
        } as TypedOp,
        document_hash: computeSimpleHash(doc),
        category,
      });
    } else {
      entries.push({
        id: `${category}-${i}`,
        op: {
          code: "OP_MARK_EDIT",
          block_id: blockId,
          start,
          end,
          mark,
          add: false,
        } as TypedOp,
        document_hash: computeSimpleHash(doc),
        category,
      });
    }
  }

  return entries;
}

function generateEdgeCases(_config: CorpusConfig): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const doc = createBaseDocument();
  const blockIds = Array.from(doc.blocks.keys()).filter((id) => id !== doc.root_id);

  if (blockIds.length === 0) {
    return entries;
  }

  const blockId = blockIds[0];
  const block = doc.blocks.get(blockId);
  const textLen = block?.text?.length ?? 0;

  // Edge case: Empty insert
  entries.push({
    id: "edge-empty-insert",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: 0,
      delete_count: 0,
      insert: "",
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  // Edge case: Insert at end
  entries.push({
    id: "edge-insert-end",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: textLen,
      delete_count: 0,
      insert: "X",
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  // Edge case: Delete entire block text
  if (textLen > 0) {
    entries.push({
      id: "edge-delete-all",
      op: {
        code: "OP_TEXT_EDIT",
        block_id: blockId,
        offset: 0,
        delete_count: textLen,
        insert: "",
      } as TypedOp,
      document_hash: computeSimpleHash(doc),
      category: "edge_case",
    });
  }

  // Edge case: Unicode (emoji)
  entries.push({
    id: "edge-unicode-emoji",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: 0,
      delete_count: 0,
      insert: "🎉🌍👍",
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  // Edge case: Surrogate pair
  entries.push({
    id: "edge-surrogate-pair",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: 0,
      delete_count: 0,
      insert: "\uD83D\uDE00", // 😀 as surrogate pair
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  // Edge case: Chinese characters
  entries.push({
    id: "edge-cjk",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: 0,
      delete_count: 0,
      insert: "你好世界",
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  // Edge case: Very long text
  entries.push({
    id: "edge-long-text",
    op: {
      code: "OP_TEXT_EDIT",
      block_id: blockId,
      offset: 0,
      delete_count: 0,
      insert: "A".repeat(10000),
    } as TypedOp,
    document_hash: computeSimpleHash(doc),
    category: "edge_case",
  });

  return entries;
}

// ============================================================================
// Helpers
// ============================================================================

function createBaseDocument(): ShadowDocument {
  const doc = createShadowDocument();

  const { doc: doc1 } = addBlock(
    doc,
    { type: "paragraph", attrs: {}, text: "Hello world", parent_id: null, children_ids: [] },
    doc.root_id
  );

  const { doc: doc2 } = addBlock(
    doc1,
    { type: "paragraph", attrs: {}, text: "Test paragraph", parent_id: null, children_ids: [] },
    doc1.root_id
  );

  const { doc: doc3 } = addBlock(
    doc2,
    { type: "paragraph", attrs: {}, text: "Final block", parent_id: null, children_ids: [] },
    doc2.root_id
  );

  return doc3;
}

function computeSimpleHash(doc: ShadowDocument): string {
  const content = Array.from(doc.blocks.values())
    .map((b) => `${b.type}:${b.text ?? ""}`)
    .join("|");

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ============================================================================
// Export Corpus to File (for CI)
// ============================================================================

export function serializeCorpus(entries: CorpusEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function deserializeCorpus(json: string): CorpusEntry[] {
  return JSON.parse(json) as CorpusEntry[];
}
