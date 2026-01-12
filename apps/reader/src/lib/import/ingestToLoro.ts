/**
 * Content Import Adapter
 *
 * Converts IngestionMeta from @packages/ingest-file to Loro documents
 * and saves to persistence layer.
 */

import {
  type BlockNode,
  LoroDoc,
  nextBlockId,
  serializeAttrs,
  writeBlockTree,
} from "@keepup/lfcc-bridge";

import {
  type DocMetadata,
  type DocSourceType,
  createImportedDocMetadata,
} from "@/lib/persistence/docMetadata";
import { docPersistence } from "@/lib/persistence/docPersistence";

/** IngestionMeta type matching @packages/ingest-file output */
export interface IngestionMeta {
  title: string;
  content: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ImportResult {
  docId: string;
  metadata: DocMetadata;
  snapshot: Uint8Array;
}

/**
 * Convert IngestionMeta content blocks to Loro BlockNodes.
 * Each paragraph becomes a separate block.
 */
function contentToBlocks(doc: LoroDoc, content: string): BlockNode[] {
  // Split by double newlines (paragraph separator)
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return paragraphs.map((text) => ({
    id: nextBlockId(doc),
    type: "paragraph" as const,
    attrs: serializeAttrs({}),
    text,
    children: [],
  }));
}

/**
 * Convert IngestionMeta to a Loro document snapshot.
 */
export function ingestMetaToLoroSnapshot(meta: IngestionMeta): Uint8Array {
  const doc = new LoroDoc();
  const blocks = contentToBlocks(doc, meta.content);

  // Ensure at least one empty paragraph if no content
  if (blocks.length === 0) {
    blocks.push({
      id: nextBlockId(doc),
      type: "paragraph",
      attrs: serializeAttrs({}),
      text: "",
      children: [],
    });
  }

  writeBlockTree(doc, blocks);
  return doc.export({ mode: "snapshot" });
}

/**
 * Generate a deterministic document ID from source URL.
 */
function generateDocId(sourceUrl: string): string {
  // Simple hash for now - use FNV-1a
  let hash = 2166136261;
  for (let i = 0; i < sourceUrl.length; i++) {
    hash ^= sourceUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `import_${(hash >>> 0).toString(16)}`;
}

/**
 * Import content from IngestionMeta and save to persistence.
 *
 * @param meta - The ingestion metadata from @packages/ingest-file
 * @param sourceType - The source type (github, rss, url)
 * @param sourceUrl - The original source URL
 * @returns ImportResult with docId, metadata, and snapshot
 */
export async function importFromIngestionMeta(
  meta: IngestionMeta,
  sourceType: DocSourceType,
  sourceUrl: string
): Promise<ImportResult> {
  const docId = generateDocId(sourceUrl);

  // Create Loro snapshot
  const snapshot = ingestMetaToLoroSnapshot(meta);

  // Create metadata
  const metadata = createImportedDocMetadata(docId, meta.title, sourceType, sourceUrl);
  metadata.importStatus = "imported";

  // Persist both
  await docPersistence.saveDoc(docId, snapshot);
  await docPersistence.saveMetadata(metadata);

  return { docId, metadata, snapshot };
}
