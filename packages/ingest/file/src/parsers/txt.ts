/**
 * TXT Parser
 *
 * Parses plain text files with encoding detection and paragraph splitting.
 */

import { EmptyContentError } from "../errors";
import type { FileParser, ParseResult } from "../types";

export interface TXTParserOptions {
  encoding?: BufferEncoding;
}

export class TXTParser implements FileParser {
  readonly extensions = [".txt", ".text"];
  readonly mimeTypes = ["text/plain"];

  async parse(content: Buffer, options?: TXTParserOptions): Promise<ParseResult> {
    const encoding = options?.encoding || this.detectEncoding(content);
    const text = content.toString(encoding);

    // Check for empty content
    if (!text.trim()) {
      throw new EmptyContentError("File contains only whitespace");
    }

    // Split into paragraphs based on blank lines
    const blocks = this.splitIntoParagraphs(text);

    return {
      title: "Untitled", // Will be set from filename by normalizer
      blocks,
      rawContent: text,
    };
  }

  /**
   * Detect encoding from BOM (Byte Order Mark).
   */
  private detectEncoding(content: Buffer): BufferEncoding {
    // UTF-8 BOM
    if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
      return "utf-8";
    }
    // UTF-16 LE BOM
    if (content[0] === 0xff && content[1] === 0xfe) {
      return "utf16le";
    }
    // UTF-16 BE BOM (read as LE, Node doesn't support BE directly)
    if (content[0] === 0xfe && content[1] === 0xff) {
      return "utf16le";
    }
    // Default to UTF-8
    return "utf-8";
  }

  /**
   * Split text into paragraphs based on blank lines.
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);
  }
}
