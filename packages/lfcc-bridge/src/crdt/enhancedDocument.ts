/**
 * Enhanced Unified Document Model v2
 *
 * Deep optimization for:
 * - Feature Richness: Branching, versioning, annotations, AI context
 * - Flexibility: Plugins, custom block types, schema extensions
 * - Performance: Immutable operations, lazy evaluation, efficient diffs
 *
 * Inspired by Linear, Notion, and Claude's artifact system.
 */

import type { ASTNode } from "../streaming";
import { createStreamingParser } from "../streaming";
import type { BlockKind, BlockNode, MarkType, RichText, TextSpan } from "./crdtSchema";
import { isContainerBlock, parseAttrs, serializeAttrs } from "./crdtSchema";

/** Simple ID generator (replaces generateId for zero dependencies) */
function generateId(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const timestamp = Date.now().toString(36);
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${timestamp.slice(-4)}${result}`;
}

// ============================================================================
// Core Types
// ============================================================================

export type DocumentMode = "chat" | "document" | "hybrid" | "canvas";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type BlockStatus = "draft" | "streaming" | "complete" | "error";

/**
 * Rich text content with inline formatting preserved.
 */
export interface RichTextContent {
  text: string;
  marks?: TextMark[];
}

export interface TextMark {
  type: "bold" | "italic" | "underline" | "code" | "strike" | "link" | "highlight" | "comment";
  attrs?: Record<string, unknown>;
  /** Start offset in text */
  from?: number;
  /** End offset in text */
  to?: number;
}

// ============================================================================
// LFCC 0.9.1 AI Native Types
// ============================================================================

/**
 * AI Operation Codes (LFCC 0.9.1 AI Native)
 */
export type AIOpCode =
  // Content Generation
  | "OP_AI_GENERATE"
  | "OP_AI_EXPAND"
  | "OP_AI_SUMMARIZE"
  // Content Modification
  | "OP_AI_REWRITE"
  | "OP_AI_TRANSLATE"
  | "OP_AI_REFINE"
  | "OP_AI_CORRECT"
  // Structural
  | "OP_AI_RESTRUCTURE"
  | "OP_AI_FORMAT"
  | "OP_AI_SPLIT_MERGE"
  // Review
  | "OP_AI_REVIEW"
  | "OP_AI_SUGGEST"
  | "OP_AI_VALIDATE"
  // Collaboration
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
 * Block provenance for AI-generated content tracking.
 */
export interface BlockProvenance {
  origin: "human" | "ai" | "ai_assisted" | "mixed";
  ai_generations?: AIGenerationRecord[];
  review_status?: "pending" | "approved" | "rejected" | "modified";
  reviewed_by?: string;
  reviewed_at?: number;
}

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
 * AI Context attached to blocks/messages.
 * Extended with LFCC 0.9.1 AI Native fields.
 */
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
  /** Tool calls made */
  toolCalls?: ToolCallRecord[];
  /** Thinking/reasoning (if available) */
  thinking?: string;

  // LFCC 0.9.1 AI Native fields
  /** AI Operation Code */
  op_code?: AIOpCode;
  /** Associated EditIntent ID */
  intent_id?: string;
  /** Full EditIntent object */
  intent?: EditIntent;
  /** AI Generation provenance */
  provenance?: AIProvenance;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Agent ID for multi-agent scenarios */
  agent_id?: string;
  /** Request ID for idempotency/audit */
  request_id?: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Message metadata with rich AI context.
 */
export interface MessageMetadata {
  role: MessageRole;
  messageId: string;
  timestamp: number;
  /** AI generation context */
  ai?: AIContext;
  /** Parent message ID (for branches) */
  parentId?: string;
  /** Branch index (0 = main, 1+ = alternatives) */
  branchIndex?: number;
  /** User feedback */
  feedback?: "positive" | "negative" | null;
  /** Edit history */
  edits?: MessageEdit[];
}

export interface MessageEdit {
  timestamp: number;
  previousContent: string;
  editor: "user" | "ai";
}

/**
 * Block annotations for comments, suggestions, etc.
 */
export interface BlockAnnotation {
  id: string;
  type: "comment" | "suggestion" | "highlight" | "reference" | "citation";
  /** Text range in block */
  range?: { from: number; to: number };
  content: string;
  author?: string;
  timestamp: number;
  resolved?: boolean;
  /** Thread replies */
  replies?: BlockAnnotation[];
}

/**
 * Enhanced block with rich metadata.
 */
export interface EnhancedBlock {
  /** Unique block ID */
  id: string;
  /** Block type */
  type: BlockType;
  /** Rich text content */
  content: RichTextContent[];
  /** Block attributes */
  attrs: BlockAttrs;
  /** Block status */
  status: BlockStatus;
  /** Nested children (for containers) */
  children?: EnhancedBlock[];
  /** Message metadata (chat mode) */
  message?: MessageMetadata;
  /** Block annotations */
  annotations?: BlockAnnotation[];
  /** Block-level AI context */
  aiContext?: AIContext;
  /** Custom metadata for plugins */
  meta?: Record<string, unknown>;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

export type BlockType =
  | "paragraph"
  | "heading"
  | "quote"
  | "code_block"
  | "list_item"
  | "task_item"
  | "table"
  | "table_row"
  | "table_cell"
  | "image"
  | "video"
  | "embed"
  | "message"
  | "callout"
  | "toggle"
  | "divider"
  | "column_list"
  | "column"
  | "synced_block"
  | "equation"
  | "file"
  | "bookmark";

export interface BlockAttrs {
  /** List type for list/task items */
  listType?: "bullet" | "ordered" | "task";
  /** Indent level */
  indentLevel?: number;
  /** Task checked state */
  checked?: boolean;
  /** Heading level */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Code language */
  language?: string;
  /** Media source URL */
  src?: string;
  /** Alt text for images */
  alt?: string;
  /** Caption */
  caption?: string;
  /** Callout type */
  calloutType?: "info" | "warning" | "error" | "success" | "note";
  /** Callout icon */
  icon?: string;
  /** Toggle collapsed state */
  collapsed?: boolean;
  /** Column width ratio */
  columnRatio?: number;
  /** Table cell attributes */
  colspan?: number;
  rowspan?: number;
  /** Reference to synced block source */
  syncedSourceId?: string;
  /** Custom attributes */
  [key: string]: unknown;
}

/**
 * Document outline node.
 */
export interface OutlineNode {
  id: string;
  title: string;
  level: number;
  blockId: string;
  children: OutlineNode[];
}

/**
 * Document version for history.
 */
export interface DocumentVersion {
  id: string;
  title: string;
  timestamp: number;
  blocks: EnhancedBlock[];
  author?: string;
  description?: string;
}

/**
 * Branch for alternative conversation paths.
 */
export interface ConversationBranch {
  id: string;
  name: string;
  parentMessageId: string;
  blocks: EnhancedBlock[];
  createdAt: number;
}

/**
 * Enhanced Unified Document with full feature set.
 */
export interface EnhancedDocument {
  // Core
  id: string;
  title: string;
  mode: DocumentMode;
  blocks: EnhancedBlock[];

  // Chat-specific
  threadId?: string;
  systemPrompt?: string;
  branches?: ConversationBranch[];
  activeBranchId?: string;

  // Document-specific
  outline?: OutlineNode[];
  tableOfContents?: boolean;
  coverImage?: string;
  icon?: string;

  // Collaboration
  participants?: string[];
  permissions?: DocumentPermissions;

  // Versioning
  version: number;
  history?: DocumentVersion[];
  maxHistoryVersions?: number;

  // AI Context
  defaultModel?: string;
  totalTokensUsed?: number;
  contextWindow?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  tags?: string[];
  properties?: Record<string, unknown>;
}

export interface DocumentPermissions {
  owner: string;
  editors?: string[];
  viewers?: string[];
  public?: boolean;
}

// ============================================================================
// Real-time Collaboration Types
// ============================================================================

/**
 * User presence in a document (for real-time collaboration).
 */
export interface UserPresence {
  userId: string;
  userName?: string;
  avatarUrl?: string;
  color: string;
  cursor?: { blockId: string; offset: number };
  selection?: { blockId: string; from: number; to: number };
  lastActiveAt: number;
  isTyping?: boolean;
}

/**
 * Collaboration state for a document.
 */
export interface CollaborationState {
  /** Active participants with their positions */
  presence: UserPresence[];
  /** Whether real-time sync is active */
  connected: boolean;
  /** Pending local changes not yet synced */
  pendingChanges: number;
}

// ============================================================================
// Block-level Permissions
// ============================================================================

/**
 * Permissions for a specific block (more granular than document-level).
 */
export interface BlockPermissions {
  /** Users who can edit this block */
  editors?: string[];
  /** Users who can view this block */
  viewers?: string[];
  /** Whether this block is locked from editing */
  locked?: boolean;
  /** User who locked the block */
  lockedBy?: string;
  /** When the lock expires */
  lockExpiresAt?: number;
}

// ============================================================================
// Cross-document Links
// ============================================================================

/**
 * Link to another document or block.
 */
export interface DocumentLink {
  id: string;
  /** Target document ID */
  targetDocId: string;
  /** Target block ID (optional, for block-level links) */
  targetBlockId?: string;
  /** Display label */
  label?: string;
  /** Link type */
  type: "reference" | "embed" | "backlink" | "mention";
  /** When the link was created */
  createdAt: number;
}

// ============================================================================
// Template System
// ============================================================================

/**
 * Template definition for creating new documents/blocks.
 */
export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  /** Template blocks to copy */
  blocks: EnhancedBlock[];
  /** Variables to replace in content */
  variables?: TemplateVariable[];
  /** Category for organization */
  category?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: "text" | "date" | "select" | "user";
  defaultValue?: string;
  options?: string[];
  required?: boolean;
}

// ============================================================================
// Document Operations (Immutable)
// ============================================================================

/**
 * Operation types for document mutations.
 */
export type DocumentOperation =
  | { type: "INSERT_BLOCK"; blockId: string; block: EnhancedBlock; afterBlockId?: string }
  | { type: "UPDATE_BLOCK"; blockId: string; updates: Partial<EnhancedBlock> }
  | { type: "DELETE_BLOCK"; blockId: string }
  | { type: "MOVE_BLOCK"; blockId: string; afterBlockId?: string }
  | { type: "SET_MODE"; mode: DocumentMode }
  | { type: "UPDATE_TITLE"; title: string }
  | { type: "SET_SYSTEM_PROMPT"; systemPrompt: string | null }
  | { type: "ADD_ANNOTATION"; blockId: string; annotation: BlockAnnotation }
  | { type: "REMOVE_ANNOTATION"; blockId: string; annotationId: string }
  | { type: "CREATE_BRANCH"; parentMessageId: string; branchName?: string }
  | { type: "SWITCH_BRANCH"; branchId: string }
  | { type: "SNAPSHOT_VERSION"; description?: string };

/**
 * Apply an operation to a document (immutable).
 */
export function applyOperation(
  doc: EnhancedDocument,
  operation: DocumentOperation
): EnhancedDocument {
  const now = Date.now();

  switch (operation.type) {
    case "INSERT_BLOCK": {
      const { block, afterBlockId } = operation;
      let newBlocks: EnhancedBlock[];

      if (!afterBlockId) {
        newBlocks = [...doc.blocks, block];
      } else {
        const index = doc.blocks.findIndex((b) => b.id === afterBlockId);
        newBlocks = [...doc.blocks.slice(0, index + 1), block, ...doc.blocks.slice(index + 1)];
      }

      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "UPDATE_BLOCK": {
      const { blockId, updates } = operation;
      const newBlocks = doc.blocks.map((block) =>
        block.id === blockId ? { ...block, ...updates, updatedAt: now } : block
      );
      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "DELETE_BLOCK": {
      const newBlocks = doc.blocks.filter((b) => b.id !== operation.blockId);
      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "MOVE_BLOCK": {
      const { blockId, afterBlockId } = operation;
      const block = doc.blocks.find((b) => b.id === blockId);
      if (!block) {
        return doc;
      }

      const withoutBlock = doc.blocks.filter((b) => b.id !== blockId);
      const insertIndex = afterBlockId
        ? withoutBlock.findIndex((b) => b.id === afterBlockId) + 1
        : withoutBlock.length;

      const newBlocks = [
        ...withoutBlock.slice(0, insertIndex),
        block,
        ...withoutBlock.slice(insertIndex),
      ];

      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "SET_MODE": {
      return { ...doc, mode: operation.mode, updatedAt: now, version: doc.version + 1 };
    }

    case "UPDATE_TITLE": {
      return { ...doc, title: operation.title, updatedAt: now, version: doc.version + 1 };
    }

    case "SET_SYSTEM_PROMPT": {
      return {
        ...doc,
        systemPrompt: operation.systemPrompt ?? undefined,
        updatedAt: now,
        version: doc.version + 1,
      };
    }

    case "ADD_ANNOTATION": {
      const { blockId, annotation } = operation;
      const newBlocks = doc.blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }
        return {
          ...block,
          annotations: [...(block.annotations ?? []), annotation],
          updatedAt: now,
        };
      });
      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "REMOVE_ANNOTATION": {
      const { blockId, annotationId } = operation;
      const newBlocks = doc.blocks.map((block) => {
        if (block.id !== blockId) {
          return block;
        }
        return {
          ...block,
          annotations: block.annotations?.filter((a) => a.id !== annotationId),
          updatedAt: now,
        };
      });
      return { ...doc, blocks: newBlocks, updatedAt: now, version: doc.version + 1 };
    }

    case "CREATE_BRANCH": {
      const branchId = generateId(8);
      const branch: ConversationBranch = {
        id: branchId,
        name: operation.branchName ?? `Branch ${(doc.branches?.length ?? 0) + 1}`,
        parentMessageId: operation.parentMessageId,
        blocks: [],
        createdAt: now,
      };
      return {
        ...doc,
        branches: [...(doc.branches ?? []), branch],
        activeBranchId: branchId,
        updatedAt: now,
        version: doc.version + 1,
      };
    }

    case "SWITCH_BRANCH": {
      return {
        ...doc,
        activeBranchId: operation.branchId,
        updatedAt: now,
        version: doc.version + 1,
      };
    }

    case "SNAPSHOT_VERSION": {
      const version: DocumentVersion = {
        id: generateId(8),
        title: doc.title,
        timestamp: now,
        blocks: structuredClone(doc.blocks),
        description: operation.description,
      };
      const history = [...(doc.history ?? []), version];
      const maxVersions = doc.maxHistoryVersions ?? 50;
      const trimmedHistory = history.slice(-maxVersions);

      return {
        ...doc,
        history: trimmedHistory,
        updatedAt: now,
        version: doc.version + 1,
      };
    }

    default:
      return doc;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new enhanced document.
 */
export function createEnhancedDocument(
  mode: DocumentMode,
  options: Partial<EnhancedDocument> = {}
): EnhancedDocument {
  const now = Date.now();
  const id = options.id ?? generateId(12);

  return {
    id,
    title: options.title ?? (mode === "chat" ? "New Chat" : "Untitled"),
    mode,
    blocks: options.blocks ?? [],
    threadId: mode === "chat" ? (options.threadId ?? generateId(8)) : undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

/**
 * Update the document system prompt.
 */
export function setSystemPrompt(
  doc: EnhancedDocument,
  systemPrompt: string | null
): EnhancedDocument {
  return applyOperation(doc, { type: "SET_SYSTEM_PROMPT", systemPrompt });
}

/**
 * Create a new block.
 */
export function createBlock(
  type: BlockType,
  content = "",
  attrs: Partial<BlockAttrs> = {}
): EnhancedBlock {
  const now = Date.now();

  return {
    id: generateId(8),
    type,
    content: [{ text: content }],
    attrs: attrs as BlockAttrs,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a message block for chat mode.
 */
export function createMessageBlock(
  role: MessageRole,
  content: string,
  aiContext?: AIContext
): EnhancedBlock {
  const now = Date.now();
  const messageId = generateId(8);
  const messageContent = [{ text: content }];
  const contentBlock = createBlock("paragraph", content);

  return {
    id: generateId(8),
    type: "message",
    content: messageContent,
    children: [contentBlock],
    attrs: {},
    status: "complete",
    message: {
      role,
      messageId,
      timestamp: now,
      ai: aiContext,
    },
    aiContext,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a streaming message placeholder.
 */
export function createStreamingBlock(model?: string, provider?: string): EnhancedBlock {
  const now = Date.now();
  const messageId = generateId(8);
  const contentBlock = createBlock("paragraph", "");

  return {
    id: generateId(8),
    type: "message",
    content: [],
    children: [contentBlock],
    attrs: {},
    status: "streaming",
    message: {
      role: "assistant",
      messageId,
      timestamp: now,
      ai: { model, provider },
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a task item block.
 */
export function createTaskBlock(
  content: string,
  checked = false,
  options: { indentLevel?: number; priority?: "low" | "medium" | "high" } = {}
): EnhancedBlock {
  const now = Date.now();

  return {
    id: generateId(8),
    type: "task_item",
    content: [{ text: content }],
    attrs: {
      listType: "task",
      checked,
      indentLevel: options.indentLevel ?? 0,
      priority: options.priority,
    },
    status: "complete",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Toggle the checked state of a task block.
 */
export function toggleTaskChecked(doc: EnhancedDocument, blockId: string): EnhancedDocument {
  const now = Date.now();
  const updatedBlocks = doc.blocks.map((block) => {
    if (block.id === blockId && (block.type === "task_item" || block.attrs.listType === "task")) {
      return {
        ...block,
        attrs: { ...block.attrs, checked: !block.attrs.checked },
        updatedAt: now,
      };
    }
    return block;
  });

  return { ...doc, blocks: updatedBlocks, updatedAt: now, version: doc.version + 1 };
}

/**
 * Get all task blocks from a document.
 */
export function getTaskBlocks(doc: EnhancedDocument): EnhancedBlock[] {
  return doc.blocks.filter((b) => b.type === "task_item" || b.attrs.listType === "task");
}

/**
 * Get task completion statistics.
 */
export function getTaskStats(doc: EnhancedDocument): {
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
} {
  const tasks = getTaskBlocks(doc);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.attrs.checked).length;
  const pending = total - completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, completionRate };
}

// ============================================================================
// Chat & Content Helpers
// ============================================================================

function joinContentText(content: RichTextContent[]): string {
  return content.map((c) => c.text).join("");
}

/**
 * Extract plain text from a block, falling back to children when present.
 */
export function getBlockText(block: EnhancedBlock): string {
  if (block.children && block.children.length > 0) {
    const childText = block.children.map(getBlockText).filter(Boolean).join("\n");
    if (childText.trim().length > 0) {
      return childText;
    }
  }
  return joinContentText(block.content);
}

/**
 * Extract message text, preferring structured children.
 */
export function getMessageText(block: EnhancedBlock): string {
  if (block.children && block.children.length > 0) {
    return block.children.map(getBlockText).filter(Boolean).join("\n");
  }
  return joinContentText(block.content);
}

/**
 * List chat message blocks in order.
 */
export function listMessages(doc: EnhancedDocument): EnhancedBlock[] {
  return doc.blocks.filter((block) => block.type === "message" || block.message);
}

/**
 * Append a message to the document.
 */
export function appendMessage(
  doc: EnhancedDocument,
  role: MessageRole,
  content: string,
  aiContext?: AIContext
): EnhancedDocument {
  const block = createMessageBlock(role, content, aiContext);
  return applyOperation(doc, { type: "INSERT_BLOCK", blockId: block.id, block });
}

/**
 * Update message content by messageId.
 */
export function updateMessageContent(
  doc: EnhancedDocument,
  messageId: string,
  content: string,
  options: { status?: BlockStatus; aiContext?: AIContext } = {}
): EnhancedDocument {
  const block = findMessage(doc, messageId);
  if (!block) {
    return doc;
  }

  const now = Date.now();
  const updatedChildren = updateMessageChildren(block, content, now);
  const baseAIContext = block.aiContext ?? block.message?.ai;
  const resolvedAIContext = options.aiContext
    ? { ...(baseAIContext ?? {}), ...options.aiContext }
    : baseAIContext;
  const updatedMessage = block.message
    ? {
        ...block.message,
        ...(resolvedAIContext ? { ai: resolvedAIContext } : {}),
      }
    : undefined;

  return applyOperation(doc, {
    type: "UPDATE_BLOCK",
    blockId: block.id,
    updates: {
      content: [{ text: content }],
      children: updatedChildren,
      status: options.status ?? block.status,
      aiContext: resolvedAIContext,
      ...(updatedMessage ? { message: updatedMessage } : {}),
      updatedAt: now,
    },
  });
}

/**
 * Remove a message by messageId.
 */
export function removeMessage(doc: EnhancedDocument, messageId: string): EnhancedDocument {
  const block = findMessage(doc, messageId);
  if (!block) {
    return doc;
  }
  return applyOperation(doc, { type: "DELETE_BLOCK", blockId: block.id });
}

function updateMessageChildren(
  block: EnhancedBlock,
  content: string,
  now: number
): EnhancedBlock[] {
  if (block.children && block.children.length > 0) {
    const [primary, ...rest] = block.children;
    const updatedPrimary: EnhancedBlock = {
      ...primary,
      content: [{ text: content }],
      updatedAt: now,
    };
    return [updatedPrimary, ...rest];
  }

  return [
    {
      id: `${block.id}_content`,
      type: "paragraph",
      content: [{ text: content }],
      attrs: {},
      status: "complete",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// ============================================================================
// Template System Helpers
// ============================================================================

/**
 * Create a new document from a template.
 */
export function createFromTemplate(
  template: DocumentTemplate,
  variables: Record<string, string> = {}
): EnhancedDocument {
  const now = Date.now();

  // Deep clone and apply variable substitutions
  const blocks = template.blocks.map((block) => {
    const content = block.content.map((c) => {
      let text = c.text;
      for (const [key, value] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{{${key}}}`, "g"), value);
      }
      return { ...c, text };
    });

    return {
      ...block,
      id: generateId(8),
      content,
      createdAt: now,
      updatedAt: now,
    };
  });

  return createEnhancedDocument("document", {
    title: template.name,
    blocks,
    properties: { templateId: template.id },
  });
}

