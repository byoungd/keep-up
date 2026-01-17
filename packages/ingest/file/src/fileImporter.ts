import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  FileNotFoundError,
  FileTooLargeError,
  ParseError,
  PermissionError,
  UnsupportedFormatError,
} from "./errors";
import { FormatDetector } from "./formatDetector";
import { Normalizer } from "./normalizer";
import { ParserRegistry } from "./parserRegistry";
import { EPUBParser } from "./parsers/epub";
import { MarkdownParser } from "./parsers/markdown";
import { PDFParser } from "./parsers/pdf";
import { TXTParser } from "./parsers/txt";
import {
  DEFAULT_IMPORT_OPTIONS,
  type FileImportOptions,
  type FileSource,
  type IngestionMeta,
} from "./types";
import { fetchFromUrl, type UrlFetchOptions } from "./urlFetcher";

export interface UrlImportOptions extends FileImportOptions, UrlFetchOptions {}

export class FileImporter {
  private registry: ParserRegistry;
  private detector: FormatDetector;
  private normalizer: Normalizer;

  constructor() {
    this.registry = new ParserRegistry();
    this.detector = new FormatDetector();
    this.normalizer = new Normalizer();
    this.registry.register("markdown", new MarkdownParser());
    this.registry.register("pdf", new PDFParser());
    this.registry.register("epub", new EPUBParser());
    this.registry.register("txt", new TXTParser());
  }

  async importFile(source: FileSource, options?: FileImportOptions): Promise<IngestionMeta> {
    const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
    const { content, filename } = await this.readSource(source, opts);
    const format = this.detector.detect(filename, source.mimeType);
    if (format === "unknown") {
      throw new UnsupportedFormatError(filename);
    }

    const parser = this.registry.get(format);
    try {
      const result = await parser.parse(content, opts.parserOptions);
      return this.normalizer.toIngestionMeta(result, { ...source, filename });
    } catch (error) {
      if (error instanceof ParseError) {
        throw error;
      }
      throw new ParseError(`Failed to parse ${filename}`, { cause: error });
    }
  }

  /**
   * Import a file from a URL.
   */
  async importFromUrl(url: string, options?: UrlImportOptions): Promise<IngestionMeta> {
    const fetchResult = await fetchFromUrl(url, {
      timeout: options?.timeout,
      maxSize: options?.maxFileSize,
      userAgent: options?.userAgent,
    });

    return this.importFile(
      {
        buffer: fetchResult.buffer,
        filename: fetchResult.filename,
        mimeType: fetchResult.mimeType,
      },
      options
    );
  }

  async importFiles(sources: FileSource[], opts?: FileImportOptions): Promise<IngestionMeta[]> {
    return Promise.all(sources.map((s) => this.importFile(s, opts)));
  }

  /**
   * Import multiple files from URLs.
   */
  async importFromUrls(urls: string[], opts?: UrlImportOptions): Promise<IngestionMeta[]> {
    return Promise.all(urls.map((url) => this.importFromUrl(url, opts)));
  }

  private async readSource(source: FileSource, opts: { maxFileSize: number }) {
    if (source.buffer) {
      if (source.buffer.length > opts.maxFileSize) {
        throw new FileTooLargeError(source.buffer.length, opts.maxFileSize);
      }
      return { content: source.buffer, filename: source.filename || "unknown" };
    }
    if (!source.path) {
      throw new Error("FileSource must have path or buffer");
    }
    try {
      const stat = await fs.stat(source.path);
      if (stat.size > opts.maxFileSize) {
        throw new FileTooLargeError(stat.size, opts.maxFileSize);
      }
      const content = await fs.readFile(source.path);
      return { content, filename: path.basename(source.path) };
      // biome-ignore lint/suspicious/noExplicitAny: file system error handling
    } catch (e: any) {
      if (e.code === "ENOENT") {
        throw new FileNotFoundError(source.path);
      }
      if (e.code === "EACCES") {
        throw new PermissionError(source.path);
      }
      throw e;
    }
  }
}
