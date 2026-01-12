/**
 * Unified Streaming Controller
 *
 * Bridges the enhanced document model with the optimized streaming parser.
 * Features:
 * - Zero-copy buffer management
 * - Adaptive batching based on token rate
 * - Automatic AST to ProseMirror conversion
 * - Performance telemetry
 */

import type { Node as ProseMirrorNode, Schema } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import {
  type ASTNode,
  type StreamingMarkdownParser,
  createStreamingParser,
} from "@keepup/lfcc-bridge";

import { type AIContext, type EnhancedDocument, updateMessageContent } from "@keepup/lfcc-bridge";

// ============================================================================
// Types
// ============================================================================

export interface StreamingControllerOptions {
  /** Editor view */
  view: EditorView;
  /** Document being updated */
  document: EnhancedDocument;
  /** Message ID to stream into */
  messageId: string;
  /** AI context for the message */
  aiContext?: AIContext;
  /** Callback when chunk is processed */
  onChunk?: (chunk: string, tokens: number) => void;
  /** Callback when streaming completes */
  onComplete?: (stats: StreamingStats) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Callback to update document */
  onDocumentUpdate?: (doc: EnhancedDocument) => void;
  /** Target batch size in ms (default: 16ms for 60fps) */
  batchIntervalMs?: number;
  /** Adaptive batching based on token rate */
  adaptiveBatching?: boolean;
}

export interface StreamingStats {
  /** Total characters received */
  totalChars: number;
  /** Total tokens (estimated) */
  totalTokens: number;
  /** Duration in ms */
  durationMs: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Number of batched updates */
  batchCount: number;
  /** Parser cache hit ratio */
  cacheHitRatio: number;
  /** Average batch interval */
  avgBatchIntervalMs: number;
}

export interface StreamingState {
  isActive: boolean;
  isPaused: boolean;
  totalContent: string;
  parsedContent: string;
  startTime: number;
  lastUpdateTime: number;
  batchCount: number;
  tokenRate: number; // tokens/sec moving average
}

// ============================================================================
// StreamingController
// ============================================================================

export class StreamingController {
  private parser: StreamingMarkdownParser;
  private options: Required<StreamingControllerOptions>;
  private state: StreamingState;
  private document: EnhancedDocument;

