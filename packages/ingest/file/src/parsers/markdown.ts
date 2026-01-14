/**
 * Markdown Parser
 *
 * Parses Markdown files with frontmatter extraction while preserving
 * source text for MDVP offset alignment.
 */

import { canonicalizeText } from "@ku0/core";
import type { FileParser, ParseResult } from "../types";

export interface MarkdownParserOptions {
  /** Whether to preserve code block content */
  preserveCodeBlocks?: boolean;
}

export class MarkdownParser implements FileParser {
  readonly extensions = [".md", ".markdown", ".mdown", ".mkd"];
  readonly mimeTypes = ["text/markdown", "text/x-markdown"];

  async parse(content: Buffer, _options?: MarkdownParserOptions): Promise<ParseResult> {
    const text = content.toString("utf-8");

    // Extract frontmatter and content
    const { frontmatter, body } = this.extractFrontmatter(text);
    const normalizedBody = this.normalizeLineEndings(body);

    // Extract title
    const title = this.extractTitle(frontmatter, normalizedBody);
    const blocks = this.toBlocks(normalizedBody);

    return {
      title,
      blocks,
      metadata: frontmatter,
      rawContent: normalizedBody,
    };
  }

  /**
   * Extract YAML frontmatter from markdown.
   */
  private extractFrontmatter(text: string): {
    frontmatter?: Record<string, unknown>;
    body: string;
  } {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

    if (!match) {
      return { body: text };
    }

    const yamlContent = match[1];
    const body = text.slice(match[0].length);

    // Simple YAML parsing (key: value pairs)
    const frontmatter: Record<string, unknown> = {};
    const lines = yamlContent.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        let value: string | boolean | number = line.slice(colonIndex + 1).trim();

        // Remove quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        frontmatter[key] = value;
      }
    }

    return { frontmatter, body };
  }

  /**
   * Extract title from frontmatter or first H1.
   */
  private extractTitle(frontmatter?: Record<string, unknown>, body?: string): string {
    // Try frontmatter title first
    if (frontmatter?.title && typeof frontmatter.title === "string") {
      return frontmatter.title;
    }

    // Try first H1 heading
    if (body) {
      const h1Match = body.match(/^#\s+(.+)$/m);
      if (h1Match) {
        return h1Match[1].trim();
      }
    }

    return "Untitled";
  }

  /**
   * Normalize line endings without mutating intra-line whitespace.
   */
  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  /**
   * Build canonical blocks while preserving Markdown markers so offsets
   * map cleanly to INV-MAP projections.
   */
  private toBlocks(text: string): string[] {
    const canonical = canonicalizeText(text);
    return canonical.blocks;
  }
}
