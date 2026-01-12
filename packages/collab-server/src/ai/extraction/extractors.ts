/**
 * Base Document Extractor
 *
 * Abstract base class for document extractors with shared utilities.
 */

import type {
  DocumentExtractor,
  DocumentMetadata,
  DocumentType,
  ExtractedImage,
  ExtractedLink,
  ExtractedTable,
  ExtractionOptions,
  ExtractionResult,
} from "./types";

/** Default extraction options */
const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxLength: 1_000_000, // 1MB of text
  preserveFormatting: true,
  extractImages: false,
  extractTables: true,
  extractLinks: true,
  languageHint: "en",
};

/**
 * Abstract base class for document extractors.
 */
export abstract class BaseExtractor implements DocumentExtractor {
  abstract readonly supportedExtensions: string[];
  abstract readonly supportedMimeTypes: string[];

  /**
   * Check if this extractor can handle the file.
   */
  canExtract(file: File | Blob, mimeType?: string): boolean {
    const type = mimeType || (file instanceof File ? file.type : "");

    // Check MIME type
    if (type && this.supportedMimeTypes.includes(type)) {
      return true;
    }

    // Check extension for File objects
    if (file instanceof File) {
      const ext = this.getExtension(file.name);
      return this.supportedExtensions.includes(ext);
    }

    return false;
  }

  /**
   * Extract content from file.
   */
  abstract extract(file: File | Blob, options?: ExtractionOptions): Promise<ExtractionResult>;

