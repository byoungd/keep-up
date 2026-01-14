/**
 * @ku0/ingest-file
 *
 * File import plugin for Markdown, PDF, EPUB, and TXT files.
 * Outputs IngestionMeta for use with AtomicIngestionService.
 */

import { FileImporter } from "./fileImporter";

// Main classes
export { FileImporter } from "./fileImporter";
export type { UrlImportOptions } from "./fileImporter";
export { FormatDetector } from "./formatDetector";
export { Normalizer } from "./normalizer";
export { ParserRegistry } from "./parserRegistry";

// URL Fetcher
export { fetchFromUrl, UrlFetchError } from "./urlFetcher";
export type { UrlFetchOptions, UrlFetchResult } from "./urlFetcher";

// Parsers
export { EPUBParser } from "./parsers/epub";
export { MarkdownParser } from "./parsers/markdown";
export { PDFParser } from "./parsers/pdf";
export { TXTParser } from "./parsers/txt";

// Types
export { DEFAULT_IMPORT_OPTIONS } from "./types";
export type {
  FileFormat,
  FileImportOptions,
  FileParser,
  FileSource,
  IngestionMeta,
  ParseResult,
} from "./types";

// Stats
export {
  computeIngestStats,
  INGEST_QUALITY_THRESHOLDS,
} from "./ingestStats";
export type {
  IngestNormalizationStats,
  IngestQualityThresholds,
} from "./ingestStats";

// Errors
export {
  EmptyContentError,
  EncryptedFileError,
  FileImportError,
  FileNotFoundError,
  FileTooLargeError,
  ParseError,
  PermissionError,
  UnsupportedFormatError,
} from "./errors";

// Plugin
export { createFilePlugin } from "./plugin";
export type { FilePlugin } from "./plugin";

// Convenience factory
export function createFileImporter(): FileImporter {
  return new FileImporter();
}
