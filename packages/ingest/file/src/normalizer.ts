/**
 * Normalizer - Converts ParseResult to IngestionMeta format.
 */

import { canonicalizeText, computeCanonicalHash } from "@ku0/core";
import type { FileSource, IngestionMeta, ParseResult } from "./types";

export class Normalizer {
  /**
   * Convert ParseResult to IngestionMeta format.
   */
  toIngestionMeta(result: ParseResult, source: FileSource): IngestionMeta {
    const canonicalInput = this.buildCanonicalInput(result);
    const canonical = canonicalizeText(canonicalInput);
    const content = canonical.canonicalText;
    const sourceId = this.generateSourceId(source, canonical);

    // Use extracted title or derive from filename
    const title = result.title !== "Untitled" ? result.title : this.titleFromFilename(source);

    return { title, content, sourceId, metadata: result.metadata };
  }

  /**
   * Prefer rawContent to avoid lossy whitespace collapse.
   */
  private buildCanonicalInput(result: ParseResult): string {
    const input = result.rawContent ?? result.blocks.join("\n\n");
    return this.normalizeLineEndings(input);
  }

  /**
   * Generate a deterministic sourceId.
   */
  private generateSourceId(
    source: FileSource,
    canonical: { canonicalText: string; blocks: string[] }
  ): string {
    if (source.path) {
      return `file://${source.path}`;
    }
    // Hash content for buffer sources
    const hash = computeCanonicalHash(canonical.blocks.map((text) => ({ text }))).docHash;
    const filename = source.filename || "unknown";
    return `file-buffer://${filename}:${hash}`;
  }

  /**
   * Extract title from filename.
   */
  private titleFromFilename(source: FileSource): string {
    const filename = source.filename || source.path || "Untitled";
    return (
      filename
        .split("/")
        .pop()
        ?.split("\\")
        .pop()
        ?.replace(/\.[^.]+$/, "")
        .replace(/[-_]/g, " ")
        .trim() || "Untitled"
    );
  }

  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
}
