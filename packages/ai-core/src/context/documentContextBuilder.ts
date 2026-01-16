/**
 * Document Context Builder
 *
 * Builds optimized context from document content for LLM requests.
 * Handles cursor-aware extraction, selection context, and
 * intelligent chunking for copilot and editing scenarios.
 */

import { estimateTokens, truncateToTokens } from "./tokenEstimator";
import {
  type ContextSegment,
  type DocumentContextOptions,
  type HistoryEntry,
  SEGMENT_PRIORITY,
  type TokenCounter,
} from "./types";

/** Document context builder configuration */
export interface DocumentContextBuilderConfig {
  /** Default max tokens for document context */
  defaultMaxTokens?: number;
  /** Lines of context before cursor */
  linesBefore?: number;
  /** Lines of context after cursor */
  linesAfter?: number;
  /** Whether to include document structure hints */
  includeStructure?: boolean;
  /** Optional token counter override */
  tokenCounter?: TokenCounter;
}

/** Built document context */
export interface DocumentContext {
  /** Context before cursor/selection */
  prefix: string;
  /** Context after cursor/selection */
  suffix: string;
  /** Selected text (if any) */
  selection?: string;
  /** Document title */
  title?: string;
  /** Total tokens used */
  tokenCount: number;
  /** Cursor position info */
  cursorInfo?: {
    line: number;
    column: number;
    percentageThrough: number;
  };
}

/**
 * Document Context Builder
 *
 * Extracts relevant document context for AI operations,
 * optimizing for cursor position and selection.
 */
export class DocumentContextBuilder {
  private readonly config: Required<DocumentContextBuilderConfig>;
  private readonly tokenCounter: TokenCounter;

  constructor(config: DocumentContextBuilderConfig = {}) {
    this.config = {
      defaultMaxTokens: config.defaultMaxTokens ?? 2000,
      linesBefore: config.linesBefore ?? 50,
      linesAfter: config.linesAfter ?? 20,
      includeStructure: config.includeStructure ?? true,
      tokenCounter: config.tokenCounter,
    };
    this.tokenCounter = config.tokenCounter ?? { countTokens: estimateTokens };
  }

  /**
   * Build document context for copilot/completion scenarios.
   *
   * Extracts text around cursor with prefix weighted more heavily
   * than suffix (completions need more preceding context).
   */
  buildForCompletion(options: DocumentContextOptions): DocumentContext {
    const { content, cursorPosition = content.length, maxTokens } = options;
    const budget = maxTokens ?? this.config.defaultMaxTokens;

    // Split at cursor
    const prefix = content.slice(0, cursorPosition);
    const suffix = content.slice(cursorPosition);

    // Allocate tokens: 70% prefix, 30% suffix
    const prefixBudget = Math.floor(budget * 0.7);
    const suffixBudget = budget - prefixBudget;

    // Truncate from the start for prefix (keep recent context)
    const truncatedPrefix = truncateToTokens(prefix, prefixBudget, {
      from: "start",
      ellipsis: "[...]\n",
      tokenCounter: this.tokenCounter,
    });

    // Truncate from the end for suffix
    const truncatedSuffix = truncateToTokens(suffix, suffixBudget, {
      from: "end",
      ellipsis: "\n[...]",
      tokenCounter: this.tokenCounter,
    });

    const cursorInfo = this.calculateCursorInfo(content, cursorPosition);

    return {
      prefix: truncatedPrefix,
      suffix: truncatedSuffix,
      title: options.title,
      tokenCount: this.countTokens(truncatedPrefix) + this.countTokens(truncatedSuffix),
      cursorInfo,
    };
  }

  /**
   * Build document context for selection-based operations.
   *
   * Includes the selected text plus surrounding context.
   */
  buildForSelection(options: DocumentContextOptions): DocumentContext {
    const { content, selection, maxTokens } = options;

    if (!selection) {
      return this.buildForCompletion(options);
    }

    const budget = maxTokens ?? this.config.defaultMaxTokens;
    const selectedText = content.slice(selection.start, selection.end);

    // Allocate: 20% prefix, 60% selection, 20% suffix
    const selectionTokens = this.countTokens(selectedText);
    const selectionBudget = Math.floor(budget * 0.6);
    const contextBudget = budget - Math.min(selectionTokens, selectionBudget);
    const prefixBudget = Math.floor(contextBudget * 0.5);
    const suffixBudget = contextBudget - prefixBudget;

    const prefix = content.slice(0, selection.start);
    const suffix = content.slice(selection.end);

    const truncatedPrefix = truncateToTokens(prefix, prefixBudget, {
      from: "start",
      ellipsis: "[...]\n",
      tokenCounter: this.tokenCounter,
    });

    const truncatedSuffix = truncateToTokens(suffix, suffixBudget, {
      from: "end",
      ellipsis: "\n[...]",
      tokenCounter: this.tokenCounter,
    });

    const truncatedSelection =
      selectionTokens > selectionBudget
        ? truncateToTokens(selectedText, selectionBudget, {
            from: "middle",
            ellipsis: "\n[...selection truncated...]\n",
            tokenCounter: this.tokenCounter,
          })
        : selectedText;

    return {
      prefix: truncatedPrefix,
      suffix: truncatedSuffix,
      selection: truncatedSelection,
      title: options.title,
      tokenCount:
        this.countTokens(truncatedPrefix) +
        this.countTokens(truncatedSelection) +
        this.countTokens(truncatedSuffix),
      cursorInfo: this.calculateCursorInfo(content, selection.start),
    };
  }

