export interface FileSource {
  path?: string;
  buffer?: Buffer;
  filename?: string;
  mimeType?: string;
}

export type FileFormat = "markdown" | "pdf" | "epub" | "txt" | "unknown";

export interface FileImportOptions {
  maxFileSize?: number;
  encoding?: BufferEncoding;
  extractImages?: boolean;
  parserOptions?: Record<string, unknown>;
}

export const DEFAULT_IMPORT_OPTIONS = {
  maxFileSize: 50 * 1024 * 1024,
};

export interface ParseResult {
  title: string;
  blocks: string[];
  metadata?: Record<string, unknown>;
  /**
   * Canonical text prior to normalization.
   * Used to preserve source offsets for MDVP.
   */
  rawContent?: string;
}

export interface IngestionMeta {
  title: string;
  content: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface FileParser {
  parse(content: Buffer, options?: Record<string, unknown>): Promise<ParseResult>;
  readonly extensions: string[];
  readonly mimeTypes: string[];
}
