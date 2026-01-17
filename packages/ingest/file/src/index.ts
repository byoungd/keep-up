/**
 * @ku0/ingest-file
 *
 * File import plugin for Markdown, PDF, EPUB, and TXT files.
 * Outputs IngestionMeta for use with AtomicIngestionService.
 */

import { FileImporter } from "./fileImporter";

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
export type { UrlImportOptions } from "./fileImporter";
// Main classes
export { FileImporter } from "./fileImporter";
export { FormatDetector } from "./formatDetector";
export type {
  IngestNormalizationStats,
  IngestQualityThresholds,
} from "./ingestStats";
// Stats
export {
  computeIngestStats,
  INGEST_QUALITY_THRESHOLDS,
} from "./ingestStats";
export { Normalizer } from "./normalizer";
export { ParserRegistry } from "./parserRegistry";
// Parsers
export { EPUBParser } from "./parsers/epub";
export { MarkdownParser } from "./parsers/markdown";
export { PDFParser } from "./parsers/pdf";
export { TXTParser } from "./parsers/txt";
export type { FilePlugin } from "./plugin";
// Plugin
export { createFilePlugin } from "./plugin";
export type {
  FileFormat,
  FileImportOptions,
  FileParser,
  FileSource,
  IngestionMeta,
  ParseResult,
} from "./types";
// Types
export { DEFAULT_IMPORT_OPTIONS } from "./types";
export type { UrlFetchOptions, UrlFetchResult } from "./urlFetcher";
// URL Fetcher
export { fetchFromUrl, UrlFetchError } from "./urlFetcher";

// Convenience factory
export function createFileImporter(): FileImporter {
  return new FileImporter();
}
