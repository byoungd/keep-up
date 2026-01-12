/**
 * Normalization Types
 */

/**
 * Unified content result after normalization.
 * ready for storage.
 */
export interface ContentResult {
  title: string;
  /** Normalized plain text content for search/indexing */
  textContent: string;
  /** CRDT update binary (Loro snapshot/update) */
  crdtUpdate: Uint8Array;
  /** Metadata for the document */
  metadata: {
    author?: string;
    publishedAt?: number;
    sourceUrl?: string;
    [key: string]: unknown;
  };
}