  // Batching
  private pendingNodes: ASTNode[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private batchIntervals: number[] = [];

  // Performance tracking
  private chunkTimestamps: number[] = [];
  private readonly MAX_RATE_SAMPLES = 20;

  constructor(options: StreamingControllerOptions) {
    this.parser = createStreamingParser({ gfm: true });
    this.document = options.document;
    // biome-ignore lint/suspicious/noEmptyBlockStatements: default no-op callbacks are intentional
    const noop = () => {};
    this.options = {
      view: options.view,
      document: options.document,
      messageId: options.messageId,
      aiContext: options.aiContext ?? {},
      onChunk: options.onChunk ?? noop,
      onComplete: options.onComplete ?? noop,
      onError: options.onError ?? noop,
      onDocumentUpdate: options.onDocumentUpdate ?? noop,
      batchIntervalMs: options.batchIntervalMs ?? 16,
      adaptiveBatching: options.adaptiveBatching ?? true,
    };

    this.state = {
      isActive: true,
      isPaused: false,
      totalContent: "",
      parsedContent: "",
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      batchCount: 0,
      tokenRate: 0,
    };
  }

  /**
   * Append streaming chunk.
   */
  append(chunk: string): void {
    if (!this.state.isActive || this.state.isPaused) {
      return;
    }

    const now = Date.now();
    this.state.totalContent += chunk;
    this.chunkTimestamps.push(now);

    // Update token rate (moving average)
    this.updateTokenRate(chunk.length);

    // Parse incrementally
    const result = this.parser.push(chunk);

    if (result.nodes.length > 0) {
      this.pendingNodes.push(...result.nodes);
      this.scheduleBatch();
    }

    // Notify callback
    const estimatedTokens = Math.ceil(chunk.length / 4);
    this.options.onChunk(chunk, estimatedTokens);
  }

  /**
   * Pause streaming updates.
   */
  pause(): void {
    this.state.isPaused = true;
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Resume streaming updates.
   */
  resume(): void {
    this.state.isPaused = false;
    if (this.pendingNodes.length > 0) {
      this.scheduleBatch();
    }
  }

  /**
   * Finalize streaming.
   */
  finalize(): void {
    if (!this.state.isActive) {
      return;
    }

    this.state.isActive = false;

    // Flush remaining content
    const result = this.parser.flush();
    if (result.nodes.length > 0) {
      this.pendingNodes.push(...result.nodes);
    }

    // Force final batch
    this.flushBatch();

    // Update document to mark streaming complete
    this.updateMessageStatus("complete");

    // Calculate stats
    const stats = this.calculateStats();
    this.options.onComplete(stats);
  }

  /**
   * Abort streaming.
   */
  abort(): void {
    if (!this.state.isActive) {
      return;
    }

    this.state.isActive = false;

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.parser.reset();
    this.updateMessageStatus("error");
  }

  /**
   * Get current state.
   */
  getState(): StreamingState {
    return { ...this.state };
  }

  /**
   * Get current document.
   */
  getDocument(): EnhancedDocument {
    return this.document;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private updateTokenRate(_chunkSize: number): void {
    // Prune old samples
    const now = Date.now();
    const cutoff = now - 3000; // 3 second window
    while (this.chunkTimestamps.length > 0 && this.chunkTimestamps[0] < cutoff) {
      this.chunkTimestamps.shift();
    }

    // Calculate rate
    if (this.chunkTimestamps.length >= 2) {
      const span = now - this.chunkTimestamps[0];
      const chars = this.state.totalContent.length;
      const tokens = Math.ceil(chars / 4);
      this.state.tokenRate = (tokens / span) * 1000;
    }
  }

  private scheduleBatch(): void {
    if (this.batchTimeout) {
      return;
    }

    // Adaptive batching: slower rate = larger batches
    let interval = this.options.batchIntervalMs;
    if (this.options.adaptiveBatching && this.state.tokenRate > 0) {
      // High token rate (>100/s): smaller batches for responsiveness
      // Low token rate (<20/s): larger batches to avoid excessive updates
      if (this.state.tokenRate > 100) {
        interval = Math.max(8, interval * 0.5);
      } else if (this.state.tokenRate < 20) {
        interval = Math.min(50, interval * 2);
      }
    }

    this.batchTimeout = setTimeout(() => {
      this.batchTimeout = null;
      this.flushBatch();
    }, interval);
  }

  private flushBatch(): void {
    if (this.pendingNodes.length === 0) {
      return;
    }

    const nodes = this.pendingNodes.splice(0);
    const now = Date.now();

    // Track batch interval
    if (this.state.lastUpdateTime > 0) {
      this.batchIntervals.push(now - this.state.lastUpdateTime);
    }
    this.state.lastUpdateTime = now;
    this.state.batchCount++;

    try {
      this.applyNodesToEditor(nodes);
    } catch (error) {
      this.options.onError(error as Error);
    }
  }

  private applyNodesToEditor(nodes: ASTNode[]): void {
    const { view } = this.options;
    if (view.isDestroyed) {
      return;
    }

    const { state } = view;
    const { schema } = state;

    // Convert AST nodes to ProseMirror nodes
    const pmNodes = this.astToProseMirror(nodes, schema);
    if (pmNodes.length === 0) {
      return;
    }

    // Find the message block position
    const messagePos = this.findMessageBlockPos();
    if (messagePos === null) {
      return;
    }

    // Get insertion position (end of message block)
    const messageNode = state.doc.nodeAt(messagePos);
    if (!messageNode || messageNode.type.name !== "message") {
      return;
    }

    const insertPos = messagePos + messageNode.content.size + 1;

    // Create transaction
    let tr = state.tr;

    // Insert nodes
    for (const node of pmNodes) {
      tr = tr.insert(insertPos, node);
    }

    // Mark as streaming update
    tr = tr.setMeta("streaming", true);
    tr = tr.setMeta("addToHistory", false);

    // Preserve user's selection if outside streaming area
    const { selection } = state;
    if (selection.to <= messagePos) {
      tr = tr.setSelection(TextSelection.create(tr.doc, selection.anchor, selection.head));
    }

    view.dispatch(tr.scrollIntoView());

    // Update document model
    this.updateParsedContent(nodes);
  }

  private astToProseMirror(nodes: ASTNode[], schema: Schema): ProseMirrorNode[] {
    const result: ProseMirrorNode[] = [];

    for (const node of nodes) {
      const pmNode = this.convertNode(node, schema);
      if (pmNode) {
        result.push(pmNode);
      }
    }

    return result;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: AST to ProseMirror conversion with multiple node types
  private convertNode(node: ASTNode, schema: Schema): ProseMirrorNode | null {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: inline content parsing with mark handling
    const getInlineContent = (children?: ASTNode[]): ProseMirrorNode[] => {
      if (!children) {
        return [];
      }
      const inline: ProseMirrorNode[] = [];

      for (const child of children) {
        if (child.type === "text" && child.content) {
          inline.push(schema.text(child.content));
        } else if (child.type === "strong" && child.content) {
          if (schema.marks.bold) {
            inline.push(schema.text(child.content, [schema.marks.bold.create()]));
          }
        } else if (child.type === "emphasis" && child.content) {
          if (schema.marks.italic) {
            inline.push(schema.text(child.content, [schema.marks.italic.create()]));
          }
        } else if (child.type === "code" && child.content) {
          if (schema.marks.code) {
            inline.push(schema.text(child.content, [schema.marks.code.create()]));
          }
        } else if (child.type === "strikethrough" && child.content) {
          if (schema.marks.strike) {
            inline.push(schema.text(child.content, [schema.marks.strike.create()]));
          }
        } else if (child.type === "link" && child.content) {
          if (schema.marks.link) {
            inline.push(
              schema.text(child.content, [
                schema.marks.link.create({ href: child.attrs?.href ?? "" }),
              ])
            );
          }
        }
      }

      return inline;
    };

    switch (node.type) {
      case "paragraph":
        return schema.nodes.paragraph?.create({}, getInlineContent(node.children)) ?? null;

      case "heading": {
        const level = node.attrs?.level ?? 1;
        return schema.nodes.heading?.create({ level }, getInlineContent(node.children)) ?? null;
      }

      case "code_block": {
        const content = node.content ?? "";
        const text = content ? schema.text(content) : null;
        return (
          schema.nodes.code_block?.create({ language: node.attrs?.language }, text ? [text] : []) ??
          null
        );
      }

      case "blockquote": {
        const para = schema.nodes.paragraph?.create({}, getInlineContent(node.children));
        return para ? (schema.nodes.quote?.create({}, [para]) ?? null) : null;
      }

      case "list_item": {
        const listType = node.attrs?.listType ?? "bullet";
        return (
          schema.nodes.paragraph?.create(
            { list_type: listType },
            getInlineContent(node.children)
          ) ?? null
        );
      }

      case "task_item": {
        return (
          schema.nodes.paragraph?.create(
            { list_type: "task", task_checked: node.attrs?.checked ?? false },
            getInlineContent(node.children)
          ) ?? null
        );
      }

      case "horizontal_rule":
        return schema.nodes.horizontalRule?.create() ?? null;

      case "table": {
        const rows = (node.children ?? [])
          .map((row) => {
            const cells = (row.children ?? [])
              .map((cell) => {
                const para = schema.nodes.paragraph?.create({}, getInlineContent(cell.children));
                return schema.nodes.table_cell?.create({}, para ? [para] : []);
              })
              .filter(Boolean);
            return schema.nodes.table_row?.create({}, cells);
          })
          .filter(Boolean);
        return schema.nodes.table?.create({}, rows) ?? null;
      }

      default:
        return null;
    }
  }

  private findMessageBlockPos(): number | null {
    const { view } = this.options;
    const { doc } = view.state;

    let foundPos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === "message" && node.attrs.message_id === this.options.messageId) {
        foundPos = pos;
        return false;
      }
      return true;
    });

    return foundPos;
  }

  private updateParsedContent(nodes: ASTNode[]): void {
    // Append to parsed content tracking
    for (const node of nodes) {
      if (node.content) {
        this.state.parsedContent += node.content;
      }
      if (node.children) {
        for (const child of node.children) {
          if (child.content) {
            this.state.parsedContent += child.content;
          }
        }
      }
    }
  }

  private updateMessageStatus(status: "complete" | "error"): void {
    this.document = updateMessageContent(
      this.document,
      this.options.messageId,
      this.state.totalContent,
      {
        status,
        aiContext: {
          ...this.options.aiContext,
          tokens: {
            input: 0,
            output: Math.ceil(this.state.totalContent.length / 4),
          },
          latencyMs: Date.now() - this.state.startTime,
          stopReason: status === "complete" ? "end" : "error",
        },
      }
    );

    this.options.onDocumentUpdate(this.document);
  }

  private calculateStats(): StreamingStats {
    const durationMs = Date.now() - this.state.startTime;
    const totalChars = this.state.totalContent.length;
    const totalTokens = Math.ceil(totalChars / 4);
    const cacheStats = this.parser.getCacheStats();

    const avgBatchInterval =
      this.batchIntervals.length > 0
        ? this.batchIntervals.reduce((a, b) => a + b, 0) / this.batchIntervals.length
        : 0;

    return {
      totalChars,
      totalTokens,
      durationMs,
      tokensPerSecond: durationMs > 0 ? (totalTokens / durationMs) * 1000 : 0,
      batchCount: this.state.batchCount,
      cacheHitRatio: cacheStats.ratio,
      avgBatchIntervalMs: avgBatchInterval,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a streaming controller instance.
 */
export function createStreamingController(
  options: StreamingControllerOptions
): StreamingController {
  return new StreamingController(options);
}
