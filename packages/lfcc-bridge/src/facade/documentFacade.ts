/**
 * LFCC DocumentFacade Implementation
 *
 * Single-authority document access layer. All UI interactions go through this facade.
 * Direct Loro access (doc.getMap/getList) bypasses validation and audit.
 */

import {
  readAllAnnotations,
  readAnnotation as readAnnotationFromSchema,
} from "../annotations/annotationSchema";
import {
  type BlockKind,
  type BlockNode,
  type RichText,
  ensureBlockMap,
  getRootBlocks,
  nextBlockId,
  parseAttrs,
  readBlockTree,
  serializeAttrs,
  updateBlockText,
} from "../crdt/crdtSchema";
import { LoroList, type LoroRuntime } from "../runtime/loroRuntime";
import type {
  AIContext,
  AIWriteMetadata,
  AddCommentIntent,
  AnnotationNode,
  AppendStreamChunkIntent,
  ApplyPlan,
  Comment,
  DeleteBlockIntent,
  DeleteCommentIntent,
  DocumentFacade,
  FacadeChangeEvent,
  FacadeSubscriber,
  InsertBlockIntent,
  InsertMessageIntent,
  MessageBlock,
  MessageRole,
  MessageStatus,
  MoveBlockIntent,
  UpdateAttrsIntent,
  UpdateContentIntent,
  UpdateMessageIntent,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const COMMENTS_KEY = "comments";

// ============================================================================
// Implementation
// ============================================================================

/**
 * Default DocumentFacade implementation backed by LoroRuntime.
 */
export class LoroDocumentFacade implements DocumentFacade {
  private readonly runtime: LoroRuntime;
  private readonly subscribers: Set<FacadeSubscriber> = new Set();
  private cachedBlocks: BlockNode[] | null = null;
  private unsubscribeLoroChanges: (() => void) | null = null;

  constructor(runtime: LoroRuntime) {
    this.runtime = runtime;
    this.setupLoroSubscription();
  }

  // ============================================================================
  // Document Identity
  // ============================================================================

  get docId(): string {
    return this.runtime.docId;
  }

  // ============================================================================
  // Block Tree Query API
  // ============================================================================

  getBlocks(): BlockNode[] {
    // Invalidate cache and re-read from Loro
    this.cachedBlocks = readBlockTree(this.runtime.doc);
    return this.cachedBlocks;
  }

  getBlock(blockId: string): BlockNode | undefined {
    return this.findBlockById(this.getBlocks(), blockId);
  }

  getBlockText(blockId: string): string {
    const block = this.getBlock(blockId);
    return block?.text ?? "";
  }

  getBlockRichText(blockId: string): RichText | undefined {
    const block = this.getBlock(blockId);
    return block?.richText;
  }

  getBlockAttrs(blockId: string): Record<string, unknown> {
    const block = this.getBlock(blockId);
    return parseAttrs(block?.attrs);
  }

  findBlock(predicate: (block: BlockNode) => boolean): BlockNode | undefined {
    return this.findBlockByPredicate(this.getBlocks(), predicate);
  }

  // ============================================================================
  // Subscription API
  // ============================================================================

  subscribe(callback: FacadeSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // ============================================================================
  // Intent-Based Mutation API
  // ============================================================================

  insertBlock(intent: InsertBlockIntent): string {
    const { parentId, index, type, text, richText, attrs, origin } = intent;
    const doc = this.runtime.doc;
    const blockId = nextBlockId(doc);

    if (parentId === null) {
      // Insert at root level
      const root = getRootBlocks(doc);
      root.insert(index, blockId);
    } else {
      // Insert as child of parent
      const parentMap = ensureBlockMap(doc, parentId);
      const children = parentMap.getOrCreateContainer("children", new LoroList()) as unknown as {
        insert: (index: number, value: string) => void;
      };
      children.insert(index, blockId);
    }

    // Initialize block
    const blockMap = ensureBlockMap(doc, blockId);
    blockMap.set("type", type);
    blockMap.set("attrs", serializeAttrs(attrs ?? {}));

    if (text !== undefined || richText !== undefined) {
      updateBlockText(doc, blockId, text ?? "", richText);
    }

    this.runtime.commit(origin ?? "facade:insert");
    this.invalidateCache();
    this.emit({
      type: "block_inserted",
      blockIds: [blockId],
      source: "local",
      metadata: { origin },
    });

    return blockId;
  }

  updateBlockContent(intent: UpdateContentIntent): void {
    const { blockId, text, richText, textDelta, origin } = intent;
    const doc = this.runtime.doc;

    updateBlockText(doc, blockId, text ?? "", richText, textDelta ? { textDelta } : undefined);

    this.runtime.commit(origin ?? "facade:update-content");
    this.invalidateCache();
    this.emit({
      type: "content_changed",
      blockIds: [blockId],
      source: "local",
      metadata: { origin },
    });
  }

  updateBlockAttrs(intent: UpdateAttrsIntent): void {
    const { blockId, attrs, origin } = intent;
    const doc = this.runtime.doc;

    const blockMap = ensureBlockMap(doc, blockId);
    const currentAttrs = parseAttrs(blockMap.get("attrs") as string | undefined);
    const newAttrs = { ...currentAttrs, ...attrs };
    blockMap.set("attrs", serializeAttrs(newAttrs));

    this.runtime.commit(origin ?? "facade:update-attrs");
    this.invalidateCache();
    this.emit({
      type: "block_updated",
      blockIds: [blockId],
      source: "local",
      metadata: { origin },
    });
  }

  deleteBlock(intent: DeleteBlockIntent): void {
    const { blockId, origin } = intent;
    const doc = this.runtime.doc;

    // Find and remove from parent
    const blocks = this.getBlocks();
    const parentInfo = this.findParentOf(blocks, blockId);

    if (parentInfo) {
      const { parent, index } = parentInfo;
      if (parent === null) {
        // Remove from root
        const root = getRootBlocks(doc);
        root.delete(index, 1);
      } else {
        // Remove from parent's children
        const parentMap = ensureBlockMap(doc, parent.id);
        const children = parentMap.getOrCreateContainer("children", new LoroList()) as unknown as {
          delete: (index: number, count: number) => void;
        };
        children.delete(index, 1);
      }
    }

    this.runtime.commit(origin ?? "facade:delete");
    this.invalidateCache();
    this.emit({
      type: "block_deleted",
      blockIds: [blockId],
      source: "local",
      metadata: { origin },
    });
  }

  moveBlock(intent: MoveBlockIntent): void {
    const { blockId, newParentId, newIndex, origin } = intent;

    // Delete from current position
    this.deleteBlock({ blockId, origin: `${origin ?? "facade:move"}-delete` });

    // Get the block data before deletion (need to re-read)
    const block = this.getBlock(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found after delete`);
    }

    // Re-insert at new position
    // Note: This is a simplified implementation. Full implementation would preserve block data.
    this.insertBlock({
      parentId: newParentId,
      index: newIndex,
      type: block.type,
      text: block.text,
      richText: block.richText,
      attrs: parseAttrs(block.attrs),
      origin: `${origin ?? "facade:move"}-insert`,
    });
  }

  // ============================================================================
  // AI Gateway Integration
  // ============================================================================

  async applyAIPlan(plan: ApplyPlan, metadata: AIWriteMetadata): Promise<void> {
    // Validate required metadata
    if (!metadata.requestId) {
      throw new Error("AI write requires requestId for idempotency");
    }
    if (!metadata.agentId) {
      throw new Error("AI write requires agentId for audit");
    }

    // Mark origin with AI Gateway metadata
    const origin = `ai-gateway:${metadata.agentId}:${metadata.requestId}`;

    // Apply each operation
    for (const op of plan.operations) {
      switch (op.type) {
        case "replace": {
          // Find block by span_id (format: blockId or annotationId:blockId:start:end)
          const blockId = this.resolveSpanToBlockId(op.span_id);
          if (blockId && op.content) {
            const text = this.extractTextFromCanonNode(op.content);
            this.updateBlockContent({
              blockId,
              text,
              origin,
            });
          }
          break;
        }
        case "insert": {
          // Insert new block from canonical tree
          if (op.content) {
            const text = this.extractTextFromCanonNode(op.content);
            const type = this.resolveBlockTypeFromCanonNode(op.content);
            this.insertBlock({
              parentId: null,
              index: this.getBlocks().length, // Append at end
              type,
              text,
              origin,
            });
          }
          break;
        }
        case "delete": {
          const blockId = this.resolveSpanToBlockId(op.span_id);
          if (blockId) {
            this.deleteBlock({ blockId, origin });
          }
          break;
        }
      }
    }

    this.runtime.commit(origin);
    this.invalidateCache();
    this.emit({
      type: "content_changed",
      blockIds: plan.affected_block_ids,
      source: "ai",
      metadata: {
        requestId: metadata.requestId,
        agentId: metadata.agentId,
        intentId: metadata.intentId,
        origin,
      },
    });
  }

  /**
   * Resolve span_id to block ID.
   * Supports formats: "blockId" or "annotationId:blockId:start:end"
   */
  private resolveSpanToBlockId(spanId: string): string | null {
    if (!spanId) {
      return null;
    }
    const parts = spanId.split(":");
    if (parts.length >= 2) {
      // Format: annotationId:blockId:start:end
      return parts[1];
    }
    // Assume direct block ID
    const block = this.getBlock(spanId);
    return block ? spanId : null;
  }

  /**
   * Extract plain text from CanonNode tree.
   */
  private extractTextFromCanonNode(node: unknown): string {
    if (!node || typeof node !== "object") {
      return "";
    }
    const n = node as { text?: string; children?: unknown[] };
    let text = n.text ?? "";
    if (n.children && Array.isArray(n.children)) {
      for (const child of n.children) {
        text += this.extractTextFromCanonNode(child);
      }
    }
    return text;
  }

  /**
   * Resolve block type from CanonNode.
   */
  private resolveBlockTypeFromCanonNode(node: unknown): BlockKind {
    if (!node || typeof node !== "object") {
      return "paragraph";
    }
    const n = node as { type?: string };
    const type = n.type ?? "paragraph";
    const validTypes: BlockKind[] = [
      "paragraph",
      "heading",
      "quote",
      "code",
      "horizontal_rule",
      "table",
      "table_row",
      "table_cell",
      "image",
      "video",
      "embed",
      "message",
    ];
    return validTypes.includes(type as BlockKind) ? (type as BlockKind) : "paragraph";
  }

  // ============================================================================
  // Annotation API
  // ============================================================================

  getAnnotations(): AnnotationNode[] {
    const stored = readAllAnnotations(this.runtime.doc);
    return stored.map((record) => ({
      id: record.id,
      type: "highlight",
      spans: record.spans.map((s) => ({
        blockId: s.blockId,
        start: s.start,
        end: s.end,
      })),
      attrs: {
        content: record.content,
        color: record.color,
        state: record.storedState,
      },
      createdAt: record.createdAtMs,
      updatedAt: record.updatedAtMs,
    }));
  }

  getAnnotation(annotationId: string): AnnotationNode | undefined {
    const record = readAnnotationFromSchema(this.runtime.doc, annotationId);
    if (!record || record.storedState === "deleted") {
      return undefined;
    }
    return {
      id: record.id,
      type: "highlight",
      spans: record.spans.map((s) => ({
        blockId: s.blockId,
        start: s.start,
        end: s.end,
      })),
      attrs: {
        content: record.content,
        color: record.color,
        state: record.storedState,
      },
      createdAt: record.createdAtMs,
      updatedAt: record.updatedAtMs,
    };
  }

  // ============================================================================
  // Comment API
  // ============================================================================

  getComments(annotationId: string): Comment[] {
    const doc = this.runtime.doc;
    const commentsMap = doc.getMap(COMMENTS_KEY);
    const list = commentsMap.get(annotationId);

    if (!list || typeof list !== "object" || !("toArray" in list)) {
      return [];
    }

    const comments: Comment[] = [];
    const rawList = list as { toArray: () => unknown[] };
    for (const item of rawList.toArray()) {
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item) as Comment;
          if (parsed.id && parsed.annotationId && parsed.text) {
            comments.push(parsed);
          }
        } catch {
          // Skip malformed comments
        }
      }
    }
    return comments;
  }

  addComment(intent: AddCommentIntent): string {
    const { annotationId, text, author, origin } = intent;
    const doc = this.runtime.doc;
    const commentsMap = doc.getMap(COMMENTS_KEY);

    const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const comment: Comment = {
      id: commentId,
      annotationId,
      text,
      author: author ?? "Anonymous",
      createdAt: Date.now(),
    };

    const list = commentsMap.getOrCreateContainer(annotationId, new LoroList()) as unknown as {
      push: (value: string) => void;
    };
    list.push(JSON.stringify(comment));

    this.runtime.commit(origin ?? "facade:add-comment");
    this.emit({
      type: "comment_changed",
      blockIds: [],
      source: "local",
      metadata: { origin },
    });

    return commentId;
  }

  deleteComment(intent: DeleteCommentIntent): void {
    const { annotationId, commentId, origin } = intent;
    const doc = this.runtime.doc;
    const commentsMap = doc.getMap(COMMENTS_KEY);

    const list = commentsMap.get(annotationId);
    if (!list || typeof list !== "object" || !("toArray" in list)) {
      return;
    }

    const rawList = list as { toArray: () => unknown[]; delete: (i: number, c: number) => void };
    const items = rawList.toArray();
    const index = items.findIndex((item) => {
      if (typeof item === "string") {
        try {
          const parsed = JSON.parse(item) as Comment;
          return parsed.id === commentId;
        } catch {
          return false;
        }
      }
      return false;
    });

    if (index >= 0) {
      rawList.delete(index, 1);
      this.runtime.commit(origin ?? "facade:delete-comment");
      this.emit({
        type: "comment_changed",
        blockIds: [],
        source: "local",
        metadata: { origin },
      });
    }
  }

  // ============================================================================
  // Message API (AI Chat)
  // ============================================================================

  getMessages(): MessageBlock[] {
    const blocks = this.getBlocks();
    return this.collectMessages(blocks);
  }

  getMessage(messageId: string): MessageBlock | undefined {
    const block = this.getBlock(messageId);
    if (!block || block.type !== "message") {
      return undefined;
    }
    return this.blockToMessage(block);
  }

  insertMessage(intent: InsertMessageIntent): string {
    const { role, content, richText, parentId, aiContext, origin } = intent;

    const messageId = this.insertBlock({
      parentId: null,
      index: this.getBlocks().length,
      type: "message" as BlockKind,
      text: content ?? "",
      richText,
      attrs: {
        role,
        status: "complete",
        parentMessageId: parentId,
        aiContext: aiContext ? JSON.stringify(aiContext) : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      origin: origin ?? "facade:insert-message",
    });

    this.emit({
      type: "message_inserted",
      blockIds: [messageId],
      source: "local",
      metadata: { origin },
    });

    return messageId;
  }

  updateMessage(intent: UpdateMessageIntent): void {
    const { messageId, content, richText, status, aiContext, origin } = intent;

    if (content !== undefined || richText !== undefined) {
      this.updateBlockContent({
        blockId: messageId,
        text: content,
        richText,
        origin: origin ?? "facade:update-message",
      });
    }

    const attrsUpdate: Record<string, unknown> = { updatedAt: Date.now() };
    if (status !== undefined) {
      attrsUpdate.status = status;
    }
    if (aiContext !== undefined) {
      attrsUpdate.aiContext = JSON.stringify(aiContext);
    }

    this.updateBlockAttrs({
      blockId: messageId,
      attrs: attrsUpdate,
      origin: origin ?? "facade:update-message",
    });

    this.emit({
      type: "message_updated",
      blockIds: [messageId],
      source: "local",
      metadata: { origin },
    });
  }

  createStreamingMessage(role: MessageRole, aiContext?: AIContext): string {
    const messageId = this.insertBlock({
      parentId: null,
      index: this.getBlocks().length,
      type: "message" as BlockKind,
      text: "",
      attrs: {
        role,
        status: "streaming",
        aiContext: aiContext ? JSON.stringify(aiContext) : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      origin: "facade:create-streaming",
    });

    this.emit({
      type: "message_streaming",
      blockIds: [messageId],
      source: "local",
    });

    return messageId;
  }

  appendStreamChunk(intent: AppendStreamChunkIntent): void {
    const { messageId, chunk, isFinal, aiContext, origin } = intent;
    const block = this.getBlock(messageId);
    if (!block) {
      console.warn(`[Facade] appendStreamChunk: message ${messageId} not found`);
      return;
    }

    const currentText = block.text ?? "";
    const newText = currentText + chunk;

    this.updateBlockContent({
      blockId: messageId,
      text: newText,
      origin: origin ?? "facade:append-stream",
    });

    if (isFinal) {
      this.finalizeMessage(messageId, aiContext);
    } else {
      this.emit({
        type: "message_streaming",
        blockIds: [messageId],
        source: "local",
        metadata: { origin },
      });
    }
  }

  finalizeMessage(messageId: string, aiContext?: AIContext): void {
    const attrsUpdate: Record<string, unknown> = {
      status: "complete",
      updatedAt: Date.now(),
    };
    if (aiContext) {
      attrsUpdate.aiContext = JSON.stringify(aiContext);
    }

    this.updateBlockAttrs({
      blockId: messageId,
      attrs: attrsUpdate,
      origin: "facade:finalize-message",
    });

    this.emit({
      type: "message_updated",
      blockIds: [messageId],
      source: "local",
    });
  }

  // ============================================================================
  // Utility
  // ============================================================================

  commit(origin?: string): void {
    this.runtime.commit(origin ?? "facade:commit");
  }

  isDegraded(): boolean {
    return this.runtime.isDegraded();
  }

  /** Get the underlying runtime (for advanced use cases) */
  getRuntime(): LoroRuntime {
    return this.runtime;
  }

  /** Destroy facade and cleanup subscriptions */
  destroy(): void {
    this.subscribers.clear();
    if (this.unsubscribeLoroChanges) {
      this.unsubscribeLoroChanges();
      this.unsubscribeLoroChanges = null;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private setupLoroSubscription(): void {
    // Subscribe to local updates to invalidate cache
    this.unsubscribeLoroChanges = this.runtime.doc.subscribe(() => {
      this.invalidateCache();
    });
  }

  private invalidateCache(): void {
    this.cachedBlocks = null;
  }

  private emit(event: FacadeChangeEvent): void {
    for (const callback of this.subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.error("[Facade] Subscriber error:", error);
      }
    }
  }

  private findBlockById(blocks: BlockNode[], id: string): BlockNode | undefined {
    for (const block of blocks) {
      if (block.id === id) {
        return block;
      }
      const found = this.findBlockById(block.children, id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findBlockByPredicate(
    blocks: BlockNode[],
    predicate: (block: BlockNode) => boolean
  ): BlockNode | undefined {
    for (const block of blocks) {
      if (predicate(block)) {
        return block;
      }
      const found = this.findBlockByPredicate(block.children, predicate);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findParentOf(
    blocks: BlockNode[],
    blockId: string,
    parent: BlockNode | null = null
  ): { parent: BlockNode | null; index: number } | null {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.id === blockId) {
        return { parent, index: i };
      }
      const found = this.findParentOf(block.children, blockId, block);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private collectMessages(blocks: BlockNode[]): MessageBlock[] {
    const messages: MessageBlock[] = [];
    for (const block of blocks) {
      if (block.type === "message") {
        const msg = this.blockToMessage(block);
        if (msg) {
          messages.push(msg);
        }
      }
      // Recursively collect from children
      if (block.children.length > 0) {
        messages.push(...this.collectMessages(block.children));
      }
    }
    return messages;
  }

  private blockToMessage(block: BlockNode): MessageBlock | undefined {
    if (block.type !== "message") {
      return undefined;
    }

    const attrs = parseAttrs(block.attrs);
    let aiContext: AIContext | undefined;
    if (typeof attrs.aiContext === "string") {
      try {
        aiContext = JSON.parse(attrs.aiContext) as AIContext;
      } catch {
        // Ignore malformed AI context
      }
    }

    return {
      id: block.id,
      type: "message",
      role: (attrs.role as MessageRole) ?? "user",
      content: block.richText ?? [],
      text: block.text ?? "",
      status: (attrs.status as MessageStatus) ?? "complete",
      aiContext,
      parentId: attrs.parentMessageId as string | undefined,
      createdAt: (attrs.createdAt as number) ?? Date.now(),
      updatedAt: (attrs.updatedAt as number) ?? Date.now(),
    };
  }

  /**
   * Delete messages older than the given timestamp.
   * Returns the number of messages deleted.
   */
  deleteMessagesOlderThan(timestamp: number): number {
    const messages = this.getMessages();
    const toDelete = messages.filter((msg) => msg.createdAt < timestamp);

    for (const msg of toDelete) {
      this.deleteBlock({ blockId: msg.id, origin: "retention-policy" });
    }

    if (toDelete.length > 0) {
      this.runtime.commit("retention-policy");
      this.invalidateCache();
      this.emit({
        type: "content_changed",
        blockIds: toDelete.map((m) => m.id),
        source: "local",
      });
    }

    return toDelete.length;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a DocumentFacade for the given LoroRuntime.
 */
export function createDocumentFacade(runtime: LoroRuntime): DocumentFacade {
  return new LoroDocumentFacade(runtime);
}
