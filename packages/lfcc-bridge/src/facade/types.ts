/**
 * LFCC DocumentFacade Types
 *
 * Central type definitions for the single-authority document model.
 * All UI interactions should go through DocumentFacade, not direct Loro access.
 */

import type { gateway } from "@keepup/core";
import type { BlockKind, BlockNode, RichText } from "../crdt/crdtSchema";

/** ApplyPlan type from gateway */
export type ApplyPlan = gateway.ApplyPlan;

// ============================================================================
// Change Events
// ============================================================================

/** Change event type emitted by DocumentFacade subscriptions */
export type FacadeChangeType =
  | "block_inserted"
  | "block_deleted"
  | "block_updated"
  | "content_changed"
  | "annotation_changed"
  | "comment_changed"
  | "message_inserted"
  | "message_updated"
  | "message_streaming"
  | "remote_update";

/** Single change event */
export interface FacadeChangeEvent {
  type: FacadeChangeType;
  blockIds: string[];
  source: "local" | "remote" | "ai";
  metadata?: FacadeChangeMetadata;
}

/** Metadata attached to change events */
export interface FacadeChangeMetadata {
  /** AI Gateway request ID for audit */
  requestId?: string;
  /** AI agent ID */
  agentId?: string;
  /** Intent ID for grouping related operations */
  intentId?: string;
  /** Origin tag (e.g., "user", "ai-gateway", "sync") */
  origin?: string;
}

// ============================================================================
// Intent Types (Mutation API)
// ============================================================================

/** Base intent with audit fields */
export interface BaseIntent {
  /** Operation origin for undo grouping */
  origin?: string;
  /** Skip validation (dev only) */
  skipValidation?: boolean;
}

/** Intent for inserting a new block */
export interface InsertBlockIntent extends BaseIntent {
  /** Parent block ID (null for root level) */
  parentId: string | null;
  /** Index within parent's children (or root blocks) */
  index: number;
  /** Block type */
  type: BlockKind;
  /** Initial text content */
  text?: string;
  /** Initial rich text content */
  richText?: RichText;
  /** Block attributes */
  attrs?: Record<string, unknown>;
}

/** Intent for updating block content */
export interface UpdateContentIntent extends BaseIntent {
  /** Target block ID */
  blockId: string;
  /** New plain text (optional if using richText) */
  text?: string;
  /** New rich text spans */
  richText?: RichText;
  /** Text delta for incremental updates */
  textDelta?: {
    start: number;
    deleteCount: number;
    insertText: string;
  };
}

/** Intent for updating block attributes */
export interface UpdateAttrsIntent extends BaseIntent {
  /** Target block ID */
  blockId: string;
  /** Attributes to merge */
  attrs: Record<string, unknown>;
}

/** Intent for deleting a block */
export interface DeleteBlockIntent extends BaseIntent {
  /** Block ID to delete */
  blockId: string;
}

/** Intent for moving a block */
export interface MoveBlockIntent extends BaseIntent {
  /** Block ID to move */
  blockId: string;
  /** New parent ID (null for root level) */
  newParentId: string | null;
  /** New index within parent's children */
  newIndex: number;
}

// ============================================================================
// Message Types (AI Chat Unification)
// ============================================================================

/** Message role in conversation */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/** Message status for streaming */
export type MessageStatus = "streaming" | "complete" | "error";

/** AI context attached to assistant messages */
// ============================================================================
// AI Native Types (LFCC 0.9.1)
// ============================================================================

/**
 * AI Operation Codes
 */
export type AIOpCode =
  | "OP_AI_GENERATE"
  | "OP_AI_EXPAND"
  | "OP_AI_SUMMARIZE"
  | "OP_AI_REWRITE"
  | "OP_AI_TRANSLATE"
  | "OP_AI_REFINE"
  | "OP_AI_CORRECT"
  | "OP_AI_RESTRUCTURE"
  | "OP_AI_FORMAT"
  | "OP_AI_SPLIT_MERGE"
  | "OP_AI_REVIEW"
  | "OP_AI_SUGGEST"
  | "OP_AI_VALIDATE"
  | "OP_AI_HANDOFF"
  | "OP_AI_DELEGATE"
  | "OP_AI_MERGE_RESOLVE";

/**
 * AI Provenance for content traceability.
 */
export interface AIProvenance {
  model_id: string;
  model_version?: string;
  prompt_hash?: string;
  prompt_template_id?: string;
  temperature?: number;
  input_context_hashes?: string[];
  rationale_summary?: string;
}

/**
 * Edit Intent for AI operation traceability.
 */
