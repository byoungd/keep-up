/**
 * Import Types
 *
 * Types for the content import engine.
 */

import type { ImportJobStatus, ImportSourceType } from "../driver/types";

/** Input for creating an import job */
export interface CreateImportJobInput {
  sourceType: ImportSourceType;
  sourceRef: string;
  parserVersion?: string;
}

/** Config for ImportManager */
export interface ImportManagerConfig {
  /** Max concurrent imports (default: 2) */
  concurrency?: number;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelayMs?: number;
  /** Interval for checking retry-ready jobs in ms (default: 5000) */
  retryCheckIntervalMs?: number;
}

/** Import job event types */
export interface ImportManagerEvents {
  onJobProgress?: (jobId: string, progress: number) => void;
  onJobComplete?: (jobId: string, documentId: string) => void;
  onJobFailed?: (jobId: string, error: Error) => void;
  onJobStatusChange?: (jobId: string, status: ImportJobStatus) => void;
  onJobDeleted?: (jobId: string) => void;
}

/** Ingestor function signature */
export type IngestorFn = (
  sourceRef: string,
  onProgress: (progress: number) => void
) => Promise<IngestResult>;

/** Result from an ingestor */
export interface IngestResult {
  title: string;
  contentHtml?: string;
  contentMarkdown?: string;
  canonicalUrl?: string;
  author?: string;
  publishedAt?: number;
  contentHash: string;
  rawMetadata?: Record<string, unknown>;
  /** Optional asset info if raw content was stored */
  assetInfo?: {
    assetId: string;
    assetHash: string;
    byteSize: number;
    mimeType: string;
    storagePath: string;
    storageProvider: "opfs" | "idb";
  };
}

// ============ Raw Asset ============

export type StorageProvider = "opfs" | "idb";

export interface RawAsset {
  assetId: string;
  assetHash: string; // SHA-256 of content bytes
  byteSize: number;
  mimeType: string;
  sourceType: ImportSourceType;
  sourceRef: string; // Canonical URL, file fingerprint, RSS GUID, etc.
  storageProvider: StorageProvider;
  storagePath: string;
  parserHint?: string; // e.g., "markdown", "html", "pdf"
  ingestMetaJson?: string; // JSON with etag, headers, file meta
  createdAt: number;
}

export interface CreateRawAssetInput {
  assetHash: string;
  byteSize: number;
  mimeType: string;
  sourceType: ImportSourceType;
  sourceRef: string;
  storageProvider: StorageProvider;
  storagePath: string;
  parserHint?: string;
  ingestMetaJson?: string;
}

// ============ Document Asset Link ============

export type DocumentAssetRole = "primary" | "alternate" | "raw_fetch";

export interface DocumentAsset {
  documentId: string;
  assetId: string;
  role: DocumentAssetRole;
  createdAt: number;
}

export interface CreateDocumentAssetInput {
  documentId: string;
  assetId: string;
  role?: DocumentAssetRole;
}

// ============ Document Version ============

export type VersionChangeKind =
  | "initial"
  | "refresh_url"
  | "rss_update"
  | "file_replace"
  | "manual_copy";

export interface DocumentVersion {
  versionId: string;
  documentId: string;
  versionIndex: number;
  contentHash: string;
  primaryAssetId: string;
  changeKind: VersionChangeKind;
  note?: string;
  createdAt: number;
}

export interface CreateDocumentVersionInput {
  documentId: string;
  contentHash: string;
  primaryAssetId: string;
  changeKind: VersionChangeKind;
  note?: string;
}
