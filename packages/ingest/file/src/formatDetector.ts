/**
 * Format Detector
 *
 * Detects file format based on extension or MIME type.
 */

import type { FileFormat } from "./types";

const EXTENSION_MAP: Record<string, FileFormat> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".mdown": "markdown",
  ".mkd": "markdown",
  ".pdf": "pdf",
  ".epub": "epub",
  ".txt": "txt",
  ".text": "txt",
};

const MIME_MAP: Record<string, FileFormat> = {
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "text/plain": "txt",
};

export class FormatDetector {
  /**
   * Detect file format from filename and optional MIME type.
   */
  detect(filename: string, mimeType?: string): FileFormat {
    // Try MIME type first (more reliable when available)
    if (mimeType) {
      const mimeFormat = MIME_MAP[mimeType.toLowerCase()];
      if (mimeFormat) {
        return mimeFormat;
      }
    }

    // Fall back to extension
    const ext = this.getExtension(filename).toLowerCase();
    return EXTENSION_MAP[ext] || "unknown";
  }

  /**
   * Check if a format is supported.
   */
  isSupported(format: FileFormat): boolean {
    return format !== "unknown";
  }

  /**
   * Get all supported extensions.
   */
  getSupportedExtensions(): string[] {
    return Object.keys(EXTENSION_MAP);
  }

  /**
   * Get all supported MIME types.
   */
  getSupportedMimeTypes(): string[] {
    return Object.keys(MIME_MAP);
  }

  private getExtension(filename: string): string {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : "";
  }
}