export interface EditIntent {
  id: string;
  category:
    | "content_creation"
    | "content_modification"
    | "structure_change"
    | "quality_improvement"
    | "review_feedback"
    | "collaboration";
  description: { short: string; detailed?: string; locale?: string };
  structured?: { action: string; target_aspect?: string; constraints?: Record<string, unknown> };
  chain?: { parent_intent_id?: string; step_index?: number; total_steps?: number };
}

/**
 * AI Generation Record
 */
export interface AIGenerationRecord {
  generation_id: string;
  timestamp: number;
  agent: { agent_id: string; agent_type?: string; model_id: string };
  operation: { op_code: AIOpCode; intent_id?: string };
  affected_range?: { start: number; end: number };
  quality_signals?: {
    confidence: number;
    factuality_check?: "passed" | "failed" | "uncertain";
    style_match?: number;
  };
}

/**
 * Block provenance for AI-generated content tracking.
 */
export interface BlockProvenance {
  origin: "human" | "ai" | "ai_assisted" | "mixed";
  ai_generations?: AIGenerationRecord[];
  review_status?: "pending" | "approved" | "rejected" | "modified";
  reviewed_by?: string;
  reviewed_at?: number;
}

/** Tool call record for assistant messages */
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/** AI context attached to assistant messages */
export interface AIContext {
  /** Model that generated this content */
  model?: string;
  /** Provider (openai, anthropic, etc.) */
  provider?: string;
  /** Token usage */
  tokens?: { input: number; output: number };
  /** Generation latency in ms */
  latencyMs?: number;
  /** Temperature used */
  temperature?: number;
  /** Stop reason */
  stopReason?: "end" | "length" | "tool_call" | "error";
  /** Thinking/reasoning content */
  thinking?: string;
  /** Agent ID for multi-agent scenarios */
  agentId?: string;
  /** Request ID for audit */
  requestId?: string;
  /** Tool calls */
  toolCalls?: ToolCallRecord[];

  // LFCC 0.9.1 AI Native fields
  op_code?: AIOpCode;
  intent_id?: string;
  intent?: EditIntent;
  provenance?: AIProvenance;
  block_provenance?: BlockProvenance;
  confidence?: number;
  agent_id?: string;
  request_id?: string; // Legacy alias for requestId
}

/** Message block representing a chat message */
export interface MessageBlock {
  /** Unique message ID */
  id: string;
  /** Block type (always "message") */
  type: "message";
  /** Message role */
  role: MessageRole;
  /** Message content (rich text) */
  content: RichText;
  /** Plain text content */
  text: string;
  /** Message status */
  status: MessageStatus;
  /** AI context (for assistant messages) */
  aiContext?: AIContext;
  /** Tool calls made */
  toolCalls?: ToolCallRecord[];
  /** Parent message ID (for threading) */
  parentId?: string;
  /** Branch index (0 = main, 1+ = alternatives) */
  branchIndex?: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/** Intent for inserting a message */
export interface InsertMessageIntent extends BaseIntent {
  /** Message role */
  role: MessageRole;
  /** Initial content */
  content?: string;
  /** Rich text content */
  richText?: RichText;
  /** Parent message ID for threading */
  parentId?: string;
  /** AI context for assistant messages */
  aiContext?: AIContext;
}

/** Intent for updating message content */
export interface UpdateMessageIntent extends BaseIntent {
  /** Target message ID */
  messageId: string;
  /** New content */
  content?: string;
  /** Rich text content */
  richText?: RichText;
  /** Updated status */
  status?: MessageStatus;
  /** Updated AI context */
  aiContext?: AIContext;
}

/** Intent for appending streaming chunk */
export interface AppendStreamChunkIntent extends BaseIntent {
  /** Target message ID */
  messageId: string;
  /** Text chunk to append */
  chunk: string;
  /** Whether this is the final chunk */
  isFinal?: boolean;
  /** AI context to set when final */
  aiContext?: AIContext;
}

// ============================================================================
// Comment Types (Parallel Container)
// ============================================================================

/** A single comment on an annotation */
export interface Comment {
  id: string;
  annotationId: string;
  text: string;
  author: string;
  createdAt: number;
}

/** Intent for adding a comment */
export interface AddCommentIntent extends BaseIntent {
  annotationId: string;
  text: string;
  author?: string;
}

/** Intent for deleting a comment */
export interface DeleteCommentIntent extends BaseIntent {
  annotationId: string;
  commentId: string;
}

// ============================================================================
// AI Gateway Integration
// ============================================================================

/** Required metadata for AI writes (enforced by Facade) */
export interface AIWriteMetadata {
  /** AI Gateway request ID (idempotency key) */
  requestId: string;
  /** Agent ID for audit trail */
  agentId: string;
  /** Optional intent ID for operation grouping */
  intentId?: string;
  /** Edit intent details */
  intent?: {
    category: string;
    action: string;
    targetAspect?: string;
  };
}
// Annotation Types
// ============================================================================

/** Annotation span in a block */
export interface FacadeAnnotationSpan {
  blockId: string;
  start: number;
  end: number;
}

/** A document annotation */
export interface AnnotationNode {
  id: string;
  type: string;
  spans: FacadeAnnotationSpan[];
  attrs?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

// ============================================================================
// DocumentFacade Interface
// ============================================================================

/** Callback for subscription */
export type FacadeSubscriber = (event: FacadeChangeEvent) => void;

/**
 * DocumentFacade - Single entry point for UI to interact with Loro document.
 *
 * Design principles:
 * 1. No direct LoroMap/LoroList exposure
 * 2. All mutations via intent-based API
 * 3. AI writes require metadata for audit
 * 4. Subscriptions for reactive UI updates
 */
export interface DocumentFacade {
  // === Document Identity ===
  readonly docId: string;