/**
 * Extract a template from an existing document.
 */
export function extractTemplate(
  doc: EnhancedDocument,
  name: string,
  options: { description?: string; category?: string } = {}
): DocumentTemplate {
  const now = Date.now();

  return {
    id: generateId(8),
    name,
    description: options.description,
    blocks: doc.blocks.map((b) => ({ ...b, id: generateId(8) })),
    category: options.category,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Cross-document Link Helpers
// ============================================================================

/**
 * Create a link to another document.
 */
export function createDocumentLink(
  targetDocId: string,
  options: { targetBlockId?: string; label?: string; type?: DocumentLink["type"] } = {}
): DocumentLink {
  return {
    id: generateId(8),
    targetDocId,
    targetBlockId: options.targetBlockId,
    label: options.label,
    type: options.type ?? "reference",
    createdAt: Date.now(),
  };
}

/**
 * Find all outgoing links in a document.
 */
export function getDocumentLinks(doc: EnhancedDocument): DocumentLink[] {
  const links: DocumentLink[] = [];

  for (const block of doc.blocks) {
    // Check meta for stored links
    if (block.meta?.links && Array.isArray(block.meta.links)) {
      links.push(...(block.meta.links as DocumentLink[]));
    }
  }

  return links;
}

// ============================================================================
// Collaboration Helpers
// ============================================================================

/**
 * Create a new presence object for a user.
 */
export function createPresence(
  userId: string,
  options: { userName?: string; avatarUrl?: string; color?: string } = {}
): UserPresence {
  const colors = [
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#818cf8",
    "#e879f9",
  ];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];

  return {
    userId,
    userName: options.userName,
    avatarUrl: options.avatarUrl,
    color: options.color ?? randomColor,
    lastActiveAt: Date.now(),
    isTyping: false,
  };
}

/**
 * Update cursor position for a user.
 */
export function updatePresenceCursor(
  presence: UserPresence,
  blockId: string,
  offset: number
): UserPresence {
  return {
    ...presence,
    cursor: { blockId, offset },
    lastActiveAt: Date.now(),
  };
}

/**
 * Update selection for a user.
 */
export function updatePresenceSelection(
  presence: UserPresence,
  blockId: string,
  from: number,
  to: number
): UserPresence {
  return {
    ...presence,
    selection: { blockId, from, to },
    lastActiveAt: Date.now(),
  };
}

// ============================================================================
// LFCC 0.9.1 AI Native Helpers
// ============================================================================

/**
 * Create an EditIntent for AI operations.
 */
export function createEditIntent(
  category: EditIntent["category"],
  description: string,
  options: {
    action?: string;
    parent_intent_id?: string;
    step_index?: number;
    total_steps?: number;
  } = {}
): EditIntent {
  return {
    id: generateId(8),
    category,
    description: { short: description },
    structured: options.action ? { action: options.action } : undefined,
    chain:
      options.parent_intent_id || options.step_index
        ? {
            parent_intent_id: options.parent_intent_id,
            step_index: options.step_index,
            total_steps: options.total_steps,
          }
        : undefined,
  };
}

/**
 * Create AIProvenance for content traceability.
 */
export function createAIProvenance(
  model_id: string,
  options: {
    model_version?: string;
    prompt_hash?: string;
    prompt_template_id?: string;
    temperature?: number;
    input_context_hashes?: string[];
    rationale_summary?: string;
  } = {}
): AIProvenance {
  return {
    model_id,
    model_version: options.model_version,
    prompt_hash: options.prompt_hash,
    prompt_template_id: options.prompt_template_id,
    temperature: options.temperature,
    input_context_hashes: options.input_context_hashes,
    rationale_summary: options.rationale_summary,
  };
}

/**
 * Create BlockProvenance for AI-generated content.
 */
export function createBlockProvenance(
  agent_id: string,
  model_id: string,
  op_code: AIOpCode,
  options: { intent_id?: string; confidence?: number } = {}
): BlockProvenance {
  return {
    origin: "ai",
    ai_generations: [
      {
        generation_id: generateId(8),
        timestamp: Date.now(),
        agent: { agent_id, model_id },
        operation: { op_code, intent_id: options.intent_id },
        quality_signals: options.confidence ? { confidence: options.confidence } : undefined,
      },
    ],
    review_status: "pending",
  };
}

/**
 * Create a fully tracked AIContext for AI operations.
 */
export function createTrackedAIContext(
  op_code: AIOpCode,
  model: string,
  options: { agent_id?: string; intent?: EditIntent; confidence?: number; provider?: string } = {}
): AIContext {
  return {
    model,
    provider: options.provider,
    op_code,
    agent_id: options.agent_id,
    intent_id: options.intent?.id,
    intent: options.intent,
    confidence: options.confidence,
    provenance: createAIProvenance(model),
  };
}

// ============================================================================
// Document Utilities
// ============================================================================

/**
 * Extract plain text from blocks.
 */
export function extractPlainText(blocks: EnhancedBlock[]): string {
  return blocks.map((block) => block.content.map((c) => c.text).join("")).join("\n\n");
}

/**
 * Count tokens (approximate).
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Extract outline from document headings.
 */
export function extractOutline(doc: EnhancedDocument): OutlineNode[] {
  const outline: OutlineNode[] = [];
  const stack: OutlineNode[] = [];

  for (const block of doc.blocks) {
    if (block.type === "heading") {
      const level = block.attrs.level ?? 1;
      const title = block.content.map((c) => c.text).join("");
      const node: OutlineNode = {
        id: generateId(6),
        title,
        level,
        blockId: block.id,
        children: [],
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        outline.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }

      stack.push(node);
    }
  }

  return outline;
}

/**
 * Get messages in chat format for AI API.
 */
export function toAIMessages(doc: EnhancedDocument): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  if (doc.systemPrompt) {
    messages.push({ role: "system", content: doc.systemPrompt });
  }

  if (doc.mode === "document") {
    const content = formatBlocksToMarkdown(doc.blocks);
    if (content.trim().length > 0) {
      messages.push({ role: "user", content });
    }
    return messages;
  }

  const messageBlocks = listMessages(doc);
  for (const block of messageBlocks) {
    const role = block.message?.role ?? "user";
    messages.push({ role, content: getMessageText(block) });
  }

  if (doc.mode === "hybrid") {
    const nonMessageBlocks = doc.blocks.filter(
      (block) => block.type !== "message" && !block.message
    );
    const context = formatBlocksToMarkdown(nonMessageBlocks);
    if (context.trim().length > 0) {
      messages.push({ role: "system", content: `Document context:\n${context}` });
    }
  }

  return messages;
}

