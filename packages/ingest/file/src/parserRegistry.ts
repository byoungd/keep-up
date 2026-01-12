/**
 * Parser Registry - Manages format-specific parsers.
 */

import { UnsupportedFormatError } from "./errors";
import type { FileFormat, FileParser } from "./types";

export class ParserRegistry {
  private parsers: Map<FileFormat, FileParser> = new Map();

  /**
   * Register a parser for a format.
   */
  register(format: FileFormat, parser: FileParser): void {
    this.parsers.set(format, parser);
  }

  /**
   * Get parser for a format.
   */
  get(format: FileFormat): FileParser {
    const parser = this.parsers.get(format);
    if (!parser) {
      throw new UnsupportedFormatError(`No parser registered for format: ${format}`);
    }
    return parser;
  }

  /**
   * Check if a parser is registered for a format.
   */
  has(format: FileFormat): boolean {
    return this.parsers.has(format);
  }

  /**
   * Get all registered formats.
   */
  getFormats(): FileFormat[] {
    return Array.from(this.parsers.keys());
  }
}