  // === Block Tree Query API ===

  /** Get all root-level blocks */
  getBlocks(): BlockNode[];

  /** Get a single block by ID */
  getBlock(blockId: string): BlockNode | undefined;

  /** Get block's plain text content */
  getBlockText(blockId: string): string;

  /** Get block's rich text content */
  getBlockRichText(blockId: string): RichText | undefined;

  /** Get block's parsed attributes */
  getBlockAttrs(blockId: string): Record<string, unknown>;

  /** Find block by predicate */
  findBlock(predicate: (block: BlockNode) => boolean): BlockNode | undefined;

  // === Subscription API ===

  /** Subscribe to document changes */
  subscribe(callback: FacadeSubscriber): () => void;

  // === Intent-Based Mutation API ===

  /** Insert a new block */
  insertBlock(intent: InsertBlockIntent): string;

  /** Update block content */
  updateBlockContent(intent: UpdateContentIntent): void;

  /** Update block attributes */
  updateBlockAttrs(intent: UpdateAttrsIntent): void;

  /** Delete a block */
  deleteBlock(intent: DeleteBlockIntent): void;

  /** Move a block to a new position */
  moveBlock(intent: MoveBlockIntent): void;

  // === AI Gateway Integration ===

  /**
   * Apply an AI-generated plan with required metadata.
   * Throws if metadata is missing or invalid.
   */
  applyAIPlan(plan: ApplyPlan, metadata: AIWriteMetadata): Promise<void>;

  // === Annotation API ===

  /** Get all annotations */
  getAnnotations(): AnnotationNode[];

  /** Get a single annotation */
  getAnnotation(annotationId: string): AnnotationNode | undefined;

  // === Comment API (Parallel Container) ===

  /** Get annotation IDs that have comment threads */
  getCommentAnnotationIds(): string[];

  /** Get comments for an annotation */
  getComments(annotationId: string): Comment[];

  /** Add a comment */
  addComment(intent: AddCommentIntent): string;

  /** Delete a comment */
  deleteComment(intent: DeleteCommentIntent): void;

  // === Message API (AI Chat) ===

  /** Get all messages in conversation order */
  getMessages(): MessageBlock[];

  /** Get a single message by ID */
  getMessage(messageId: string): MessageBlock | undefined;

  /** Insert a new message */
  insertMessage(intent: InsertMessageIntent): string;

  /** Update message content */
  updateMessage(intent: UpdateMessageIntent): void;

  /** Create a streaming message placeholder */
  createStreamingMessage(role: MessageRole, aiContext?: AIContext): string;

  /** Append a chunk to a streaming message */
  appendStreamChunk(intent: AppendStreamChunkIntent): void;

  /** Finalize a streaming message */
  finalizeMessage(messageId: string, aiContext?: AIContext): void;

  /** Delete messages older than timestamp (for retention policy) */
  deleteMessagesOlderThan(timestamp: number): number;

  // === Utility ===

  /** Commit pending changes with origin tag */
  commit(origin?: string): void;

  /** Check if facade is in degraded mode */
  isDegraded(): boolean;
}

// ============================================================================
// Strict Mode Configuration
// ============================================================================

/**
 * Enable strict mode to prevent direct doc.getMap/getList access.
 * Set LFCC_UNSAFE_DIRECT_ACCESS=true to bypass (for benchmarks).
 */
export const FACADE_STRICT_MODE =
  typeof process !== "undefined" && process.env?.LFCC_UNSAFE_DIRECT_ACCESS !== "true";
