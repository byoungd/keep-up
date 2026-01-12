/**
 * Document Metadata Types
 * Used for tracking document provenance, source, and status.
 */

/** Source type for imported documents */
export type DocSourceType = "local" | "github" | "rss" | "url";

/** Import status for documents */
export type DocImportStatus = "pending" | "imported" | "failed" | "degraded";

/**
 * Document Metadata Schema
 * Stores provenance and display information for documents.
 */
export interface DocMetadata {
  /** Unique document ID (matches DocEntry.id) */
  id: string;
  /** Display title */
  title: string;
  /** Source type */
  sourceType: DocSourceType;
  /** Original source URL or locator */
  sourceUrl: string | null;
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Import status */
  importStatus: DocImportStatus;
  /** Optional error message if import failed */
  importError?: string;
  /** Optional policy manifest reference */
  policyManifestRef?: string;
}

/**
 * Create default metadata for a new local document.
 */
export function createLocalDocMetadata(id: string, title = "Untitled"): DocMetadata {
  const now = Date.now();
  return {
    id,
    title,
    sourceType: "local",
    sourceUrl: null,
    createdAt: now,
    updatedAt: now,
    importStatus: "imported",
  };
}

/**
 * Create metadata for an imported document.
 */
export function createImportedDocMetadata(
  id: string,
  title: string,
  sourceType: DocSourceType,
  sourceUrl: string
): DocMetadata {
  const now = Date.now();
  return {
    id,
    title,
    sourceType,
    sourceUrl,
    createdAt: now,
    updatedAt: now,
    importStatus: "pending",
  };
}