/**
 * Calculate total tokens used in document.
 */
export function calculateTotalTokens(doc: EnhancedDocument): {
  input: number;
  output: number;
  total: number;
} {
  let input = 0;
  let output = 0;

  for (const block of doc.blocks) {
    if (block.aiContext?.tokens) {
      input += block.aiContext.tokens.input;
      output += block.aiContext.tokens.output;
    }
  }

  return { input, output, total: input + output };
}

/**
 * Find block by ID.
 */
export function findBlock(doc: EnhancedDocument, blockId: string): EnhancedBlock | undefined {
  return doc.blocks.find((b) => b.id === blockId);
}

/**
 * Find message by message ID.
 */
export function findMessage(doc: EnhancedDocument, messageId: string): EnhancedBlock | undefined {
  return doc.blocks.find((b) => b.message?.messageId === messageId);
}

// ============================================================================
// Interchange & Import
// ============================================================================

const CRDT_MARK_TYPES = new Set<MarkType>([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
]);

function toCrdtMark(mark: TextMark): NonNullable<TextSpan["marks"]>[number] | null {
  if (!CRDT_MARK_TYPES.has(mark.type as MarkType)) {
    return null;
  }
  return {
    type: mark.type as MarkType,
    ...(mark.attrs ? { attrs: mark.attrs } : {}),
  };
}