  /**
   * Build context segment for the context window manager.
   */
  buildSegment(
    options: DocumentContextOptions,
    segmentType: "document" | "selection" = "document"
  ): ContextSegment {
    const context =
      segmentType === "selection"
        ? this.buildForSelection(options)
        : this.buildForCompletion(options);

    let content = "";

    if (context.title) {
      content += `# ${context.title}\n\n`;
    }

    if (context.selection) {
      content += `[BEFORE SELECTION]\n${context.prefix}\n\n`;
      content += `[SELECTED TEXT]\n${context.selection}\n\n`;
      content += `[AFTER SELECTION]\n${context.suffix}`;
    } else {
      content += `${context.prefix}█${context.suffix}`;
    }

    return {
      type: segmentType,
      content,
      tokenCount: this.countTokens(content),
      priority: SEGMENT_PRIORITY[segmentType],
      canTruncate: true,
      minTokens: 100,
      metadata: {
        docId: options.docId,
        cursorInfo: context.cursorInfo,
        hasSelection: !!context.selection,
      },
    };
  }

  /**
   * Build conversation history segment.
   */
  buildHistorySegment(history: HistoryEntry[], maxTokens: number): ContextSegment {
    let content = "";
    let tokenCount = 0;
    const includedEntries: HistoryEntry[] = [];

    // Process history from most recent to oldest
    const reversedHistory = [...history].reverse();

    for (const entry of reversedHistory) {
      const entryContent = `${entry.role}: ${entry.content}\n\n`;
      const entryTokens = entry.tokenCount ?? this.countTokens(entryContent);

      if (tokenCount + entryTokens > maxTokens) {
        break;
      }

      includedEntries.unshift(entry);
      tokenCount += entryTokens;
    }

    // Build content in chronological order
    for (const entry of includedEntries) {
      content += `${entry.role === "user" ? "User" : "Assistant"}: ${entry.content}\n\n`;
    }

    return {
      type: "history",
      content: content.trim(),
      tokenCount,
      priority: SEGMENT_PRIORITY.history,
      canTruncate: true,
      minTokens: 50,
      metadata: {
        entryCount: includedEntries.length,
        totalEntries: history.length,
      },
    };
  }

  /**
   * Build system prompt segment.
   */
  buildSystemSegment(
    systemPrompt: string,
    options: { canTruncate?: boolean } = {}
  ): ContextSegment {
    return {
      type: "system",
      content: systemPrompt,
      tokenCount: this.countTokens(systemPrompt),
      priority: SEGMENT_PRIORITY.system,
      canTruncate: options.canTruncate ?? false,
      minTokens: 100,
    };
  }

  /**
   * Build instructions segment from user input.
   */
  buildInstructionsSegment(instructions: string): ContextSegment {
    return {
      type: "instructions",
      content: instructions,
      tokenCount: this.countTokens(instructions),
      priority: SEGMENT_PRIORITY.instructions,
      canTruncate: false, // User instructions should not be truncated
    };
  }

  /**
   * Build reference segment from external sources.
   */
  buildReferenceSegment(
    references: Array<{ title: string; content: string; source?: string }>,
    maxTokens: number
  ): ContextSegment {
    let content = "## References\n\n";
    let tokenCount = this.countTokens(content);
    let includedCount = 0;

    for (const ref of references) {
      const refContent = `### ${ref.title}\n${ref.content}\n${ref.source ? `Source: ${ref.source}\n` : ""}\n`;
      const refTokens = this.countTokens(refContent);

      if (tokenCount + refTokens > maxTokens) {
        // Try to include truncated version
        const remaining = maxTokens - tokenCount - 50; // Reserve for ellipsis
        if (remaining > 100) {
          const truncated = truncateToTokens(ref.content, remaining, {
            from: "end",
            ellipsis: "...",
            tokenCounter: this.tokenCounter,
          });
          content += `### ${ref.title}\n${truncated}\n\n`;
          tokenCount += this.countTokens(`### ${ref.title}\n${truncated}\n\n`);
          includedCount++;
        }
        break;
      }

      content += refContent;
      tokenCount += refTokens;
      includedCount++;
    }

    return {
      type: "reference",
      content,
      tokenCount,
      priority: SEGMENT_PRIORITY.reference,
      canTruncate: true,
      minTokens: 100,
      metadata: {
        includedCount,
        totalCount: references.length,
      },
    };
  }

  private countTokens(text: string): number {
    return this.tokenCounter.countTokens(text);
  }

  /**
   * Calculate cursor position info.
   */
  private calculateCursorInfo(
    content: string,
    cursorPosition: number
  ): DocumentContext["cursorInfo"] {
    const beforeCursor = content.slice(0, cursorPosition);
    const lines = beforeCursor.split("\n");
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;
    const percentageThrough =
      content.length > 0 ? Math.round((cursorPosition / content.length) * 100) : 0;

    return { line, column, percentageThrough };
  }

  /**
   * Extract structural hints from document (headings, sections).
   */
  extractStructure(content: string): string[] {
    const structure: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // Markdown headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2];
        structure.push(`${"  ".repeat(level - 1)}${title}`);
      }
    }

    return structure;
  }
}

/**
 * Create a document context builder with defaults.
 */
export function createDocumentContextBuilder(
  config: DocumentContextBuilderConfig = {}
): DocumentContextBuilder {
  return new DocumentContextBuilder(config);
}
