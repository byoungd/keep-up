/**
 * PDF Parser - Uses unpdf (based on Mozilla pdf.js) for high-quality extraction
 */

import { EncryptedFileError, ParseError } from "../errors";
import type { FileParser, ParseResult } from "../types";

export interface PDFParserOptions {
  /** Maximum pages to parse (default: all) */
  maxPages?: number;
  /** Merge hyphenated words at line breaks */
  mergeHyphens?: boolean;
}

export class PDFParser implements FileParser {
  readonly extensions = [".pdf"];
  readonly mimeTypes = ["application/pdf"];

  async parse(content: Buffer, options?: PDFParserOptions): Promise<ParseResult> {
    try {
      const { getDocumentProxy } = await import("unpdf");

      // Convert Buffer to Uint8Array
      const data = new Uint8Array(content);

      // Get document proxy
      const pdf = await getDocumentProxy(data);
      const numPages = pdf.numPages;

      // Get metadata
      const metadata = await pdf.getMetadata().catch(() => null);
      // biome-ignore lint/suspicious/noExplicitAny: library type
      const info = metadata?.info as Record<string, any> | undefined;

      // Extract text page by page for better paragraph detection
      const allBlocks: string[] = [];
      const maxPages = options?.maxPages || numPages;

      for (let i = 1; i <= Math.min(numPages, maxPages); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageBlocks = this.extractPageBlocks(textContent, options);
        allBlocks.push(...pageBlocks);
      }

      // Extract title
      const title = this.extractTitle(info, allBlocks);

      return {
        title,
        blocks: allBlocks,
        rawContent: allBlocks.join("\n\n"),
        metadata: {
          pageCount: numPages,
          author: info?.Author,
          creator: info?.Creator,
          producer: info?.Producer,
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: catch block
    } catch (error: any) {
      if (this.isEncryptedError(error)) {
        throw new EncryptedFileError("PDF is password-protected");
      }
      throw new ParseError("Failed to parse PDF", { cause: error });
    }
  }

  /**
   * Extract text blocks from a page with paragraph detection
   */
  // biome-ignore lint/suspicious/noExplicitAny: library type
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: text extraction logic
  private extractPageBlocks(textContent: any, options?: PDFParserOptions): string[] {
    const items = textContent.items as Array<{
      str: string;
      transform?: number[];
      height?: number;
    }>;

    if (!items || items.length === 0) {
      return [];
    }

    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let lastY: number | null = null;
    let lastHeight = 12; // Default font height

    for (const item of items) {
      if (!item.str || item.str.trim() === "") {
        continue;
      }

      // Get Y position from transform matrix [a, b, c, d, e, f] where f is Y
      const y = item.transform ? item.transform[5] : null;
      const height = item.height || lastHeight;

      // Detect paragraph break based on Y position gap
      if (lastY !== null && y !== null) {
        const gap = Math.abs(lastY - y);
        // If gap is significantly larger than line height, it's a new paragraph
        if (gap > height * 1.8) {
          if (currentBlock.length > 0) {
            blocks.push(this.cleanBlock(currentBlock.join(" "), options));
            currentBlock = [];
          }
        }
      }

      currentBlock.push(item.str);
      lastY = y;
      lastHeight = height;
    }

    // Don't forget the last block
    if (currentBlock.length > 0) {
      blocks.push(this.cleanBlock(currentBlock.join(" "), options));
    }

    return blocks.filter((b) => b.length > 0);
  }

  /**
   * Clean a text block
   */
  private cleanBlock(text: string, options?: PDFParserOptions): string {
    let cleaned = text;

    // Merge hyphenated words
    if (options?.mergeHyphens !== false) {
      cleaned = cleaned.replace(/- /g, "");
    }

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Skip page numbers and headers/footers
    if (/^\d+$/.test(cleaned)) {
      return "";
    }
    if (/^page\s+\d+$/i.test(cleaned)) {
      return "";
    }
    if (cleaned.length < 3) {
      return "";
    }

    return cleaned;
  }

  /**
   * Extract title from metadata or first block
   */
  // biome-ignore lint/suspicious/noExplicitAny: metadata type
  private extractTitle(info: Record<string, any> | undefined, blocks: string[]): string {
    // Try metadata title
    if (info?.Title && typeof info.Title === "string" && info.Title.trim()) {
      return info.Title.trim();
    }

    // Try first substantial block
    for (const block of blocks) {
      if (block.length > 5 && block.length < 200) {
        return block;
      }
    }

    return "Untitled";
  }

  private isEncryptedError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes("encrypt") || msg.includes("password");
    }
    return false;
  }
}