function contentToRichText(content: RichTextContent[]): { text: string; richText?: RichText } {
  const text = joinContentText(content);
  const spans: RichText = [];
  let hasMarks = false;

  for (const entry of content) {
    const marks = (entry.marks ?? [])
      .map((mark) => toCrdtMark(mark))
      .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark));

    if (marks.length > 0) {
      hasMarks = true;
    }

    spans.push({
      text: entry.text,
      ...(marks.length > 0 ? { marks } : {}),
    });
  }

  return { text, richText: hasMarks ? spans : undefined };
}

function richTextToContent(
  richText: RichText | undefined,
  fallbackText?: string
): RichTextContent[] {
  if (richText && richText.length > 0) {
    return richText.map((span) => ({
      text: span.text,
      ...(span.marks && span.marks.length > 0
        ? { marks: span.marks.map((mark) => ({ type: mark.type, attrs: mark.attrs })) }
        : {}),
    }));
  }

  if (fallbackText && fallbackText.length > 0) {
    return [{ text: fallbackText }];
  }

  return [];
}

function normalizeBlockAttrs(attrs: Record<string, unknown>): BlockAttrs {
  const normalized: BlockAttrs = {};

  for (const [key, value] of Object.entries(attrs)) {
    switch (key) {
      case "list_type":
        if (value === "bullet" || value === "ordered" || value === "task") {
          normalized.listType = value;
        }
        break;
      case "indent_level":
        if (typeof value === "number") {
          normalized.indentLevel = value;
        }
        break;
      case "task_checked":
        normalized.checked = value === true;
        break;
      case "role":
      case "message_id":
      case "timestamp":
      case "streaming":
      case "model":
        break;
      default:
        normalized[key] = value;
        break;
    }
  }

  return normalized;
}

