/**
 * Types for Content Composer v2 (Linear Style)
 */

import type { ImportSourceType } from "@ku0/db";

/** Source kind for auto-detection */
export type SourceKind = "text" | "file" | "url";

/** Source status state machine */
export type SourceStatus = "draft" | "queued" | "processing" | "ready" | "failed" | "canceled";

/** Individual source item in the Composer */
export interface AddSourceItem {
  /** Local UUID for UI identity */
  localId: string;

  /** Auto-detected source kind */
  kind: SourceKind;

  /** Display name (snippet/filename/hostname) */
  displayName: string;

  /** File size in bytes (for files) */
  sizeBytes?: number;

  /** MIME type (for files) */
  mimeType?: string;

  /** Original URL (for URL sources) */
  url?: string;

  /** Raw content (for text sources) */
  content?: string;

  /** File reference (for file sources) */
  fileRef?: string;

  /** Temporary file storage (for unregistered files) */
  _tempFile?: File;

  /** Current status */
  status: SourceStatus;

  /** Error code for failed items */
  errorCode?: string;

  /** User-friendly error message */
  errorMessage?: string;

  /** Import job ID when enqueued */
  jobId?: string;

  /** Result document ID when ready */
  resultDocumentId?: string;

  /** Creation timestamp */
  createdAt: number;
}

/** Composer state */
export interface ComposerState {
  /** List of source items */
  items: AddSourceItem[];

  /** Optional title for the import session */
  title?: string;

  /** Destination (default: 'unread') */
  destination: "unread" | "library";

  /** Whether advanced options are visible */
  showAdvanced: boolean;
}

/** Composer actions */
export type ComposerAction =
  | { type: "ADD_TEXT"; content: string; localId?: string }
  | { type: "ADD_FILES"; files: File[] }
  | { type: "ADD_URL"; url: string; localId?: string }
  | { type: "REMOVE_ITEM"; localId: string }
  | {
      type: "UPDATE_ITEM_STATUS";
      localId: string;
      status: SourceStatus;
      jobId?: string;
      errorCode?: string;
      errorMessage?: string;
    }
  | { type: "SET_ITEM_RESULT"; localId: string; resultDocumentId: string }
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_DESTINATION"; destination: "unread" | "library" }
  | { type: "TOGGLE_ADVANCED" }
  | { type: "RESET" };

/** Error codes for URL import */
export const URL_ERROR_CODES = {
  UNSUPPORTED: "URL_IMPORT_UNSUPPORTED",
  INVALID_FORMAT: "INVALID_URL_FORMAT",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "REQUEST_TIMEOUT",
} as const;

/** File validation limits */
export const FILE_LIMITS = {
  MAX_SIZE_MB: 50,
  MAX_COUNT: 10,
  SUPPORTED_TYPES: [".md", ".markdown", ".txt", ".html", ".htm"],
  SUPPORTED_MIMES: [
    "text/markdown",
    "text/plain",
    "text/html",
    "application/octet-stream", // For .md files without proper MIME
  ],
} as const;

/** Maps SourceKind to ImportSourceType for backend compatibility */
export function mapSourceKindToImportType(kind: SourceKind): ImportSourceType {
  switch (kind) {
    case "text":
      return "file"; // Text paste is treated as file import
    case "file":
      return "file";
    case "url":
      return "url";
    default:
      return "file";
  }
}
