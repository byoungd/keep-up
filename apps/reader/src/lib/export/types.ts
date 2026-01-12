/**
 * Export Engine - Core Types
 *
 * Defines the interface for document export functionality.
 */

import type { Node as PMNode } from "prosemirror-model";

export type ExportFormat = "markdown" | "html" | "pdf" | "docx";

export interface ExportOptions {
  /** Include front-matter metadata (title, date, etc.) */
  includeMeta?: boolean;
  /** Embed images as Base64 instead of using URLs */
  embedImages?: boolean;
  /** Include annotations as comments/notes */
  includeAnnotations?: boolean;
  /** Document title for headers/filenames */
  title?: string;
}

export interface ExportResult {
  /** The serialized content */
  content: string | Blob;
  /** MIME type of the exported content */
  mimeType: string;
  /** Suggested filename */
  filename: string;
}

export interface Serializer {
  serialize(doc: PMNode, options?: ExportOptions): Promise<ExportResult>;
}

export interface ExportProgress {
  stage: "preparing" | "serializing" | "bundling" | "complete";
  percent: number;
  message?: string;
}

export type OnProgress = (progress: ExportProgress) => void;
