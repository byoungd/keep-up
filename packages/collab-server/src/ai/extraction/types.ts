/**
 * Document Extractor Types
 *
 * Type definitions for document extraction and processing.
 * Supports PDF, DOCX, HTML, Markdown, and plain text.
 */

/** Supported document types */
export type DocumentType = "pdf" | "docx" | "html" | "markdown" | "text" | "unknown";

/** Extraction options */
export interface ExtractionOptions {
  /** Maximum content length in characters */
  maxLength?: number;
  /** Whether to preserve formatting */
  preserveFormatting?: boolean;
  /** Whether to extract images (as base64) */
  extractImages?: boolean;
  /** Whether to extract tables */
  extractTables?: boolean;
  /** Whether to extract links */
  extractLinks?: boolean;
  /** Language hint for OCR */
  languageHint?: string;
}

/** Extracted image */
export interface ExtractedImage {
  /** Image index */
  index: number;
  /** Base64 data URL */
  dataUrl: string;
  /** MIME type */
  mimeType: string;
  /** Alt text (if available) */
  altText?: string;
  /** Page number (for PDFs) */
  page?: number;
}

/** Extracted table */
export interface ExtractedTable {
  /** Table index */
  index: number;
  /** Headers */
  headers: string[];
  /** Rows */
  rows: string[][];
  /** Caption (if available) */
  caption?: string;
}

/** Extracted link */
export interface ExtractedLink {
  /** Link text */
  text: string;
  /** URL */
  url: string;
  /** Whether it's internal */
  isInternal: boolean;
}

/** Document metadata */
export interface DocumentMetadata {
  /** Document title */
  title?: string;
  /** Author */
  author?: string;
  /** Creation date */
  createdAt?: Date;
  /** Last modified date */
  modifiedAt?: Date;
  /** Page count (for PDFs) */
  pageCount?: number;
  /** Word count */
  wordCount?: number;
  /** Character count */
  charCount?: number;
  /** Language */
  language?: string;
  /** Additional metadata */
  custom?: Record<string, unknown>;
}

/** Extraction result */
export interface ExtractionResult {
  /** Whether extraction was successful */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Document type */
  documentType: DocumentType;
  /** Extracted text content */
  content: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Extracted images */
  images: ExtractedImage[];
  /** Extracted tables */
  tables: ExtractedTable[];
  /** Extracted links */
  links: ExtractedLink[];
  /** Processing time in ms */
  processingTimeMs: number;
}

/** Document extractor interface */
export interface DocumentExtractor {
  /** Supported file extensions */
  supportedExtensions: string[];
  /** Supported MIME types */
  supportedMimeTypes: string[];
  /** Check if can extract */
  canExtract(file: File | Blob, mimeType?: string): boolean;
  /** Extract content */
  extract(file: File | Blob, options?: ExtractionOptions): Promise<ExtractionResult>;
}

/** Chunk for semantic processing */
export interface DocumentChunk {
  /** Chunk ID */
  id: string;
  /** Document ID */
  docId: string;
  /** Chunk index */
  index: number;
  /** Chunk content */
  content: string;
  /** Token count */
  tokenCount: number;
  /** Character count */
  charCount: number;
  /** Start position in original document */
  startOffset: number;
  /** End position in original document */
  endOffset: number;
  /** Metadata */
  metadata: {
    /** Section title (if applicable) */
    sectionTitle?: string;
    /** Page number (if applicable) */
    page?: number;
    /** Paragraph index */
    paragraphIndex?: number;
  };
}

/** Chunking strategy */
export type ChunkingStrategy =
  | "fixed" // Fixed token size
  | "semantic" // Semantic boundaries (paragraphs, sections)
  | "sentence" // Sentence-level
  | "sliding"; // Sliding window with overlap

/** Chunking options */
export interface ChunkingOptions {
  /** Strategy to use */
  strategy?: ChunkingStrategy;
  /** Target chunk size in tokens */
  targetSize?: number;
  /** Maximum chunk size in tokens */
  maxSize?: number;
  /** Minimum chunk size in tokens */
  minSize?: number;
  /** Overlap size in tokens (for sliding window) */
  overlap?: number;
  /** Whether to preserve sentence boundaries */
  preserveSentences?: boolean;
}
