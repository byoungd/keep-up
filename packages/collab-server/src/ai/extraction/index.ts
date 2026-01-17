/**
 * Extraction Module
 *
 * Exports for document extraction, chunking, and embedding.
 */

// Embedding
export {
  type ChunkEmbedding,
  cosineSimilarity,
  EmbeddingService,
  type EmbeddingServiceConfig,
  findTopK,
} from "./embeddingService";

// Extractors
export {
  BaseExtractor,
  HTMLExtractor,
  MarkdownExtractor,
  TextExtractor,
} from "./extractors";

// Chunker
export { createChunker, SemanticChunker } from "./semanticChunker";
// Types
export type {
  ChunkingOptions,
  ChunkingStrategy,
  DocumentChunk,
  DocumentExtractor,
  DocumentMetadata,
  DocumentType,
  ExtractedImage,
  ExtractedLink,
  ExtractedTable,
  ExtractionOptions,
  ExtractionResult,
} from "./types";

import { HTMLExtractor, MarkdownExtractor, TextExtractor } from "./extractors";
// Extractor registry
import type { DocumentExtractor, ExtractionResult } from "./types";

/** Registry of available extractors */
const EXTRACTORS: DocumentExtractor[] = [
  new TextExtractor(),
  new MarkdownExtractor(),
  new HTMLExtractor(),
];

/**
 * Get extractor for a file.
 */
export function getExtractor(file: File | Blob, mimeType?: string): DocumentExtractor | null {
  for (const extractor of EXTRACTORS) {
    if (extractor.canExtract(file, mimeType)) {
      return extractor;
    }
  }
  return null;
}

/**
 * Extract content from any supported file.
 */
export async function extractDocument(
  file: File | Blob,
  options?: { mimeType?: string }
): Promise<ExtractionResult> {
  const extractor = getExtractor(file, options?.mimeType);

  if (!extractor) {
    return {
      success: false,
      error: "Unsupported file type",
      documentType: "unknown",
      content: "",
      metadata: {},
      images: [],
      tables: [],
      links: [],
      processingTimeMs: 0,
    };
  }

  return extractor.extract(file);
}

/**
 * Register a custom extractor.
 */
export function registerExtractor(extractor: DocumentExtractor): void {
  EXTRACTORS.unshift(extractor); // Add at beginning for priority
}