function resolveEnhancedType(kind: BlockKind, attrs: Record<string, unknown>): BlockType {
  if (kind === "code") {
    return "code_block";
  }
  if (kind === "horizontal_rule") {
    return "divider";
  }
  if (kind === "message") {
    return "message";
  }
  if (kind === "paragraph") {
    const listType = attrs.list_type;
    if (listType === "task") {
      return "task_item";
    }
    if (listType === "bullet" || listType === "ordered") {
      return "list_item";
    }
  }

  return kind as BlockType;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: markdown AST traversal
function buildCrdtAttrs(block: EnhancedBlock): string {
  const { listType, indentLevel, checked, ...rest } = block.attrs;
  const attrs: Record<string, unknown> = { ...rest };

  const resolvedListType =
    listType ??
    (block.type === "task_item" ? "task" : block.type === "list_item" ? "bullet" : undefined);

  if (resolvedListType) {
    attrs.list_type = resolvedListType;
  }
  if (typeof indentLevel === "number") {
    attrs.indent_level = indentLevel;
  }
  if (resolvedListType === "task" || block.type === "task_item") {
    attrs.task_checked = checked === true;
  }

  if (block.type === "message") {
    const message = block.message;
    attrs.role = message?.role ?? "assistant";
    attrs.message_id = message?.messageId ?? block.id;
    attrs.timestamp = message?.timestamp ?? 0;
    if (block.status === "streaming") {
      attrs.streaming = true;
    }
    const model = message?.ai?.model ?? block.aiContext?.model;
    if (model) {
      attrs.model = model;
    }
  }

  return serializeAttrs(attrs);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: markdown AST traversal
function blockNodeToEnhancedBlock(node: BlockNode, timestamp: number): EnhancedBlock {
  const parsedAttrs = parseAttrs(node.attrs);
  const type = resolveEnhancedType(node.type, parsedAttrs);
  const content = richTextToContent(node.richText, node.text);
  const attrs = normalizeBlockAttrs(parsedAttrs);
  const children =
    node.children.length > 0
      ? node.children.map((child) => blockNodeToEnhancedBlock(child, timestamp))
      : undefined;

  let message: MessageMetadata | undefined;
  let status: BlockStatus = "complete";
  let aiContext: AIContext | undefined;

  if (node.type === "message") {
    const role =
      parsedAttrs.role === "user" ||
      parsedAttrs.role === "assistant" ||
      parsedAttrs.role === "system" ||
      parsedAttrs.role === "tool"
        ? (parsedAttrs.role as MessageRole)
        : "assistant";
    const messageId = typeof parsedAttrs.message_id === "string" ? parsedAttrs.message_id : node.id;
    const timestampValue = typeof parsedAttrs.timestamp === "number" ? parsedAttrs.timestamp : 0;
    const model = typeof parsedAttrs.model === "string" ? parsedAttrs.model : undefined;

    message = {
      role,
      messageId,
      timestamp: timestampValue,
      ...(model ? { ai: { model } } : {}),
    };

    if (parsedAttrs.streaming === true) {
      status = "streaming";
    }
    if (model) {
      aiContext = { model };
    }
  }

  return {
    id: node.id,
    type,
    content,
    attrs,
    status,
    ...(children ? { children } : {}),
    ...(message ? { message } : {}),
    ...(aiContext ? { aiContext } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function enhancedBlockToBlockNode(block: EnhancedBlock): BlockNode {
  const kind = resolveBlockKind(block.type);
  const attrs = buildCrdtAttrs(block);

  const isContainer = isContainerBlock(kind);
  const children = isContainer ? resolveContainerChildren(block, kind) : [];

  const { text, richText } = contentToRichText(block.content);

  return {
    id: block.id,
    type: kind,
    attrs,
    text: isContainer ? undefined : text,
    richText,
    children,
  };
}

function resolveBlockKind(type: BlockType): BlockKind {
  switch (type) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return "heading";
    case "quote":
      return "quote";
    case "code_block":
      return "code";
    case "divider":
      return "horizontal_rule";
    case "message":
      return "message";
    case "list_item":
    case "task_item":
      return "paragraph";
    case "table":
      return "table";
    case "table_row":
      return "table_row";
    case "table_cell":
      return "table_cell";
    case "image":
      return "image";
    case "video":
      return "video";
    case "embed":
      return "embed";
    default:
      return "paragraph";
  }
}

function resolveContainerChildren(block: EnhancedBlock, kind: BlockKind): BlockNode[] {
  if (block.children && block.children.length > 0) {
    return block.children.map(enhancedBlockToBlockNode);
  }

  if (kind === "message" || kind === "quote") {
    return [createFallbackParagraph(block)];
  }

  return [];
}

function createFallbackParagraph(block: EnhancedBlock): BlockNode {
  const { text, richText } = contentToRichText(block.content);
  return {
    id: `${block.id}_content`,
    type: "paragraph",
    attrs: serializeAttrs({}),
    text,
    richText,
    children: [],
  };
}

function pushRichTextSpan(spans: RichTextContent[], text: string, marks: TextMark[]): void {
  if (!text) {
    return;
  }
  spans.push({ text, ...(marks.length > 0 ? { marks: [...marks] } : {}) });
}

function appendInlineNode(node: ASTNode, activeMarks: TextMark[], spans: RichTextContent[]): void {
  switch (node.type) {
    case "text":
      pushRichTextSpan(spans, node.content ?? "", activeMarks);
      return;
    case "hard_break":
      pushRichTextSpan(spans, "\n", activeMarks);
      return;
    case "strong":
      appendInlineWithMark(node, activeMarks, spans, { type: "bold" });
      return;
    case "emphasis":
      appendInlineWithMark(node, activeMarks, spans, { type: "italic" });
      return;
    case "code":
      appendInlineWithMark(node, activeMarks, spans, { type: "code" });
      return;
    case "strikethrough":
      appendInlineWithMark(node, activeMarks, spans, { type: "strike" });
      return;
    case "link":
      appendInlineWithMark(node, activeMarks, spans, {
        type: "link",
        attrs: node.attrs ?? {},
      });
      return;
    default:
      break;
  }

  if (node.children) {
    for (const child of node.children) {
      appendInlineNode(child, activeMarks, spans);
    }
  } else if (node.content) {
    pushRichTextSpan(spans, node.content, activeMarks);
  }
}

function appendInlineWithMark(
  node: ASTNode,
  activeMarks: TextMark[],
  spans: RichTextContent[],
  mark: TextMark
): void {
  const nextMarks = [...activeMarks, mark];
  if (node.children) {
    for (const child of node.children) {
      appendInlineNode(child, nextMarks, spans);
    }
    return;
  }
  if (node.content) {
    pushRichTextSpan(spans, node.content, nextMarks);
  }
}

function inlineAstToRichText(nodes: ASTNode[]): RichTextContent[] {
  const spans: RichTextContent[] = [];
  for (const node of nodes) {
    appendInlineNode(node, [], spans);
  }
  return spans;
}

function createRichTextBlock(
  type: BlockType,
  content: RichTextContent[],
  attrs: Partial<BlockAttrs> = {}
): EnhancedBlock {
  const now = Date.now();
  return {
    id: generateId(8),
    type,
    content,
    attrs: attrs as BlockAttrs,
    status: "complete",
    createdAt: now,
    updatedAt: now,
  };
}

function createContainerBlock(
  type: BlockType,
  children: EnhancedBlock[],
  attrs: Partial<BlockAttrs> = {}
): EnhancedBlock {
  const now = Date.now();
  return {
    id: generateId(8),
    type,
    content: [],
    attrs: attrs as BlockAttrs,
    status: "complete",
    children,
    createdAt: now,
    updatedAt: now,
  };
}

function astToEnhancedBlock(node: ASTNode): EnhancedBlock | null {
  switch (node.type) {
    case "paragraph":
      return createRichTextBlock("paragraph", inlineAstToRichText(node.children ?? []));
    case "heading": {
      const rawLevel = typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const level = Math.max(1, Math.min(6, rawLevel)) as 1 | 2 | 3 | 4 | 5 | 6;
      return createRichTextBlock("heading", inlineAstToRichText(node.children ?? []), {
        level,
      });
    }
    case "blockquote":
      return createRichTextBlock("quote", inlineAstToRichText(node.children ?? []));
    case "code_block":
      return createRichTextBlock("code_block", [{ text: node.content ?? "" }], {
        language: typeof node.attrs?.language === "string" ? node.attrs.language : undefined,
      });
    case "horizontal_rule":
      return createRichTextBlock("divider", []);
    case "list_item":
      return createRichTextBlock("list_item", inlineAstToRichText(node.children ?? []), {
        listType: (() => {
          const listType = node.attrs?.listType;
          return listType === "ordered" || listType === "bullet" ? listType : "bullet";
        })(),
      });
    case "task_item":
      return createRichTextBlock("task_item", inlineAstToRichText(node.children ?? []), {
        listType: "task",
        checked: node.attrs?.checked === true,
      });
    case "table":
      return createContainerBlock(
        "table",
        (node.children ?? [])
          .map(astToEnhancedBlock)
          .filter((child): child is EnhancedBlock => Boolean(child))
      );
    case "table_row":
      return createContainerBlock(
        "table_row",
        (node.children ?? [])
          .map(astToEnhancedBlock)
          .filter((child): child is EnhancedBlock => Boolean(child))
      );
    case "table_cell":
      return createRichTextBlock("table_cell", inlineAstToRichText(node.children ?? []));
    default:
      return null;
  }
}

/**
 * Convert a CRDT block tree into an EnhancedDocument.
 */
export function blockTreeToEnhancedDocument(
  blocks: BlockNode[],
  options: Partial<EnhancedDocument> = {}
): EnhancedDocument {
  const now = Date.now();
  const convertedBlocks = blocks.map((block) => blockNodeToEnhancedBlock(block, now));

  const hasMessage = convertedBlocks.some((block) => block.type === "message");
  const hasNonMessage = convertedBlocks.some((block) => block.type !== "message");
  const mode = options.mode ?? (hasMessage ? (hasNonMessage ? "hybrid" : "chat") : "document");

  return createEnhancedDocument(mode, {
    ...options,
    blocks: convertedBlocks,
  });
}

/**
 * Convert an EnhancedDocument to a CRDT block tree.
 */
export function enhancedDocumentToBlockTree(doc: EnhancedDocument): BlockNode[] {
  return doc.blocks.map((block) => enhancedBlockToBlockNode(block));
}

/**
 * Import markdown content into EnhancedDocument blocks.
 */
export function importMarkdownToBlocks(markdown: string): EnhancedBlock[] {
  const parser = createStreamingParser({ gfm: true });
  const initial = parser.push(markdown);
  const flushed = parser.flush();
  const nodes = [...initial.nodes, ...flushed.nodes];
  return nodes.map(astToEnhancedBlock).filter((block): block is EnhancedBlock => Boolean(block));
}

/**
 * Import markdown content into an EnhancedDocument.
 */
export function importMarkdownToEnhancedDocument(
  markdown: string,
  options: Partial<EnhancedDocument> = {}
): EnhancedDocument {
  const blocks = importMarkdownToBlocks(markdown);
  return createEnhancedDocument(options.mode ?? "document", {
    ...options,
    blocks,
  });
}

// ============================================================================
// Mode Conversion
// ============================================================================

/**
 * Convert chat to document mode.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mode conversion
export function chatToDocument(doc: EnhancedDocument): EnhancedDocument {
  if (doc.mode !== "chat") {
    return doc;
  }

  const now = Date.now();
  const convertedBlocks: EnhancedBlock[] = [];

  for (const block of doc.blocks) {
    if (!block.message) {
      convertedBlocks.push(block);
      continue;
    }

    const messageText = getMessageText(block);
    if (block.message.role === "user") {
      convertedBlocks.push({
        ...block,
        type: "quote",
        content: messageText.length > 0 ? [{ text: messageText }] : [],
        message: undefined,
        status: "complete",
        updatedAt: now,
      });
      continue;
    }

    if (block.children && block.children.length > 0) {
      for (const child of block.children) {
        convertedBlocks.push({
          ...child,
          message: undefined,
          updatedAt: now,
        });
      }
      continue;
    }

    convertedBlocks.push({
      ...block,
      type: "paragraph",
      content: messageText.length > 0 ? [{ text: messageText }] : [],
      message: undefined,
      status: "complete",
      children: undefined,
      updatedAt: now,
    });
  }

  return {
    ...doc,
    mode: "document",
    blocks: convertedBlocks,
    outline: extractOutline({ ...doc, blocks: convertedBlocks }),
    updatedAt: now,
    version: doc.version + 1,
  };
}

/**
 * Convert document to chat mode.
 */
export function documentToChat(doc: EnhancedDocument): EnhancedDocument {
  if (doc.mode !== "document") {
    return doc;
  }

  const now = Date.now();
  const chatBlocks: EnhancedBlock[] = doc.blocks.map((block, index) => {
    const messageId = generateId(8);
    const childBlock: EnhancedBlock = {
      ...block,
      message: undefined,
      updatedAt: now,
    };
    const messageText = getBlockText(block);

    return {
      id: generateId(8),
      type: "message",
      content: messageText.length > 0 ? [{ text: messageText }] : [],
      children: [childBlock],
      attrs: {},
      status: "complete",
      message: {
        role: "assistant",
        messageId,
        timestamp: now + index,
      },
      createdAt: now,
      updatedAt: now,
    };
  });

  return {
    ...doc,
    mode: "chat",
    blocks: chatBlocks,
    threadId: doc.threadId ?? generateId(8),
    updatedAt: now,
    version: doc.version + 1,
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize document to JSON.
 */
export function serializeDocument(doc: EnhancedDocument): string {
  return JSON.stringify(doc);
}

/**
 * Deserialize document from JSON.
 */
export function deserializeDocument(json: string): EnhancedDocument {
  return JSON.parse(json) as EnhancedDocument;
}

/**
 * Format a single block to markdown.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: markdown formatting requires many cases
function formatBlockToMarkdown(block: EnhancedBlock): string {
  const text = getBlockText(block);
  const listType = block.attrs.listType;

  switch (block.type) {
    case "heading": {
      const level = block.attrs.level ?? 1;
      return `${"#".repeat(level)} ${text}`;
    }
    case "paragraph":
      if (listType === "ordered") {
        return `1. ${text}`;
      }
      if (listType === "bullet") {
        return `- ${text}`;
      }
      if (listType === "task") {
        return `- [${block.attrs.checked ? "x" : " "}] ${text}`;
      }
      return text;
    case "quote":
      return text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "code_block":
      return `\`\`\`${block.attrs.language ?? ""}\n${text}\n\`\`\``;
    case "list_item":
      if (block.attrs.listType === "ordered") {
        return `1. ${text}`;
      }
      return `- ${text}`;
    case "task_item":
      return `- [${block.attrs.checked ? "x" : " "}] ${text}`;
    case "divider":
      return "---";
    case "message": {
      const messageText = getMessageText(block);
      if (block.message?.role === "user") {
        return `**User:** ${messageText}`;
      }
      if (block.message?.role === "assistant") {
        return `**Assistant:** ${messageText}`;
      }
      return messageText;
    }
    default:
      return text;
  }
}

function formatBlocksToMarkdown(blocks: EnhancedBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    lines.push(formatBlockToMarkdown(block), "");
  }

  return lines.join("\n").trim();
}

/**
 * Export document to markdown.
 */
export function exportToMarkdown(doc: EnhancedDocument): string {
  const lines: string[] = [];

  if (doc.title) {
    lines.push(`# ${doc.title}`, "");
  }

  const content = formatBlocksToMarkdown(doc.blocks);
  if (content.length > 0) {
    lines.push(content);
  }

  return lines.join("\n").trim();
}