  /**
   * Merge options with defaults.
   */
  protected mergeOptions(options?: ExtractionOptions): Required<ExtractionOptions> {
    return { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get file extension.
   */
  protected getExtension(filename: string): string {
    const parts = filename.toLowerCase().split(".");
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : "";
  }

  /**
   * Create success result.
   */
  protected createSuccessResult(
    content: string,
    documentType: DocumentType,
    metadata: Partial<DocumentMetadata>,
    extras: {
      images?: ExtractedImage[];
      tables?: ExtractedTable[];
      links?: ExtractedLink[];
    },
    startTime: number
  ): ExtractionResult {
    return {
      success: true,
      documentType,
      content,
      metadata: {
        ...metadata,
        wordCount: this.countWords(content),
        charCount: content.length,
      },
      images: extras.images || [],
      tables: extras.tables || [],
      links: extras.links || [],
      processingTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Create error result.
   */
  protected createErrorResult(
    error: string,
    documentType: DocumentType,
    startTime: number
  ): ExtractionResult {
    return {
      success: false,
      error,
      documentType,
      content: "",
      metadata: {},
      images: [],
      tables: [],
      links: [],
      processingTimeMs: performance.now() - startTime,
    };
  }

  /**
   * Count words in text.
   */
  protected countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  /**
   * Truncate content to max length.
   */
  protected truncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return `${content.slice(0, maxLength)}\n\n[Content truncated...]`;
  }

  /**
   * Read file as text.
   */
  protected async readAsText(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  /**
   * Read file as ArrayBuffer.
   */
  protected async readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
}

/**
 * Plain text extractor.
 */
export class TextExtractor extends BaseExtractor {
  readonly supportedExtensions = [".txt", ".text", ".log"];
  readonly supportedMimeTypes = ["text/plain"];

  async extract(file: File | Blob, options?: ExtractionOptions): Promise<ExtractionResult> {
    const startTime = performance.now();
    const opts = this.mergeOptions(options);

    try {
      let content = await this.readAsText(file);
      content = this.truncate(content, opts.maxLength);

      return this.createSuccessResult(
        content,
        "text",
        {
          title: file instanceof File ? file.name : undefined,
        },
        {},
        startTime
      );
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : "Failed to read text file",
        "text",
        startTime
      );
    }
  }
}

/**
 * Markdown extractor.
 */
export class MarkdownExtractor extends BaseExtractor {
  readonly supportedExtensions = [".md", ".markdown", ".mdown"];
  readonly supportedMimeTypes = ["text/markdown", "text/x-markdown"];

  async extract(file: File | Blob, options?: ExtractionOptions): Promise<ExtractionResult> {
    const startTime = performance.now();
    const opts = this.mergeOptions(options);

    try {
      let content = await this.readAsText(file);
      content = this.truncate(content, opts.maxLength);

      // Extract metadata from frontmatter
      const metadata = this.extractFrontmatter(content);

      // Extract links if requested
      const links = opts.extractLinks ? this.extractLinks(content) : [];

      // Extract title from first heading if not in frontmatter
      if (!metadata.title) {
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          metadata.title = titleMatch[1];
        }
      }

      return this.createSuccessResult(content, "markdown", metadata, { links }, startTime);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : "Failed to read markdown file",
        "markdown",
        startTime
      );
    }
  }

  /**
   * Extract YAML frontmatter.
   */
  private extractFrontmatter(content: string): Partial<DocumentMetadata> {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return {};
    }

    const metadata: Partial<DocumentMetadata> = {};
    const lines = frontmatterMatch[1].split("\n");

    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      if (key && valueParts.length > 0) {
        const value = valueParts.join(":").trim();
        switch (key.trim().toLowerCase()) {
          case "title":
            metadata.title = value.replace(/^["']|["']$/g, "");
            break;
          case "author":
            metadata.author = value.replace(/^["']|["']$/g, "");
            break;
          case "date":
          case "created":
            metadata.createdAt = new Date(value);
            break;
        }
      }
    }

    return metadata;
  }

  /**
   * Extract links from markdown.
   */
  private extractLinks(content: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

    for (const match of content.matchAll(linkPattern)) {
      const url = match[2];
      links.push({
        text: match[1],
        url,
        isInternal: !url.startsWith("http://") && !url.startsWith("https://"),
      });
    }

    return links;
  }
}

/**
 * HTML extractor.
 */
export class HTMLExtractor extends BaseExtractor {
  readonly supportedExtensions = [".html", ".htm", ".xhtml"];
  readonly supportedMimeTypes = ["text/html", "application/xhtml+xml"];

  async extract(file: File | Blob, options?: ExtractionOptions): Promise<ExtractionResult> {
    const startTime = performance.now();
    const opts = this.mergeOptions(options);

    try {
      const html = await this.readAsText(file);

      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Extract metadata
      const metadata = this.extractMetadata(doc);

      // Extract text content
      let content = this.extractText(doc, opts.preserveFormatting);
      content = this.truncate(content, opts.maxLength);

      // Extract links
      const links = opts.extractLinks ? this.extractLinks(doc) : [];

      // Extract tables
      const tables = opts.extractTables ? this.extractTables(doc) : [];

      return this.createSuccessResult(content, "html", metadata, { links, tables }, startTime);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : "Failed to parse HTML",
        "html",
        startTime
      );
    }
  }

  /**
   * Extract metadata from HTML.
   */
  private extractMetadata(doc: Document): Partial<DocumentMetadata> {
    const metadata: Partial<DocumentMetadata> = {};

    // Title
    const titleEl = doc.querySelector("title");
    if (titleEl) {
      metadata.title = titleEl.textContent?.trim();
    }

    // Meta tags
    const getMeta = (name: string): string | undefined => {
      const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el?.getAttribute("content") || undefined;
    };

    metadata.author = getMeta("author");

    const dateStr = getMeta("date") || getMeta("article:published_time");
    if (dateStr) {
      metadata.createdAt = new Date(dateStr);
    }

    return metadata;
  }

  /**
   * Extract text content from HTML.
   */
  private extractText(doc: Document, preserveFormatting: boolean): string {
    // Remove script and style elements
    const scripts = doc.querySelectorAll("script, style, noscript");
    for (const el of scripts) {
      el.remove();
    }

    if (!preserveFormatting) {
      return doc.body?.textContent?.trim() || "";
    }

    // Convert to text preserving some structure
    const lines: string[] = [];
    const blockElements = doc.body?.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre"
    );

    if (blockElements) {
      for (const el of blockElements) {
        const processed = this.processBlockElement(el as HTMLElement);
        if (processed) {
          lines.push(processed);
          lines.push("");
        }
      }
    }

    return lines.join("\n").trim() || doc.body?.textContent?.trim() || "";
  }

  private processBlockElement(el: HTMLElement): string | null {
    const text = el.textContent?.trim();
    if (!text) {
      return null;
    }

    // Add heading markers
    if (el.tagName.match(/^H[1-6]$/)) {
      const level = Number.parseInt(el.tagName[1], 10);
      return `${"#".repeat(level)} ${text}`;
    }

    if (el.tagName === "LI") {
      return `- ${text}`;
    }

    if (el.tagName === "BLOCKQUOTE") {
      return `> ${text}`;
    }

    return text;
  }

  /**
   * Extract links from HTML.
   */
  private extractLinks(doc: Document): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const anchors = doc.querySelectorAll("a[href]");

    for (const a of anchors) {
      const url = a.getAttribute("href") || "";
      const text = a.textContent?.trim() || "";
      if (url && text) {
        links.push({
          text,
          url,
          isInternal: url.startsWith("#") || url.startsWith("/"),
        });
      }
    }

    return links;
  }

  /**
   * Extract tables from HTML.
   */
  private extractTables(doc: Document): ExtractedTable[] {
    const tables: ExtractedTable[] = [];
    const tableElements = doc.querySelectorAll("table");

    let index = 0;
    for (const table of tableElements) {
      const headers: string[] = [];
      const rows: string[][] = [];

      // Extract headers
      const headerCells = table.querySelectorAll("thead th, tr:first-child th");
      for (const cell of headerCells) {
        headers.push(cell.textContent?.trim() || "");
      }

      // Extract rows
      const bodyRows = table.querySelectorAll("tbody tr, tr");
      for (const row of bodyRows) {
        const cells = row.querySelectorAll("td");
        if (cells.length > 0) {
          const rowData: string[] = [];
          for (const cell of cells) {
            rowData.push(cell.textContent?.trim() || "");
          }
          rows.push(rowData);
        }
      }

      if (headers.length > 0 || rows.length > 0) {
        const caption = table.querySelector("caption")?.textContent?.trim();
        tables.push({ index: index++, headers, rows, caption });
      }
    }

    return tables;
  }
}
